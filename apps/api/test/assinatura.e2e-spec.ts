import { DateTime } from 'luxon';
import { MemoryTransport } from '../src/mail/mail.transport';
import { AsaasFake, CHAVE_FAKE } from './asaas-fake';
import {
  Ambiente, auth, cadastrarDono, limparBanco, logarProfissional, montarSalao, novoProfissional, SalaoPronto, subirApp, TOKEN_WEBHOOK,
} from './helpers';

const CPF = '529.982.247-25';
let seqEvento = 0;

const dataSP = (d: Date) => DateTime.fromJSDate(d, { zone: 'America/Sao_Paulo' }).toISODate()!;
const emailsPara = (assunto: RegExp) => MemoryTransport.caixa.filter((e) => assunto.test(e.assunto));
async function esperar(condicao: () => boolean, ms = 2000): Promise<void> {
  const fim = Date.now() + ms;
  while (!condicao() && Date.now() < fim) await new Promise((r) => setTimeout(r, 20));
}

describe('assinatura (Asaas)', () => {
  let env: Ambiente;
  let fake: AsaasFake;
  let rotinas: { processarAssinaturas: (agora?: Date) => Promise<{ saloes: number; erros: number }> };

  const sql = () => env.prisma.semTenant;
  const hook = (event: string, pagamento: Record<string, unknown> | null, extra: Record<string, unknown> = {}, token: string | null = TOKEN_WEBHOOK, id = `evt_${++seqEvento}`) => {
    const r = env.http().post('/api/webhooks/asaas');
    if (token) r.set('asaas-access-token', token);
    return r.send({ id, event: event, dateCreated: new Date().toISOString(), ...(pagamento ? { payment: { object: 'payment', ...pagamento } } : {}), ...extra });
  };
  const pagamentoDe = (p: { id: string; subscription: string; value: number; dueDate: string; invoiceUrl: string }, status: string, extra: object = {}) => ({
    id: p.id, subscription: p.subscription, value: p.value, dueDate: p.dueDate, invoiceUrl: p.invoiceUrl, status, ...extra,
  });
  async function salaoAssinante(opcoes: Parameters<typeof montarSalao>[1] = {}) {
    const s = await montarSalao(env, opcoes);
    const det = (await env.http().post('/api/assinatura/assinar').set(s.h).send({ cpfCnpj: CPF }).expect(201)).body;
    const subId = (await sql().assinatura.findUniqueOrThrow({ where: { estabelecimentoId: s.dono.estabelecimentoId } })).asaasSubscriptionId!;
    const pagamento = [...fake.pagamentos.values()].find((p) => p.subscription === subId)!;
    return { s, det, subId, pagamento };
  }
  const detalhe = async (s: SalaoPronto) => (await env.http().get('/api/assinatura').set(s.h).expect(200)).body;
  const registro = (s: SalaoPronto) => sql().assinatura.findUniqueOrThrow({ where: { estabelecimentoId: s.dono.estabelecimentoId } });

  beforeAll(async () => {
    fake = await new AsaasFake().iniciar();
    env = await subirApp({ ASAAS_API_KEY: CHAVE_FAKE, ASAAS_BASE_URL: fake.url });
    await limparBanco(env.prisma);
    const { RotinasService } = await import('../src/rotinas/rotinas.service');
    rotinas = env.app.get(RotinasService);
  });
  afterAll(async () => {
    await env.fechar();
    await fake.parar();
  });
  beforeEach(() => { MemoryTransport.caixa.length = 0; MemoryTransport.falhar = false; fake.falhas = 0; });

  describe('situação inicial e assinar', () => {
    it('salão novo: teste de 7 dias liberado, faixa 1 (R$ 29,90) e nada contratado', async () => {
      const s = await montarSalao(env);
      const d = await detalhe(s);
      expect(d).toMatchObject({
        status: 'TESTE', acesso: 'LIBERADO', contratada: false, faixa: 1, valorCentavos: 2990, profissionaisAtivos: 1, cobrancaConfigurada: true,
        faixaContratada: null, proximaCobrancaEm: null, cobrancas: [], pagamentoUrl: null,
      });
      const dias = (new Date(d.testeFimEm).getTime() - Date.now()) / 86_400_000;
      expect(dias).toBeGreaterThan(6.9);
      expect(dias).toBeLessThanOrEqual(7);
    });

    it('a faixa acompanha o número de profissionais ativos (2 a 5: R$ 59,90; 6 ou mais: R$ 99,90)', async () => {
      const s = await montarSalao(env);
      for (let i = 0; i < 4; i++) await novoProfissional(env, s.h, `Prof ${i + 2}`, [{ servicoId: s.servicoId, precoCentavos: 1000 }]);
      expect(await detalhe(s)).toMatchObject({ profissionaisAtivos: 5, faixa: 2, valorCentavos: 5990 });
      await novoProfissional(env, s.h, 'Prof 6', [{ servicoId: s.servicoId, precoCentavos: 1000 }]);
      expect(await detalhe(s)).toMatchObject({ profissionaisAtivos: 6, faixa: 3, valorCentavos: 9990 });
    });

    it('recusa CPF/CNPJ inválido sem chamar o Asaas', async () => {
      const s = await montarSalao(env);
      const antes = fake.chamadas.length;
      for (const cpfCnpj of ['123', '111.111.111-11', '529.982.247-26']) {
        await env.http().post('/api/assinatura/assinar').set(s.h).send({ cpfCnpj }).expect(400);
      }
      expect(fake.chamadas.length).toBe(antes);
    });

    it('assinar durante o teste: 1ª cobrança só vence no fim do teste, valor da faixa, forma livre (Pix, cartão ou boleto)', async () => {
      const { s, det, pagamento } = await salaoAssinante();
      const reg = await registro(s);
      expect(det).toMatchObject({ contratada: true, status: 'TESTE', acesso: 'LIBERADO', faixaContratada: 1, valorContratadoCentavos: 2990 });
      expect(det.pagamentoUrl).toBe(pagamento.invoiceUrl);
      expect(det.cobrancas).toHaveLength(1);
      expect(det.cobrancas[0]).toMatchObject({ status: 'PENDENTE', valorCentavos: 2990, vencimento: dataSP(reg.testeFimEm!) });

      const [criarCliente] = fake.chamadasDe('POST', '/customers').slice(-1);
      expect(criarCliente.corpo).toMatchObject({ cpfCnpj: '52998224725', externalReference: s.dono.estabelecimentoId });
      const [criarAssinatura] = fake.chamadasDe('POST', '/subscriptions').slice(-1);
      expect(criarAssinatura.corpo).toMatchObject({ billingType: 'UNDEFINED', cycle: 'MONTHLY', value: 29.9, nextDueDate: dataSP(reg.testeFimEm!) });
      expect(reg).toMatchObject({ faixaContratada: 1, faixaSincronizada: 1, asaasSubscriptionId: expect.stringMatching(/^sub_/) });
    });

    it('o CPF/CNPJ vai só para o Asaas: não fica gravado no banco do Hora H', async () => {
      const { s } = await salaoAssinante();
      const reg = JSON.stringify(await registro(s));
      expect(reg).not.toContain('52998224725');
      expect(reg).not.toContain('529.982');
    });

    it('já assinante: assinar de novo dá 409 e não cria outra assinatura', async () => {
      const { s } = await salaoAssinante();
      const antes = fake.assinaturas.size;
      await env.http().post('/api/assinatura/assinar').set(s.h).send({ cpfCnpj: CPF }).expect(409);
      expect(fake.assinaturas.size).toBe(antes);
    });

    it('assinatura criada no Asaas mas não gravada aqui: a nova tentativa adota a existente em vez de duplicar', async () => {
      const s = await montarSalao(env);
      const cliente = (await env.http().post('/api/assinatura/assinar').set(s.h).send({ cpfCnpj: CPF }).expect(201)).body; // cria tudo
      expect(cliente.contratada).toBe(true);
      // simula a gravação perdida: apaga a referência local
      await sql().assinatura.update({ where: { estabelecimentoId: s.dono.estabelecimentoId }, data: { asaasSubscriptionId: null, faixaContratada: null, faixaSincronizada: null } });
      const antes = fake.assinaturas.size;
      await env.http().post('/api/assinatura/assinar').set(s.h).send({ cpfCnpj: CPF }).expect(201);
      expect(fake.assinaturas.size).toBe(antes);
      expect((await registro(s)).asaasSubscriptionId).toMatch(/^sub_/);
    });

    it('Asaas recusando o dado: o dono vê a mensagem; Asaas fora do ar: 502 e nada fica pela metade', async () => {
      const s = await montarSalao(env);
      fake.falhas = 1; // criar cliente: POST não repete
      const r = await env.http().post('/api/assinatura/assinar').set(s.h).send({ cpfCnpj: CPF }).expect(502);
      expect(r.body.message).toMatch(/serviço de cobrança/);
      expect((await detalhe(s)).contratada).toBe(false);
      await env.http().post('/api/assinatura/assinar').set(s.h).send({ cpfCnpj: CPF }).expect(201);
    });

    it('só o dono vê e mexe na assinatura', async () => {
      const s = await montarSalao(env);
      const profToken = await logarProfissional(env, s.h, s.profId);
      await env.http().get('/api/assinatura').set(auth(profToken)).expect(403);
      await env.http().post('/api/assinatura/assinar').set(auth(profToken)).send({ cpfCnpj: CPF }).expect(403);
      await env.http().get('/api/assinatura').expect(401);
    });
  });

  describe('webhook', () => {
    it('sem token ou com token errado: 401 e nada é gravado', async () => {
      const antes = await sql().asaasEvento.count();
      await hook('PAYMENT_RECEIVED', { id: 'pay_x' }, {}, null).expect(401);
      await hook('PAYMENT_RECEIVED', { id: 'pay_x' }, {}, 'errado').expect(401);
      expect(await sql().asaasEvento.count()).toBe(antes);
    });

    it('pagamento recebido: assinatura ATIVA, cobrança paga, e-mail de confirmação uma vez só', async () => {
      const { s, pagamento } = await salaoAssinante();
      const id = `evt_unico_${++seqEvento}`;
      await hook('PAYMENT_RECEIVED', pagamentoDe(pagamento, 'RECEIVED', { paymentDate: '2026-10-30' }), {}, TOKEN_WEBHOOK, id).expect(200);
      const d = await detalhe(s);
      expect(d).toMatchObject({ status: 'ATIVA', acesso: 'LIBERADO', pagamentoUrl: null });
      expect(d.cobrancas[0]).toMatchObject({ status: 'PAGA' });
      expect((await registro(s)).toleranciaFimEm).toBeNull();
      await esperar(() => emailsPara(/Pagamento confirmado/).length >= 1);
      expect(emailsPara(/Pagamento confirmado/)).toHaveLength(1);

      // o Asaas reentrega o MESMO evento: nenhum efeito novo
      await hook('PAYMENT_RECEIVED', pagamentoDe(pagamento, 'RECEIVED'), {}, TOKEN_WEBHOOK, id).expect(200);
      // e um evento diferente do mesmo pagamento (reenvio com outro id): estado igual, e-mail não repete
      await hook('PAYMENT_RECEIVED', pagamentoDe(pagamento, 'RECEIVED')).expect(200);
      expect(emailsPara(/Pagamento confirmado/)).toHaveLength(1);
      expect(await sql().cobranca.count({ where: { asaasPaymentId: pagamento.id } })).toBe(1);
      expect(await sql().asaasEvento.count({ where: { eventoId: id } })).toBe(1);
    });

    it('todo evento fica registrado (spec 11.2), inclusive de assinatura que não conhecemos', async () => {
      const id = `evt_desconhecido_${++seqEvento}`;
      await hook('PAYMENT_RECEIVED', { id: 'pay_nao_existe', subscription: 'sub_nao_existe', value: 10, dueDate: '2026-10-30', status: 'RECEIVED' }, {}, TOKEN_WEBHOOK, id).expect(200);
      const ev = await sql().asaasEvento.findUniqueOrThrow({ where: { eventoId: id } });
      expect(ev).toMatchObject({ tipo: 'PAYMENT_RECEIVED', estabelecimentoId: null });
      expect(ev.processadoEm).toBeInstanceOf(Date);
    });

    it('evento atrasado não desfaz pagamento: RECEIVED depois OVERDUE continua pago', async () => {
      const { s, pagamento } = await salaoAssinante();
      await hook('PAYMENT_RECEIVED', pagamentoDe(pagamento, 'RECEIVED')).expect(200);
      await hook('PAYMENT_OVERDUE', pagamentoDe(pagamento, 'OVERDUE')).expect(200);
      expect(await detalhe(s)).toMatchObject({ status: 'ATIVA', acesso: 'LIBERADO' });
      expect((await detalhe(s)).cobrancas[0].status).toBe('PAGA');
    });

    it('um salão nunca é afetado por evento de outro', async () => {
      const a = await salaoAssinante();
      const b = await salaoAssinante();
      await hook('PAYMENT_RECEIVED', pagamentoDe(a.pagamento, 'RECEIVED')).expect(200);
      expect((await detalhe(a.s)).status).toBe('ATIVA');
      expect((await detalhe(b.s)).status).toBe('TESTE');
      expect((await detalhe(b.s)).cobrancas[0].status).toBe('PENDENTE');
    });
  });

  describe('vencimento, tolerância e bloqueio', () => {
    async function vencida() {
      const base = await salaoAssinante();
      // a 1ª cobrança (fim do teste) venceu há 1 dia
      const venceu = DateTime.now().setZone('America/Sao_Paulo').minus({ days: 1 }).toISODate()!;
      base.pagamento.dueDate = venceu;
      await hook('PAYMENT_OVERDUE', pagamentoDe(base.pagamento, 'OVERDUE')).expect(200);
      return { ...base, venceu };
    }

    it('venceu: 5 dias de tolerância com aviso, tudo ainda liberado', async () => {
      const { s, venceu } = await vencida();
      const d = await detalhe(s);
      expect(d).toMatchObject({ status: 'TOLERANCIA', acesso: 'LIBERADO' });
      const fim = DateTime.fromISO(venceu, { zone: 'America/Sao_Paulo' }).plus({ days: 6 }).toJSDate();
      expect(new Date(d.toleranciaFimEm).toISOString()).toBe(fim.toISOString());
      expect(d.pagamentoUrl).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\/pay_/);
      await esperar(() => emailsPara(/venceu/).length >= 1);
      expect(emailsPara(/venceu/)).toHaveLength(1);
      expect(emailsPara(/venceu/)[0].texto).toContain('Pagar agora');
    });

    it('passou a tolerância: bloqueia novos agendamentos (link e painel), mas dados e consulta continuam', async () => {
      const { s } = await vencida();
      const prof = s.profId;
      await sql().assinatura.update({ where: { estabelecimentoId: s.dono.estabelecimentoId }, data: { toleranciaFimEm: new Date(Date.now() - 60_000) } });

      // estado e DTO do salão
      const d = await detalhe(s);
      expect(d).toMatchObject({ status: 'BLOQUEADA', acesso: 'RESTRITO' });
      expect((await env.http().get('/api/estabelecimento').set(s.h).expect(200)).body.assinatura).toMatchObject({ status: 'BLOQUEADA', acesso: 'RESTRITO' });

      // página pública: avisa que está fechada e recusa marcar
      const pub = (await env.http().get(`/api/publico/${s.slug}`).expect(200)).body;
      expect(pub.aceitaAgendamentos).toBe(false);
      const rota = `profissionalId=${prof}&servicoId=${s.servicoId}`;
      await env.http().get(`/api/publico/${s.slug}/dias?${rota}`).expect(403);
      await env.http().get(`/api/publico/${s.slug}/horarios?${rota}&data=2030-01-07`).expect(403);
      const r = await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
        profissionalId: prof, servicoId: s.servicoId, inicio: new Date(Date.now() + 5 * 86_400_000).toISOString(), nome: 'Maria Teste', whatsapp: '11999990000', consentimento: true,
      }).expect(403);
      expect(r.body.message).toMatch(/não está recebendo agendamentos/);

      // painel em modo restrito: escrita é 402, leitura segue
      for (const [metodo, rotaPainel, corpo] of [
        ['post', '/api/profissionais', { nome: 'Novo Prof' }],
        ['post', '/api/servicos', { nome: 'Novo Serviço', duracaoMin: 30 }],
        ['patch', '/api/estabelecimento', { nome: 'Outro Nome' }],
        ['post', '/api/agenda/agendamentos', { profissionalId: prof, servicoId: s.servicoId, inicio: new Date().toISOString(), nome: 'Alguém', whatsapp: '11999990000' }],
        ['post', '/api/bloqueios', { profissionalId: prof, inicio: '2030-01-07T10:00', fim: '2030-01-07T11:00' }],
      ] as const) {
        const resp = await env.http()[metodo](rotaPainel).set(s.h).send(corpo);
        expect(resp.status).toBe(402);
        expect(resp.body.code).toBe('ASSINATURA_RESTRITA');
      }
      await env.http().get('/api/agenda?de=2030-01-07&ate=2030-01-07').set(s.h).expect(200);
      await env.http().get('/api/profissionais').set(s.h).expect(200);
      await env.http().get('/api/servicos').set(s.h).expect(200);
      // regularizar continua possível
      await env.http().get('/api/assinatura').set(s.h).expect(200);
      await env.http().post('/api/assinatura/sincronizar').set(s.h).expect(200);
    });

    it('resolver o atendimento já marcado segue valendo no modo restrito (cliente cancela, dono conclui)', async () => {
      const s = await montarSalao(env);
      const dia = DateTime.now().setZone(s.fuso).plus({ days: 4 }).toISODate()!;
      const horarios = (await env.http().get(`/api/publico/${s.slug}/horarios?profissionalId=${s.profId}&servicoId=${s.servicoId}&data=${dia}`).expect(200)).body;
      const marcado = (await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
        profissionalId: s.profId, servicoId: s.servicoId, inicio: horarios[0].inicio, nome: 'Já Marcado', whatsapp: '11999990001', consentimento: true,
      }).expect(201)).body;
      const lista = (await env.http().get(`/api/agenda?de=${dia}&ate=${dia}`).set(s.h).expect(200)).body.agendamentos;
      await sql().assinatura.update({ where: { estabelecimentoId: s.dono.estabelecimentoId }, data: { status: 'BLOQUEADA' } });

      await env.http().patch(`/api/agenda/agendamentos/${lista[0].id}/status`).set(s.h).send({ status: 'CANCELADO' }).expect(200);
      await env.http().post(`/api/meu-agendamento/${marcado.token}/cancelar`).expect(409); // já cancelado, mas passou pelo guard sem 402/403
    });

    it('paga: liberação automática na hora, aviso de confirmação e prazo zerado', async () => {
      const { s, pagamento } = await vencida();
      await sql().assinatura.update({ where: { estabelecimentoId: s.dono.estabelecimentoId }, data: { toleranciaFimEm: new Date(Date.now() - 60_000) } });
      expect((await detalhe(s)).acesso).toBe('RESTRITO');
      MemoryTransport.caixa.length = 0;
      await hook('PAYMENT_RECEIVED', pagamentoDe(pagamento, 'RECEIVED')).expect(200);
      expect(await detalhe(s)).toMatchObject({ status: 'ATIVA', acesso: 'LIBERADO', toleranciaFimEm: null });
      await esperar(() => emailsPara(/Pagamento confirmado/).length >= 1);
      expect(emailsPara(/Pagamento confirmado/)).toHaveLength(1);
      // voltou a marcar
      expect((await env.http().get(`/api/publico/${s.slug}`).expect(200)).body.aceitaAgendamentos).toBe(true);
      await env.http().post('/api/servicos').set(s.h).send({ nome: 'Serviço Novo', duracaoMin: 30 }).expect(201);
    });

    it('com duas cobranças vencidas, pagar só a mais nova não libera; a tolerância conta da mais antiga', async () => {
      const { s, subId, pagamento } = await vencida();
      const nova = fake.gerarCobranca(subId, DateTime.now().setZone('America/Sao_Paulo').toISODate()!);
      await hook('PAYMENT_OVERDUE', pagamentoDe(nova, 'OVERDUE')).expect(200);
      await hook('PAYMENT_RECEIVED', pagamentoDe(nova, 'RECEIVED')).expect(200);
      expect((await detalhe(s)).status).toBe('TOLERANCIA');
      await hook('PAYMENT_RECEIVED', pagamentoDe(pagamento, 'RECEIVED')).expect(200);
      expect((await detalhe(s)).status).toBe('ATIVA');
    });
  });

  describe('mudança de faixa', () => {
    it('durante o teste (sem cobrança) adicionar profissional não pergunta nada', async () => {
      const s = await montarSalao(env);
      await novoProfissional(env, s.h, 'Segundo', [{ servicoId: s.servicoId, precoCentavos: 1000 }]);
      expect((await detalhe(s)).faixa).toBe(2);
    });

    it('assinatura ativa: passar de faixa exige confirmação; confirmada, o Asaas recebe o novo valor sem mexer na cobrança atual', async () => {
      const { s, subId, pagamento } = await salaoAssinante();
      const r = await env.http().post('/api/profissionais').set(s.h).send({ nome: 'Segundo Prof' }).expect(409);
      expect(r.body).toMatchObject({ code: 'FAIXA_MUDA', de: { faixa: 1, valorCentavos: 2990 }, para: { faixa: 2, valorCentavos: 5990 } });
      expect(r.body.message).toMatch(/próxima cobrança/);
      expect((await detalhe(s)).profissionaisAtivos).toBe(1); // nada foi criado

      await env.http().post('/api/profissionais').set(s.h).send({ nome: 'Segundo Prof', confirmarFaixa: true }).expect(201);
      const d = await detalhe(s);
      expect(d).toMatchObject({ profissionaisAtivos: 2, faixa: 2, faixaContratada: 2, valorContratadoCentavos: 5990 });
      expect(fake.assinaturas.get(subId)!.value).toBe(59.9);
      const put = fake.chamadasDe('PUT', `/subscriptions/${subId}`).at(-1)!;
      expect(put.corpo).toEqual({ value: 59.9, updatePendingPayments: false });
      expect(fake.pagamentos.get(pagamento.id)!.value).toBe(29.9); // a cobrança já gerada não muda
      expect((await registro(s)).faixaSincronizada).toBe(2);
      await esperar(() => emailsPara(/valor da sua assinatura/).length >= 1);
      expect(emailsPara(/valor da sua assinatura/)).toHaveLength(1);
    });

    it('dentro da mesma faixa não pergunta; reativar profissional que passa de faixa também exige confirmação', async () => {
      const { s, subId } = await salaoAssinante();
      const segundo = (await env.http().post('/api/profissionais').set(s.h).send({ nome: 'Segundo', confirmarFaixa: true }).expect(201)).body;
      await env.http().post('/api/profissionais').set(s.h).send({ nome: 'Terceiro' }).expect(201); // 3 profissionais: ainda faixa 2

      // desativar o segundo e o terceiro: volta para a faixa 1 (sem confirmação ao diminuir)
      await env.http().patch(`/api/profissionais/${segundo.id}`).set(s.h).send({ ativo: false }).expect(200);
      expect((await detalhe(s)).profissionaisAtivos).toBe(2);
      const terceiro = (await env.http().get('/api/profissionais').set(s.h).expect(200)).body.find((p: any) => p.nome === 'Terceiro');
      await env.http().patch(`/api/profissionais/${terceiro.id}`).set(s.h).send({ ativo: false }).expect(200);
      expect(await detalhe(s)).toMatchObject({ profissionaisAtivos: 1, faixaContratada: 1, valorContratadoCentavos: 2990 });
      expect(fake.assinaturas.get(subId)!.value).toBe(29.9);

      // reativar o segundo muda de faixa: precisa confirmar
      await env.http().patch(`/api/profissionais/${segundo.id}`).set(s.h).send({ ativo: true }).expect(409);
      await env.http().patch(`/api/profissionais/${segundo.id}`).set(s.h).send({ ativo: true, confirmarFaixa: true }).expect(200);
      expect((await detalhe(s)).faixaContratada).toBe(2);
    });

    it('Asaas fora do ar na hora de mudar o valor: o cadastro vale e o job reenvia depois', async () => {
      const { s, subId } = await salaoAssinante();
      fake.falhas = 3; // PUT tenta 3 vezes e falha
      await env.http().post('/api/profissionais').set(s.h).send({ nome: 'Segundo Prof', confirmarFaixa: true }).expect(201);
      expect(await registro(s)).toMatchObject({ faixaContratada: 2, faixaSincronizada: 1 });
      expect(fake.assinaturas.get(subId)!.value).toBe(29.9);
      await rotinas.processarAssinaturas();
      expect(await registro(s)).toMatchObject({ faixaContratada: 2, faixaSincronizada: 2 });
      expect(fake.assinaturas.get(subId)!.value).toBe(59.9);
    });
  });

  describe('cancelar e sincronizar', () => {
    it('cancelar: o Asaas para de cobrar e o acesso vai até o fim do período já pago', async () => {
      const { s, subId, pagamento } = await salaoAssinante();
      await hook('PAYMENT_RECEIVED', pagamentoDe(pagamento, 'RECEIVED')).expect(200);
      const d = (await env.http().post('/api/assinatura/cancelar').set(s.h).expect(200)).body;
      expect(fake.assinaturas.get(subId)!.deleted).toBe(true);
      expect(d).toMatchObject({ contratada: false, status: 'ATIVA', acesso: 'LIBERADO' });
      expect(d.cancelaEm).not.toBeNull();
      await env.http().post('/api/assinatura/cancelar').set(s.h).expect(400); // já cancelada

      await sql().assinatura.update({ where: { estabelecimentoId: s.dono.estabelecimentoId }, data: { cancelaEm: new Date(Date.now() - 1000) } });
      expect(await detalhe(s)).toMatchObject({ status: 'CANCELADA', acesso: 'RESTRITO' });
    });

    it('depois de cancelar dá para assinar de novo (cria outra assinatura)', async () => {
      const { s, subId, pagamento } = await salaoAssinante();
      await hook('PAYMENT_RECEIVED', pagamentoDe(pagamento, 'RECEIVED')).expect(200);
      await env.http().post('/api/assinatura/cancelar').set(s.h).expect(200);
      await env.http().post('/api/assinatura/assinar').set(s.h).send({ cpfCnpj: CPF }).expect(201);
      const reg = await registro(s);
      expect(reg.asaasSubscriptionId).not.toBe(subId);
      expect(reg.cancelaEm).toBeNull();
    });

    it('cancelar direto no painel do Asaas também vale (evento SUBSCRIPTION_DELETED)', async () => {
      const { s, subId, pagamento } = await salaoAssinante();
      await hook('PAYMENT_RECEIVED', pagamentoDe(pagamento, 'RECEIVED')).expect(200);
      await hook('SUBSCRIPTION_DELETED', null, { subscription: { id: subId, externalReference: s.dono.estabelecimentoId } }).expect(200);
      expect((await registro(s)).cancelaEm).toBeInstanceOf(Date);
    });

    it('webhook perdido: "sincronizar" confere no Asaas e libera', async () => {
      const { s, pagamento } = await salaoAssinante();
      fake.pagamentos.get(pagamento.id)!.status = 'RECEIVED'; // pagou, mas nenhum webhook chegou
      const d = (await env.http().post('/api/assinatura/sincronizar').set(s.h).expect(200)).body;
      expect(d).toMatchObject({ status: 'ATIVA' });
      expect(d.cobrancas[0].status).toBe('PAGA');
    });

    it('sincronizar sem assinatura não faz nada e não quebra', async () => {
      const s = await montarSalao(env);
      expect((await env.http().post('/api/assinatura/sincronizar').set(s.h).expect(200)).body.contratada).toBe(false);
    });
  });

  describe('job (rotina)', () => {
    const ajustarTeste = (s: SalaoPronto, deslocamentoMs: number) =>
      sql().assinatura.update({ where: { estabelecimentoId: s.dono.estabelecimentoId }, data: { testeFimEm: new Date(Date.now() + deslocamentoMs), status: 'TESTE', toleranciaFimEm: null } });
    const DIA = 86_400_000;

    it('2 dias antes do fim do teste: avisa uma vez só (rodar o job de novo não repete)', async () => {
      const s = await montarSalao(env);
      await ajustarTeste(s, 1.5 * DIA);
      await rotinas.processarAssinaturas();
      await rotinas.processarAssinaturas();
      await esperar(() => emailsPara(/teste grátis acaba/).length >= 1);
      const lista = MemoryTransport.caixa.filter((e) => /teste grátis acaba/.test(e.assunto));
      expect(lista).toHaveLength(1);
      expect(lista[0].para).toBe(s.dono.email);
    });

    it('longe do fim do teste não avisa nada', async () => {
      const s = await montarSalao(env);
      await ajustarTeste(s, 5 * DIA);
      await rotinas.processarAssinaturas();
      expect(MemoryTransport.caixa.filter((e) => e.para === s.dono.email)).toHaveLength(0);
    });

    it('teste acabou: vira tolerância (5 dias) com aviso; passou: bloqueia com aviso; cada aviso uma vez', async () => {
      const s = await montarSalao(env);
      await ajustarTeste(s, -3_600_000);
      await rotinas.processarAssinaturas();
      await rotinas.processarAssinaturas();
      expect(await registro(s)).toMatchObject({ status: 'TOLERANCIA' });
      expect((await detalhe(s)).acesso).toBe('LIBERADO');
      expect(emailsPara(/teste grátis acabou/)).toHaveLength(1);

      await ajustarTeste(s, -6 * DIA);
      await rotinas.processarAssinaturas();
      await rotinas.processarAssinaturas();
      expect(await registro(s)).toMatchObject({ status: 'BLOQUEADA' });
      expect((await detalhe(s)).acesso).toBe('RESTRITO');
      expect(emailsPara(/bloqueados/)).toHaveLength(1);
    });

    it('último dia de tolerância: aviso extra, uma vez', async () => {
      const s = await montarSalao(env);
      await ajustarTeste(s, -(5 * DIA) + 3_600_000 * 5); // faltam 5 h para acabar a tolerância
      await rotinas.processarAssinaturas();
      await rotinas.processarAssinaturas();
      expect(emailsPara(/Último dia/)).toHaveLength(1);
    });

    it('falha no envio do e-mail: a próxima rodada tenta de novo, sem duplicar', async () => {
      const s = await montarSalao(env);
      await ajustarTeste(s, 1.5 * DIA);
      MemoryTransport.falhar = true;
      await rotinas.processarAssinaturas();
      expect(MemoryTransport.caixa).toHaveLength(0);
      MemoryTransport.falhar = false;
      await rotinas.processarAssinaturas();
      await rotinas.processarAssinaturas();
      expect(emailsPara(/teste grátis acaba/)).toHaveLength(1);
    });

    it('job confere com o Asaas quem está em tolerância (webhook perdido) e libera quem já pagou', async () => {
      const { s, pagamento } = await salaoAssinante();
      await sql().assinatura.update({ where: { estabelecimentoId: s.dono.estabelecimentoId }, data: { status: 'TOLERANCIA', toleranciaFimEm: new Date(Date.now() + DIA) } });
      fake.pagamentos.get(pagamento.id)!.status = 'RECEIVED';
      await rotinas.processarAssinaturas();
      expect(await registro(s)).toMatchObject({ status: 'ATIVA', toleranciaFimEm: null });
    });

    it('um salão com problema não impede os outros', async () => {
      const ruim = await salaoAssinante();
      const bom = await montarSalao(env);
      await ajustarTeste(bom, 1.5 * DIA);
      await sql().assinatura.update({ where: { estabelecimentoId: ruim.s.dono.estabelecimentoId }, data: { status: 'TOLERANCIA', toleranciaFimEm: new Date(Date.now() + DIA) } });
      fake.falhas = 99; // Asaas inteiro fora do ar
      const resumo = await rotinas.processarAssinaturas();
      fake.falhas = 0;
      expect(resumo.saloes).toBeGreaterThan(1);
      expect(emailsPara(/teste grátis acaba/).filter((e) => e.para === bom.dono.email)).toHaveLength(1);
    });
  });

  describe('avisos ao dono: novo agendamento e cancelamento', () => {
    async function marcarPeloLink(s: SalaoPronto) {
      const dia = DateTime.now().setZone(s.fuso).plus({ days: 4 }).toISODate()!;
      const horarios = (await env.http().get(`/api/publico/${s.slug}/horarios?profissionalId=${s.profId}&servicoId=${s.servicoId}&data=${dia}`).expect(200)).body;
      return (await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
        profissionalId: s.profId, servicoId: s.servicoId, inicio: horarios[0].inicio, nome: 'Joana Cliente', whatsapp: '11999990002', consentimento: true,
      }).expect(201)).body;
    }

    it('cliente marca pelo link: o dono recebe e-mail com cliente, serviço e horário', async () => {
      const s = await montarSalao(env);
      await marcarPeloLink(s);
      await esperar(() => emailsPara(/Novo agendamento/).length >= 1);
      const [mail] = emailsPara(/Novo agendamento/);
      expect(mail.para).toBe(s.dono.email);
      expect(mail.assunto).toContain('Joana Cliente');
      expect(mail.texto).toMatch(/Corte/);
      expect(mail.texto).toMatch(/\/painel\/agenda/);
    });

    it('cliente cancela pelo link: o dono é avisado; cancelar pelo painel não manda e-mail', async () => {
      const s = await montarSalao(env);
      const marcado = await marcarPeloLink(s);
      await env.http().post(`/api/meu-agendamento/${marcado.token}/cancelar`).expect(200);
      await esperar(() => emailsPara(/cancelado/).length >= 1);
      expect(emailsPara(/cancelado/)[0].texto).toContain('O cliente cancelou');
    });

    it('agendamento lançado no painel não manda e-mail (quem lançou já sabe)', async () => {
      const s = await montarSalao(env);
      const dia = DateTime.now().setZone(s.fuso).plus({ days: 4 }).toISODate()!;
      const horarios = (await env.http().get(`/api/agenda/horarios?profissionalId=${s.profId}&servicoId=${s.servicoId}&data=${dia}`).set(s.h).expect(200)).body;
      await env.http().post('/api/agenda/agendamentos').set(s.h).send({
        profissionalId: s.profId, servicoId: s.servicoId, inicio: horarios[0].inicio, nome: 'Balcão', whatsapp: '11999990003',
      }).expect(201);
      await new Promise((r) => setTimeout(r, 150));
      expect(emailsPara(/Novo agendamento/)).toHaveLength(0);
    });

    it('o dono desliga os avisos nos Ajustes e deixa de receber', async () => {
      const s = await montarSalao(env);
      const e = (await env.http().patch('/api/estabelecimento').set(s.h).send({ emailAgendamentos: false }).expect(200)).body;
      expect(e.emailAgendamentos).toBe(false);
      await marcarPeloLink(s);
      await new Promise((r) => setTimeout(r, 150));
      expect(emailsPara(/Novo agendamento/)).toHaveLength(0);
    });

    it('falha no envio do aviso nunca derruba a marcação do cliente', async () => {
      const s = await montarSalao(env);
      MemoryTransport.falhar = true;
      const r = await marcarPeloLink(s);
      expect(r.token).toHaveLength(43);
    });
  });
});
