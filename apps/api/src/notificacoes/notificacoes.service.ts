import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Papel, type CanceladoPor } from '@hora-h/shared';
import { AvisosService } from '../mail/avisos.service';
import { emails } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';

interface DadosAgendamento {
  inicio: Date;
  cliente: { nome: string };
  servico: { nome: string };
  profissional: { nome: string };
}

const QUEM: Record<CanceladoPor, string> = { CLIENTE: 'O cliente', PAINEL: 'Alguém do salão', AUTOMATICO: 'O sistema' };

/**
 * Avisos ao dono por e-mail quando alguém marca ou cancela (spec 8.3). Nunca lança: avisar é um extra e não
 * pode derrubar a marcação do cliente. A lista de notificações dentro do painel fica para a Fase 4.
 */
@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger(NotificacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: AvisosService,
  ) {}

  /** Chamar dentro do contexto do salão. Dispara e segue; o erro vai para o log. */
  agendamentoCriado(a: DadosAgendamento): void {
    void this.avisar((salao, para) =>
      emails.novoAgendamento({ para, link: this.avisos.link('/painel/agenda'), cliente: a.cliente.nome, servico: a.servico.nome, profissional: a.profissional.nome, quando: this.quando(a.inicio, salao) }),
    );
  }

  agendamentoCancelado(a: DadosAgendamento, por: CanceladoPor): void {
    void this.avisar((salao, para) =>
      emails.agendamentoCancelado({ para, link: this.avisos.link('/painel/agenda'), cliente: a.cliente.nome, servico: a.servico.nome, profissional: a.profissional.nome, quando: this.quando(a.inicio, salao), por: QUEM[por] }),
    );
  }

  private quando(inicio: Date, fuso: string): string {
    return DateTime.fromJSDate(inicio, { zone: fuso }).toFormat("dd/MM 'às' HH:mm");
  }

  private async avisar(montar: (fuso: string, para: string) => ReturnType<typeof emails.novoAgendamento>): Promise<void> {
    try {
      const salao = await this.prisma.db.estabelecimento.findFirstOrThrow({ select: { fusoHorario: true, emailAgendamentos: true } });
      if (!salao.emailAgendamentos) return;
      const dono = await this.prisma.db.usuario.findFirst({ where: { papel: Papel.DONO, ativo: true }, orderBy: { createdAt: 'asc' }, select: { email: true } });
      if (!dono) return;
      await this.avisos.enviar(montar(salao.fusoHorario, dono.email));
    } catch (e) {
      this.logger.error(`Não consegui montar o aviso ao dono: ${(e as Error).message}`);
    }
  }
}
