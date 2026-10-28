import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import type { ConexaoWhatsappDto, QrWhatsappDto } from '@hora-h/shared';
import { TenantContext } from '../common/tenant-context';
import type { Env } from '../config/env';
import { AvisosService } from '../mail/avisos.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { comTenant, PrismaService } from '../prisma/prisma.service';
import { DadosMensagem, quandoPorExtenso, textos } from './mensagens';
import { EstadoDaSessao, SituacaoDaSessao, WHATSAPP_PROVIDER, WhatsAppProvider } from './whatsapp.provider';

const MAX_TENTATIVAS = 5;
const ESPERAS_MS = [30_000, 120_000, 600_000, 1_800_000];
/** Mensagem que não conseguiu sair em 6 h perdeu o sentido (um lembrete atrasado confunde mais do que ajuda). */
export const VALIDADE_NA_FILA_MS = 6 * 3_600_000;
/** Depois de pedir a conexão, o QR demora alguns segundos para aparecer. */
const GRACA_INICIO_MS = 60_000;
const POR_RODADA = 20;
/** Quanto tempo um despacho "segura" a mensagem enquanto tenta enviá-la. */
const ALUGUEL_MS = 120_000;
const RANK: Record<string, number> = { ENVIADA: 1, ENTREGUE: 2, LIDA: 3 };

export interface AgendamentoParaMensagem {
  id: string;
  inicio: Date;
  token: string;
  profissionalId?: string;
  servicoId?: string;
  cliente: { nome: string; whatsapp: string };
  servico: { id?: string; nome: string };
  profissional: { id?: string; nome: string };
}

/**
 * Conexão do salão com o WhatsApp e a fila de envio. Tudo roda no contexto de um salão (tenant).
 * A fila é a própria tabela `mensagens_log`: o que está `NA_FILA` sai quando o job (ou o próprio enfileirar)
 * chama `despachar`, no máximo uma mensagem por vez e com espaçamento entre elas.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly config: ConfigService<Env, true>,
    private readonly avisos: AvisosService,
    private readonly notificacoes: NotificacoesService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  private get salaoId(): string {
    const id = this.tenant.atual();
    if (!id) throw new Error('Sem tenant no contexto.');
    return id;
  }

  configurado(): boolean {
    return this.provider.configurado();
  }

  // ---------------------------------------------------------------- conexão (painel)

  async obter(): Promise<ConexaoWhatsappDto> {
    const conexao = await this.prisma.db.conexaoWhatsapp.findFirst();
    const naFila = await this.prisma.db.mensagemLog.count({ where: { status: 'NA_FILA' } });
    return {
      configurado: this.configurado(),
      status: conexao?.status ?? 'DESCONECTADA',
      conectadoEm: conexao?.conectadoEm?.toISOString() ?? null,
      ultimaQuedaEm: conexao?.ultimaQuedaEm?.toISOString() ?? null,
      naFila,
    };
  }

  /** Começa (ou retoma) a conexão: cria a sessão do salão no WA-AKG e deixa o QR sendo gerado. */
  async conectar(): Promise<ConexaoWhatsappDto> {
    await this.provider.garantirSessao(this.salaoId);
    // `update` explícito: carimba o instante em que a conexão começou (a conferência dá uma folga a partir dele).
    await this.prisma.db.conexaoWhatsapp.upsert({
      where: { estabelecimentoId: this.salaoId },
      create: comTenant({ status: 'AGUARDANDO_QR' }),
      update: { status: 'AGUARDANDO_QR' },
    });
    return this.obter();
  }

  /** Estado e QR atuais. A tela chama de tempos em tempos enquanto espera o salão ler o QR. */
  async qr(): Promise<QrWhatsappDto> {
    const s = await this.conferirComProvedor();
    const dto = await this.obter();
    if (dto.status !== 'AGUARDANDO_QR') return { status: dto.status, qrImagem: null };
    return { status: dto.status, qrImagem: s?.qr ? await QRCode.toDataURL(s.qr, { margin: 1, width: 320 }) : null };
  }

  async parear(telefone: string): Promise<{ codigo: string }> {
    return { codigo: await this.provider.codigoDePareamento(this.salaoId, telefone) };
  }

  async desconectar(): Promise<ConexaoWhatsappDto> {
    await this.provider.desconectar(this.salaoId);
    await this.aoMudarConexao('DESCONECTADA', false);
    return this.obter();
  }

  /**
   * Confere o provedor e grava o que ele diz. Logo depois de pedir a conexão o WA-AKG ainda aparece parado por
   * alguns segundos antes de gerar o QR: nesse começo não tratamos "parado" como desconectado.
   */
  private async conferirComProvedor(agora = new Date()): Promise<SituacaoDaSessao | null> {
    const atual = await this.prisma.db.conexaoWhatsapp.findFirst();
    if (!atual) return null;
    try {
      const s = await this.provider.situacao(this.salaoId);
      const comecando = atual.status === 'AGUARDANDO_QR' && s.estado === 'DESCONECTADA' && agora.getTime() - atual.updatedAt.getTime() < GRACA_INICIO_MS;
      if (!comecando) await this.aoMudarConexao(s.estado);
      return s;
    } catch (e) {
      this.logger.warn(`Não consegui conferir a sessão ${this.salaoId}: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Webhook `connection.update` ou conferência da tela. Cair depois de ter estado conectado avisa o dono
   * (painel e e-mail); `avisar=false` para desconexão pedida pelo próprio dono.
   */
  async aoMudarConexao(estado: EstadoDaSessao, avisar = true, agora = new Date()): Promise<void> {
    const atual = await this.prisma.db.conexaoWhatsapp.findFirst();
    if (!atual || atual.status === estado) return;
    await this.prisma.db.conexaoWhatsapp.update({
      where: { estabelecimentoId: this.salaoId },
      data: {
        status: estado,
        ...(estado === 'CONECTADA' ? { conectadoEm: agora, proximoEnvioEm: agora } : {}),
        ...(estado === 'DESCONECTADA' && atual.status === 'CONECTADA' ? { ultimaQuedaEm: agora } : {}),
      },
    });
    if (estado === 'DESCONECTADA' && atual.status === 'CONECTADA' && avisar) await this.notificacoes.whatsappCaiu();
    if (estado === 'CONECTADA') void this.despachar().catch((e) => this.logger.error(`Despacho falhou: ${e.message}`));
  }

  // ---------------------------------------------------------------- envio

  /**
   * Põe uma mensagem na fila. `chave` impede enviar o mesmo aviso duas vezes. Salão sem WhatsApp ligado não
   * enfileira nada. Devolve se enfileirou.
   */
  async enfileirar(o: {
    telefone: string; texto: string; tipo: 'CONFIRMACAO' | 'LEMBRETE' | 'CANCELAMENTO_AUTOMATICO' | 'BOT';
    chave?: string; agendamentoId?: string; enviarApartirDe?: Date;
    /** Falso quando quem chama vai despachar logo em seguida (o job): evita dois despachos ao mesmo tempo. */
    despacharJa?: boolean;
  }): Promise<boolean> {
    if (!(await this.prisma.db.conexaoWhatsapp.findFirst())) return false;
    try {
      await this.prisma.db.mensagemLog.create({
        data: comTenant({
          direcao: 'ENVIADA', tipo: o.tipo, status: 'NA_FILA', telefone: o.telefone, texto: o.texto,
          chave: o.chave ?? null, agendamentoId: o.agendamentoId ?? null, enviarApartirDe: o.enviarApartirDe ?? new Date(),
        }),
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      throw e;
    }
    // Sai já se o caminho está livre; se não, o job do WhatsApp pega logo em seguida.
    if (o.despacharJa !== false) void this.despachar().catch((e) => this.logger.error(`Despacho falhou: ${e.message}`));
    return true;
  }

  /**
   * Manda as mensagens vencidas deste salão, uma de cada vez, respeitando o espaçamento. O "carimbo" do
   * próximo envio é reservado com UPDATE condicional, então dois despachos ao mesmo tempo nunca mandam
   * duas mensagens coladas.
   */
  async despachar(agora = new Date()): Promise<number> {
    let enviadas = 0;
    for (let i = 0; i < POR_RODADA; i++) {
      const reserva = await this.prisma.db.conexaoWhatsapp.updateMany({
        where: { status: 'CONECTADA', proximoEnvioEm: { lte: agora } },
        data: { proximoEnvioEm: new Date(agora.getTime() + this.intervalo()) },
      });
      if (reserva.count === 0) break;
      const msg = await this.prisma.db.mensagemLog.findFirst({
        where: { status: 'NA_FILA', direcao: 'ENVIADA', enviarApartirDe: { lte: agora } },
        orderBy: { enviarApartirDe: 'asc' },
      });
      if (!msg) {
        await this.prisma.db.conexaoWhatsapp.updateMany({ data: { proximoEnvioEm: agora } }); // nada a enviar: libera o próximo
        break;
      }
      // "Aluguel" da mensagem: dois despachos ao mesmo tempo (enfileirar, job, reconexão) nunca enviam a mesma
      // mensagem duas vezes. Se o envio travar, ela volta sozinha à fila depois do aluguel.
      const pegou = await this.prisma.db.mensagemLog.updateMany({
        where: { id: msg.id, status: 'NA_FILA', enviarApartirDe: { lte: agora } },
        data: { enviarApartirDe: new Date(agora.getTime() + ALUGUEL_MS) },
      });
      if (pegou.count === 0) continue; // outro despacho pegou esta
      try {
        const { mensagemId } = await this.provider.enviarTexto(this.salaoId, msg.telefone, msg.texto);
        await this.prisma.db.mensagemLog.update({ where: { id: msg.id }, data: { status: 'ENVIADA', waMensagemId: mensagemId, enviadaEm: agora, erro: null } });
        enviadas += 1;
      } catch (e) {
        await this.registrarFalha(msg.id, msg.tentativas + 1, (e as Error).message, agora);
      }
    }
    return enviadas;
  }

  private intervalo(): number {
    const base = this.config.get('WHATSAPP_ESPACAMENTO_MS', { infer: true });
    return Math.round(base * (0.6 + Math.random() * 0.8));
  }

  private async registrarFalha(id: string, tentativas: number, erro: string, agora: Date): Promise<void> {
    const desistiu = tentativas >= MAX_TENTATIVAS;
    await this.prisma.db.mensagemLog.update({
      where: { id },
      data: {
        tentativas, erro: erro.slice(0, 300),
        ...(desistiu ? { status: 'FALHOU' } : { enviarApartirDe: new Date(agora.getTime() + ESPERAS_MS[Math.min(tentativas - 1, ESPERAS_MS.length - 1)]) }),
      },
    });
    this.logger.warn(`Envio falhou (${tentativas}/${MAX_TENTATIVAS}) para a mensagem ${id}: ${erro}`);
  }

  /** Desiste do que ficou tempo demais na fila (WhatsApp desconectado por horas). Devolve as que expiraram. */
  async expirarFila(agora = new Date()): Promise<{ id: string; tipo: string; agendamentoId: string | null }[]> {
    const velhas = await this.prisma.db.mensagemLog.findMany({
      where: { status: 'NA_FILA', direcao: 'ENVIADA', createdAt: { lt: new Date(agora.getTime() - VALIDADE_NA_FILA_MS) } },
      select: { id: true, tipo: true, agendamentoId: true },
    });
    if (velhas.length) {
      await this.prisma.db.mensagemLog.updateMany({
        where: { id: { in: velhas.map((m) => m.id) } },
        data: { status: 'FALHOU', erro: 'Expirou na fila: o WhatsApp ficou desconectado.' },
      });
    }
    return velhas;
  }

  /** Resposta imediata do bot (alguém está esperando na conversa): sai na hora, sem fila, mas fica no log. */
  async responder(telefone: string, texto: string): Promise<void> {
    try {
      const { mensagemId } = await this.provider.enviarTexto(this.salaoId, telefone, texto);
      await this.prisma.db.mensagemLog.create({
        data: comTenant({ direcao: 'ENVIADA', tipo: 'BOT', status: 'ENVIADA', telefone, texto, waMensagemId: mensagemId, enviadaEm: new Date() }),
      });
    } catch (e) {
      this.logger.warn(`Resposta do bot não saiu para ${telefone}: ${(e as Error).message}`);
    }
  }

  /** Confirmação de entrega/leitura vinda do WhatsApp. Nunca volta atrás (ENTREGUE não vira ENVIADA). */
  async registrarStatus(waMensagemId: string, status: 'ENVIADA' | 'ENTREGUE' | 'LIDA', agora = new Date()) {
    const msg = await this.prisma.db.mensagemLog.findFirst({ where: { waMensagemId, direcao: 'ENVIADA' } });
    if (!msg || RANK[msg.status] === undefined && msg.status !== 'ENVIADA') return null;
    if ((RANK[status] ?? 0) <= (RANK[msg.status] ?? 0)) return msg;
    return this.prisma.db.mensagemLog.update({
      where: { id: msg.id },
      data: {
        status,
        ...(status !== 'ENVIADA' && !msg.entregueEm ? { entregueEm: agora } : {}),
        ...(status === 'LIDA' ? { lidaEm: agora } : {}),
      },
    });
  }

  // ---------------------------------------------------------------- mensagens do agendamento

  private async dadosDaMensagem(a: AgendamentoParaMensagem): Promise<DadosMensagem & { slug: string }> {
    const salao = await this.prisma.db.estabelecimento.findFirstOrThrow({ select: { nome: true, slug: true, fusoHorario: true } });
    return {
      nome: a.cliente.nome.split(' ')[0],
      salao: salao.nome,
      servico: a.servico.nome,
      profissional: a.profissional.nome,
      quando: quandoPorExtenso(a.inicio, salao.fusoHorario),
      link: this.avisos.link(`/agendamento/${a.token}`),
      slug: salao.slug,
    };
  }

  /** "Seu horário está confirmado" logo depois de marcar (link, bot ou painel), com o link para gerenciar. */
  async enviarConfirmacao(a: AgendamentoParaMensagem, remarcado = false): Promise<void> {
    const d = await this.dadosDaMensagem(a);
    await this.enfileirar({
      telefone: a.cliente.whatsapp, texto: textos.confirmacao(d, remarcado), tipo: 'CONFIRMACAO',
      chave: `confirmacao:${a.id}:${a.inicio.getTime()}`, agendamentoId: a.id,
    });
  }

  async enviarLembrete(a: AgendamentoParaMensagem, despacharJa = true): Promise<boolean> {
    const d = await this.dadosDaMensagem(a);
    return this.enfileirar({
      telefone: a.cliente.whatsapp, texto: textos.lembrete(d), tipo: 'LEMBRETE',
      chave: `lembrete:${a.id}:${a.inicio.getTime()}`, agendamentoId: a.id, despacharJa,
    });
  }

  /** Mensagem do cancelamento automático, com o link para marcar de novo (mesmo profissional e serviço). */
  async enviarCancelamentoAutomatico(a: AgendamentoParaMensagem, despacharJa = true): Promise<void> {
    const d = await this.dadosDaMensagem(a);
    const link = this.avisos.link(`/${d.slug}?profissional=${a.profissional.id ?? a.profissionalId}&servico=${a.servico.id ?? a.servicoId}`);
    await this.enfileirar({
      telefone: a.cliente.whatsapp, texto: textos.cancelamentoAutomatico({ ...d, link }), tipo: 'CANCELAMENTO_AUTOMATICO',
      chave: `auto:${a.id}:${a.inicio.getTime()}`, agendamentoId: a.id, despacharJa,
    });
  }
}
