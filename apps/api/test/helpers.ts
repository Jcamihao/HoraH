import { DateTime } from 'luxon';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';

export const SENHA = 'Senha-forte-123';

export interface Ambiente {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  prisma: PrismaService;
  fechar: () => Promise<void>;
}

/** Sobe a API inteira (mesmo pipeline do main.ts) contra o banco de teste. */
export async function subirApp(env: Record<string, string> = {}): Promise<Ambiente> {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
  process.env.THROTTLE_ENABLED = 'false';
  process.env.COOKIE_SECURE = 'false';
  Object.assign(process.env, env);

  // Carrega a aplicação só agora: o ConfigModule valida o ambiente no momento do import.
  const { AppModule } = await import('../src/app.module');
  const { configurarApp } = await import('../src/app.setup');
  const { PrismaService: PrismaServiceClasse } = await import('../src/prisma/prisma.service');

  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication();
  configurarApp(app);
  await app.listen(0); // porta efêmera: evita abrir um listener por requisição do supertest
  return {
    app,
    http: () => request(app.getHttpServer()),
    prisma: app.get(PrismaServiceClasse),
    fechar: () => app.close(),
  };
}

export async function limparBanco(prisma: PrismaService): Promise<void> {
  await prisma.semTenant.$executeRawUnsafe(
    `TRUNCATE TABLE refresh_tokens, convites, agendamentos, bloqueios, clientes, horarios_trabalho, horarios_funcionamento,
     profissional_servicos, servicos, profissionais, usuarios, assinaturas, estabelecimentos CASCADE`,
  );
}

let contador = 0;
export function unico(prefixo: string): string {
  contador += 1;
  return `${prefixo}${Date.now().toString(36)}${contador}`;
}

export interface Sessao {
  token: string;
  cookie: string;
  usuarioId: string;
  estabelecimentoId: string;
  slug: string;
  email: string;
}

export function cookieRefresh(res: request.Response): string {
  const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
  const c = cookies.find((x) => x.startsWith('hh_refresh='));
  if (!c) throw new Error('Cookie de refresh ausente na resposta.');
  return c.split(';')[0];
}

/** Cadastra um dono novo (com salão próprio) e devolve a sessão. */
export async function cadastrarDono(env: Ambiente, parcial: Partial<{ slug: string; email: string; nomeEstabelecimento: string }> = {}): Promise<Sessao> {
  const slug = parcial.slug ?? unico('salao');
  const email = parcial.email ?? `${unico('dono')}@exemplo.com`;
  const res = await env
    .http()
    .post('/api/auth/cadastro')
    .send({ nome: 'Dona Teste', email, senha: SENHA, nomeEstabelecimento: parcial.nomeEstabelecimento ?? 'Salão Teste', slug })
    .expect(201);
  return {
    token: res.body.accessToken,
    cookie: cookieRefresh(res),
    usuarioId: res.body.usuario.id,
    estabelecimentoId: res.body.usuario.estabelecimentoId,
    slug,
    email,
  };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// --------------------------------------------------------------------------- agenda (Fase 2)

export interface SalaoPronto {
  dono: Sessao;
  h: { Authorization: string };
  slug: string;
  fuso: string;
  profId: string;
  servicoId: string;
}

/** Cria um salão que já pode receber agendamentos: horário todo dia, 1 serviço, 1 profissional com preço. */
export async function montarSalao(
  env: Ambiente,
  opcoes: { fuso?: string; duracaoMin?: number; precoCentavos?: number; inicioMin?: number; fimMin?: number } = {},
): Promise<SalaoPronto> {
  const dono = await cadastrarDono(env);
  const h = auth(dono.token);
  const fuso = opcoes.fuso ?? 'America/Sao_Paulo';
  if (fuso !== 'America/Sao_Paulo') await env.http().patch('/api/estabelecimento').set(h).send({ fusoHorario: fuso }).expect(200);
  const faixas = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana, inicioMin: opcoes.inicioMin ?? 540, fimMin: opcoes.fimMin ?? 1080,
  }));
  await env.http().put('/api/estabelecimento/horarios').set(h).send({ faixas }).expect(200);
  const servico = (await env.http().post('/api/servicos').set(h).send({ nome: 'Corte', duracaoMin: opcoes.duracaoMin ?? 30 }).expect(201)).body;
  const profId = await novoProfissional(env, h, 'Prof Um', [{ servicoId: servico.id, precoCentavos: opcoes.precoCentavos ?? 5000 }]);
  return { dono, h, slug: dono.slug, fuso, profId, servicoId: servico.id };
}

export async function novoProfissional(
  env: Ambiente,
  h: { Authorization: string },
  nome: string,
  servicos: { servicoId: string; precoCentavos: number }[],
): Promise<string> {
  const id = (await env.http().post('/api/profissionais').set(h).send({ nome }).expect(201)).body.id as string;
  await env.http().put(`/api/profissionais/${id}/servicos`).set(h).send({ servicos }).expect(200);
  return id;
}

/** Convida um profissional e devolve a sessão dele (para testar o que ele pode e não pode). */
export async function logarProfissional(env: Ambiente, h: { Authorization: string }, profId: string): Promise<string> {
  const token = (await env.http().post(`/api/profissionais/${profId}/convite`).set(h).expect(201)).body.link.split('/convite/')[1];
  const sessao = (await env.http().post(`/api/auth/convite/${token}/aceitar`).send({ email: `${unico('p')}@exemplo.com`, senha: SENHA }).expect(201)).body;
  return sessao.accessToken as string;
}

/** Próxima data (a partir de hoje + `aPartirDeDias`) que cai no dia da semana pedido, no fuso informado. */
export function diaFuturo(fuso: string, aPartirDeDias = 3, diaSemana = 1): string {
  let d = DateTime.now().setZone(fuso).startOf('day').plus({ days: aPartirDeDias });
  while (d.weekday % 7 !== diaSemana) d = d.plus({ days: 1 });
  return d.toISODate()!;
}

/** Instante UTC (ISO) de "data hh:mm" no fuso do salão. */
export function instante(fuso: string, data: string, hhmm: string): string {
  return DateTime.fromISO(`${data}T${hhmm}`, { zone: fuso }).toUTC().toISO()!;
}

let celular = 11_900_000_00;
/** WhatsApp válido e diferente a cada chamada. */
export function whatsappUnico(): string {
  celular += 1;
  return `(11) 9${String(celular).padStart(8, '0').slice(-8).replace(/^(\d{4})(\d{4})$/, '$1-$2')}`;
}

let seq = 0;
/** Grava um agendamento direto no banco (para cenários no passado, que o link não permite criar). */
export async function agendamentoDireto(
  env: Ambiente,
  s: SalaoPronto,
  inicio: Date,
  extra: { status?: 'AGENDADO' | 'CONCLUIDO' | 'FALTOU' | 'CANCELADO'; duracaoMin?: number } = {},
) {
  seq += 1;
  const duracaoMin = extra.duracaoMin ?? 30;
  const cliente = await env.prisma.semTenant.cliente.create({
    data: { estabelecimentoId: s.dono.estabelecimentoId, nome: 'Cliente Direto', whatsapp: `55119${String(70_000_000 + seq)}` },
  });
  const cancelado = extra.status === 'CANCELADO';
  return env.prisma.semTenant.agendamento.create({
    data: {
      estabelecimentoId: s.dono.estabelecimentoId, profissionalId: s.profId, servicoId: s.servicoId, clienteId: cliente.id,
      inicio, fim: new Date(inicio.getTime() + duracaoMin * 60_000), precoCentavos: 5000, duracaoMin,
      status: extra.status ?? 'AGENDADO', origem: 'MANUAL', token: `direto${String(seq).padStart(37, '0')}`,
      ...(cancelado ? { canceladoEm: new Date(), canceladoPor: 'PAINEL' as const } : {}),
    },
  });
}
