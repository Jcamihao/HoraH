import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Env } from '../config/env';
import { TenantContext } from '../common/tenant-context';
import { comTenant, PrismaService } from '../prisma/prisma.service';
import { Email, MAIL_TRANSPORT, MailTransport } from './mail.transport';

export type ResultadoAviso = 'enviado' | 'repetido' | 'falhou';

/**
 * Manda cada aviso no máximo uma vez por (salão, chave). Reserva a chave ANTES de enviar: dois jobs
 * simultâneos ou a reexecução depois de uma queda nunca duplicam o e-mail. Se o envio falha, a reserva
 * é desfeita e a próxima execução tenta de novo.
 */
@Injectable()
export class AvisosService {
  private readonly logger = new Logger(AvisosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly config: ConfigService<Env, true>,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  /** Endereço do painel, para os botões dos e-mails. */
  link(caminho: string): string {
    return `${this.config.get('APP_BASE_URL', { infer: true })}${caminho}`;
  }

  enviarUmaVez(estabelecimentoId: string, chave: string, tipo: string, email: Email): Promise<ResultadoAviso> {
    return this.tenant.executarComo(estabelecimentoId, async () => {
      let id: string;
      try {
        id = (await this.prisma.db.avisoEmail.create({ data: comTenant({ chave, tipo }) })).id;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'repetido';
        throw e;
      }
      try {
        await this.transport.enviar(email);
        return 'enviado';
      } catch (e) {
        this.logger.error(`Falha ao enviar "${tipo}" (${chave}) para ${email.para}: ${(e as Error).message}`);
        await this.prisma.db.avisoEmail.deleteMany({ where: { id } });
        return 'falhou';
      }
    });
  }

  /** Envio sem deduplicação (eventos que acontecem de verdade a cada vez, como "novo agendamento"). Nunca lança. */
  async enviar(email: Email): Promise<boolean> {
    try {
      await this.transport.enviar(email);
      return true;
    } catch (e) {
      this.logger.error(`Falha ao enviar "${email.assunto}" para ${email.para}: ${(e as Error).message}`);
      return false;
    }
  }
}
