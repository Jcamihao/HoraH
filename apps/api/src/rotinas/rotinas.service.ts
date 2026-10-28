import { Injectable, Logger } from '@nestjs/common';
import { AssinaturaService } from '../assinatura/assinatura.service';
import { TenantContext } from '../common/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { LembretesService } from '../whatsapp/lembretes.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

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
    private readonly whatsapp: WhatsappService,
    private readonly lembretes: LembretesService,
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

  /**
   * Trabalho do WhatsApp, a cada poucos segundos: expira o que ficou tempo demais na fila, põe os lembretes
   * devidos na fila, manda o que está pronto (um por vez, com espaçamento), avisa o dono do que não foi
   * entregue e cancela quem não respondeu depois de receber o lembrete.
   */
  async processarWhatsapp(agora = new Date()): Promise<ResumoRotina> {
    const saloes = await this.prisma.semTenant.conexaoWhatsapp.findMany({ select: { estabelecimentoId: true } });
    let erros = 0;
    for (const { estabelecimentoId } of saloes) {
      try {
        await this.tenant.executarComo(estabelecimentoId, async () => {
          await this.whatsapp.expirarFila(agora);
          await this.lembretes.enviarDevidos(agora);
          await this.whatsapp.despachar(agora);
          await this.lembretes.avisarSemEntrega(agora);
          await this.lembretes.cancelarSemResposta(agora);
        });
      } catch (e) {
        erros += 1;
        this.logger.error(`Rotina do WhatsApp falhou no salão ${estabelecimentoId}: ${(e as Error).message}`);
      }
    }
    return { saloes: saloes.length, erros };
  }
}
