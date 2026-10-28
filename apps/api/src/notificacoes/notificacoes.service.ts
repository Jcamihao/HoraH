import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Papel, type CanceladoPor, type NotificacaoDto, type NotificacoesDto, type TipoNotificacao } from '@hora-h/shared';
import { AvisosService } from '../mail/avisos.service';
import { emails } from '../mail/templates';
import { comTenant, PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

interface DadosAgendamento {
  id: string;
  inicio: Date;
  cliente: { nome: string };
  servico: { nome: string };
  profissional: { nome: string };
}

const QUEM: Record<CanceladoPor, string> = { CLIENTE: 'O cliente', PAINEL: 'Alguém do salão', AUTOMATICO: 'O sistema' };

/**
 * Avisos ao dono (spec 8.3): ficam no painel e, quando faz sentido, vão por e-mail. Nunca lança: avisar é um
 * extra e não pode derrubar a marcação do cliente nem o job.
 */
@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger(NotificacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosService,
  ) {}

  // ---------------------------------------------------------------- painel

  async listar(): Promise<NotificacoesDto> {
    const [itens, naoLidas] = await Promise.all([
      this.prisma.db.notificacao.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.db.notificacao.count({ where: { lidaEm: null } }),
    ]);
    return {
      naoLidas,
      itens: itens.map((n): NotificacaoDto => ({
        id: n.id, tipo: n.tipo as TipoNotificacao, titulo: n.titulo, corpo: n.corpo, agendamentoId: n.agendamentoId,
        lida: n.lidaEm !== null, criadaEm: n.createdAt.toISOString(),
      })),
    };
  }

  async marcarLida(id: string): Promise<void> {
    const r = await this.prisma.db.notificacao.updateMany({ where: { id, lidaEm: null }, data: { lidaEm: new Date() } });
    if (r.count === 0 && !(await this.prisma.db.notificacao.findUnique({ where: { id } }))) throw new NotFoundException('Notificação não encontrada.');
  }

  async marcarTodasLidas(): Promise<void> {
    await this.prisma.db.notificacao.updateMany({ where: { lidaEm: null }, data: { lidaEm: new Date() } });
  }

  // ---------------------------------------------------------------- criar (dentro do contexto do salão)

  /** Grava no painel. `chaveUnica` evita repetir o mesmo aviso (ex.: dois jobs seguidos). */
  async criar(tipo: TipoNotificacao, titulo: string, corpo: string, agendamentoId?: string): Promise<void> {
    try {
      await this.prisma.db.notificacao.create({ data: comTenant({ tipo, titulo, corpo, agendamentoId: agendamentoId ?? null }) });
    } catch (e) {
      this.logger.error(`Não consegui gravar a notificação "${titulo}": ${(e as Error).message}`);
    }
  }

  private async salao() {
    return this.prisma.db.estabelecimento.findFirstOrThrow({ select: { fusoHorario: true, emailAgendamentos: true } });
  }

  private async donoEmail(): Promise<string | null> {
    const dono = await this.prisma.db.usuario.findFirst({ where: { papel: Papel.DONO, ativo: true }, orderBy: { createdAt: 'asc' }, select: { email: true } });
    return dono?.email ?? null;
  }

  private quando(inicio: Date, fuso: string): string {
    return DateTime.fromJSDate(inicio, { zone: fuso }).toFormat("dd/MM 'às' HH:mm");
  }

  /** Dispara e segue: o erro vai para o log, nunca para quem chamou. */
  private async seguro(fn: () => Promise<void>): Promise<void> {
    try { await fn(); } catch (e) { this.logger.error(`Aviso ao dono falhou: ${(e as Error).message}`); }
  }

  agendamentoCriado(a: DadosAgendamento): void {
    void this.seguro(async () => {
      const salao = await this.salao();
      const quando = this.quando(a.inicio, salao.fusoHorario);
      await this.criar('novo_agendamento', `Novo agendamento: ${a.cliente.nome}`, `${a.servico.nome} com ${a.profissional.nome}, ${quando}.`, a.id);
      const para = salao.emailAgendamentos ? await this.donoEmail() : null;
      if (para) await this.avisos.enviar(emails.novoAgendamento({ para, link: this.avisos.link('/painel/agenda'), cliente: a.cliente.nome, servico: a.servico.nome, profissional: a.profissional.nome, quando }));
    });
  }

  agendamentoCancelado(a: DadosAgendamento, por: CanceladoPor): void {
    void this.seguro(async () => {
      const salao = await this.salao();
      const quando = this.quando(a.inicio, salao.fusoHorario);
      const automatico = por === 'AUTOMATICO';
      await this.criar(
        automatico ? 'cancelamento_automatico' : 'cancelamento',
        `${automatico ? 'Cancelado por falta de resposta' : 'Cancelamento'}: ${a.cliente.nome}`,
        `${QUEM[por]} cancelou ${a.servico.nome} com ${a.profissional.nome} (${quando}). O horário voltou a ficar livre.`,
        a.id,
      );
      // Cancelar pelo painel o próprio usuário fez: sem e-mail.
      const para = salao.emailAgendamentos && por !== 'PAINEL' ? await this.donoEmail() : null;
      if (para) await this.avisos.enviar(emails.agendamentoCancelado({ para, link: this.avisos.link('/painel/agenda'), cliente: a.cliente.nome, servico: a.servico.nome, profissional: a.profissional.nome, quando, por: QUEM[por] }));
    });
  }

  /** Lembrete que o WhatsApp não entregou (ou que falhou): o dono precisa saber, porque o cancelamento automático NÃO acontece. */
  lembreteSemEntrega(a: DadosAgendamento, fuso: string): Promise<void> {
    return this.seguro(async () => {
      const quando = this.quando(a.inicio, fuso);
      await this.criar('lembrete_sem_entrega', `Lembrete não entregue: ${a.cliente.nome}`, `O WhatsApp não confirmou a entrega do lembrete de ${a.servico.nome} (${quando}). O horário continua marcado e não será cancelado sozinho. Vale falar com o cliente.`, a.id);
      const para = await this.donoEmail();
      if (para) await this.avisos.enviar(emails.lembreteNaoEntregue({ para, link: this.avisos.link('/painel/notificacoes'), cliente: a.cliente.nome, quando }));
    });
  }

  whatsappCaiu(): Promise<void> {
    return this.seguro(async () => {
      await this.criar('whatsapp_caiu', 'O WhatsApp do salão desconectou', 'Lembretes e o bot de agendamento pararam. Reconecte em Ajustes > WhatsApp lendo o QR code de novo.');
      const para = await this.donoEmail();
      if (para) await this.avisos.enviar(emails.whatsappCaiu({ para, link: this.avisos.link('/painel/whatsapp') }));
    });
  }
}
