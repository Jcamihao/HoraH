import { Injectable, Logger } from '@nestjs/common';
import { AgendaService } from '../agenda/agenda.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { PrismaService } from '../prisma/prisma.service';
import { fimDoPrazoDeResposta } from './janelas';
import { WhatsappService } from './whatsapp.service';

const INCLUIR = {
  cliente: { select: { nome: true, whatsapp: true } },
  servico: { select: { id: true, nome: true } },
  profissional: { select: { id: true, nome: true } },
} as const;

/** Sem a confirmação de ENTREGA em 2 h depois de enviado, avisamos o dono (e não cancelamos nada). */
const ESPERA_ENTREGA_MS = 2 * 3_600_000;
/** Um lembrete que devia ter saído há mais que isso não sai mais. */
const VALIDADE_LEMBRETE_MS = 6 * 3_600_000;

/**
 * Lembrete de 24 h, confirmação e cancelamento automático (spec seção 6). Cada método roda no contexto de um
 * salão e é idempotente: pode rodar a qualquer hora, várias vezes, sem repetir mensagem nem cancelar a mais.
 */
@Injectable()
export class LembretesService {
  private readonly logger = new Logger(LembretesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly agenda: AgendaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /** Põe na fila os lembretes cujo horário (24 h antes, entre 8h e 20h) já chegou. */
  async enviarDevidos(agora = new Date()): Promise<number> {
    const devidos = await this.prisma.db.agendamento.findMany({
      where: { status: 'AGENDADO', lembreteAgendadoPara: { lte: agora }, lembreteEnviadoEm: null, inicio: { gt: agora } },
      include: INCLUIR,
      take: 100,
    });
    for (const a of devidos) {
      // Lembrete atrasado demais (WhatsApp ficou fora, ou o salão acabou de conectar) confunde: pula.
      if (agora.getTime() - a.lembreteAgendadoPara!.getTime() > VALIDADE_LEMBRETE_MS) {
        await this.prisma.db.agendamento.update({ where: { id: a.id }, data: { lembreteAgendadoPara: null } });
        continue;
      }
      await this.whatsapp.enviarLembrete(a, false); // o job despacha logo depois
      // Marca mesmo se a mensagem já estava na fila (reentrada) ou o salão não tem WhatsApp: não tentar de novo a cada rodada.
      await this.prisma.db.agendamento.update({ where: { id: a.id }, data: { lembreteEnviadoEm: agora } });
    }
    return devidos.length;
  }

  /**
   * O WhatsApp confirmou a ENTREGA (ou a leitura) do lembrete: a contagem de 2 h começa agora, sem contar a
   * noite. Antes disso o cliente não tem como saber do prazo, então nada pode ser cancelado.
   */
  async aoEntregar(agendamentoId: string, entregueEm: Date): Promise<void> {
    const a = await this.prisma.db.agendamento.findFirst({ where: { id: agendamentoId, status: 'AGENDADO', confirmacao: 'PENDENTE', lembreteEntregueEm: null } });
    if (!a) return;
    const { fusoHorario } = await this.agenda.salao();
    const fim = fimDoPrazoDeResposta(entregueEm, fusoHorario);
    await this.prisma.db.agendamento.updateMany({
      where: { id: a.id, lembreteEntregueEm: null },
      data: { lembreteEntregueEm: entregueEm, confirmarAte: fim < a.inicio ? fim : a.inicio },
    });
  }

  /** Quem não respondeu a tempo perde o horário: libera, avisa o cliente (com link para remarcar) e o dono. */
  async cancelarSemResposta(agora = new Date()): Promise<number> {
    const vencidos = await this.prisma.db.agendamento.findMany({
      where: { status: 'AGENDADO', confirmacao: 'PENDENTE', lembreteEntregueEm: { not: null }, confirmarAte: { lte: agora }, inicio: { gt: agora } },
      select: { id: true },
      take: 100,
    });
    let cancelados = 0;
    for (const { id } of vencidos) {
      const a = await this.agenda.cancelarPorFaltaDeResposta(id, agora);
      if (!a) continue; // confirmou ou mudou no meio do caminho
      cancelados += 1;
      await this.whatsapp.enviarCancelamentoAutomatico(a, false);
    }
    return cancelados;
  }

  /** Lembrete que não foi entregue (ou falhou): não cancela, só avisa o dono no painel e por e-mail, uma vez. */
  async avisarSemEntrega(agora = new Date()): Promise<number> {
    const limite = new Date(agora.getTime() - ESPERA_ENTREGA_MS);
    const mensagens = await this.prisma.db.mensagemLog.findMany({
      where: {
        tipo: 'LEMBRETE', direcao: 'ENVIADA', agendamentoId: { not: null }, entregueEm: null,
        OR: [{ status: 'FALHOU' }, { status: 'ENVIADA', enviadaEm: { lte: limite } }],
      },
      select: { agendamentoId: true },
      take: 200,
    });
    const ids = [...new Set(mensagens.map((m) => m.agendamentoId!))];
    if (!ids.length) return 0;
    const pendentes = await this.prisma.db.agendamento.findMany({
      where: { id: { in: ids }, status: 'AGENDADO', confirmacao: 'PENDENTE', semEntregaAvisadoEm: null, lembreteEntregueEm: null, inicio: { gt: agora } },
      include: INCLUIR,
    });
    const { fusoHorario } = pendentes.length ? await this.agenda.salao() : { fusoHorario: '' };
    for (const a of pendentes) {
      const marcou = await this.prisma.db.agendamento.updateMany({ where: { id: a.id, semEntregaAvisadoEm: null }, data: { semEntregaAvisadoEm: agora } });
      if (marcou.count) await this.notificacoes.lembreteSemEntrega(a, fusoHorario);
    }
    return pendentes.length;
  }
}
