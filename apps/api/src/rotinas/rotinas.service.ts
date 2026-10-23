import { Injectable, Logger } from '@nestjs/common';
import { AssinaturaService } from '../assinatura/assinatura.service';
import { TenantContext } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';

export interface ResumoRotina {
  saloes: number;
  erros: number;
}

/**
 * Trabalho periódico. Cada passo é idempotente (usa o relógio e marcas no banco), então pode rodar a
 * qualquer hora, duas vezes seguidas ou depois de uma queda sem duplicar e-mail nem bloquear errado.
 */
@Injectable()
export class RotinasService {
  private readonly logger = new Logger(RotinasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly assinatura: AssinaturaService,
  ) {}

  /** Passa por todos os salões; um que falha não impede os outros. */
  async processarAssinaturas(agora = new Date()): Promise<ResumoRotina> {
    const saloes = await this.prisma.semTenant.assinatura.findMany({ select: { estabelecimentoId: true } });
    let erros = 0;
    for (const { estabelecimentoId } of saloes) {
      try {
        await this.tenant.executarComo(estabelecimentoId, () => this.assinatura.rotina(agora));
      } catch (e) {
        erros += 1;
        this.logger.error(`Rotina de assinatura falhou no salão ${estabelecimentoId}: ${(e as Error).message}`);
      }
    }
    return { saloes: saloes.length, erros };
  }
}
