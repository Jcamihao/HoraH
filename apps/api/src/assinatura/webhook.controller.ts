import { Body, Controller, Headers, HttpCode, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Publico } from '../common/decorators';
import { TenantContext } from '../common/tenant-context';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasPagamento } from './asaas.client';
import { AssinaturaService } from './assinatura.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O evento diz o que aconteceu com mais certeza do que o campo `status` do corpo (que pode vir defasado). */
const STATUS_DO_EVENTO: Record<string, string> = {
  PAYMENT_CONFIRMED: 'CONFIRMED',
  PAYMENT_RECEIVED: 'RECEIVED',
  PAYMENT_OVERDUE: 'OVERDUE',
  PAYMENT_DELETED: 'DELETED',
  PAYMENT_REFUNDED: 'REFUNDED',
  PAYMENT_CHARGEBACK_REQUESTED: 'CHARGEBACK_REQUESTED',
};

function igual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Webhook do Asaas. Chega sem login: a autenticidade vem do token no cabeçalho `asaas-access-token`.
 * Todo evento é gravado antes de agir; o id do evento é único, então a reentrega não repete efeito.
 * Usa `semTenant` porque descobre o salão pelo id da assinatura (conta na allowlist de auditoria).
 */
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly assinatura: AssinaturaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Publico()
  @HttpCode(200)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post('asaas')
  async asaas(@Headers('asaas-access-token') token: string | undefined, @Body() corpo: Record<string, any>): Promise<{ ok: true }> {
    const esperado = this.config.get('ASAAS_WEBHOOK_TOKEN', { infer: true });
    if (!esperado || !token || !igual(token, esperado)) throw new UnauthorizedException('Token inválido.');

    const eventoId = typeof corpo?.['id'] === 'string' ? corpo['id'] : null;
    const tipo = typeof corpo?.['event'] === 'string' ? corpo['event'] : null;
    if (!eventoId || !tipo) return { ok: true }; // nada que processar, e erro só faria o Asaas insistir

    const pagamentoBruto = corpo['payment'] && typeof corpo['payment'] === 'object' ? corpo['payment'] : null;
    const db = this.prisma.semTenant;
    let registro = await db.asaasEvento.findUnique({ where: { eventoId } });
    if (!registro) {
      try {
        registro = await db.asaasEvento.create({
          data: { eventoId, tipo, asaasPaymentId: pagamentoBruto?.id ?? null, payload: corpo as Prisma.InputJsonValue },
        });
      } catch (e) {
        // Duas entregas do mesmo evento ao mesmo tempo: a outra cuida.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: true };
        throw e;
      }
    } else if (registro.processadoEm) {
      return { ok: true };
    }

    const assinaturaId = pagamentoBruto?.subscription ?? corpo['subscription']?.id ?? null;
    let salao = assinaturaId ? await db.assinatura.findUnique({ where: { asaasSubscriptionId: String(assinaturaId) }, select: { estabelecimentoId: true } }) : null;
    const referencia = pagamentoBruto?.externalReference ?? corpo['subscription']?.externalReference;
    if (!salao && typeof referencia === 'string' && UUID.test(referencia)) {
      salao = await db.assinatura.findUnique({ where: { estabelecimentoId: referencia }, select: { estabelecimentoId: true } });
    }

    if (salao) {
      await this.tenant.executarComo(salao.estabelecimentoId, async () => {
        if (pagamentoBruto) {
          const pagamento: AsaasPagamento = {
            id: String(pagamentoBruto.id),
            status: STATUS_DO_EVENTO[tipo] ?? String(pagamentoBruto.status ?? 'PENDING'),
            value: Number(pagamentoBruto.value ?? 0),
            dueDate: String(pagamentoBruto.dueDate),
            invoiceUrl: pagamentoBruto.invoiceUrl ?? null,
            subscription: pagamentoBruto.subscription ?? null,
            paymentDate: pagamentoBruto.paymentDate ?? pagamentoBruto.clientPaymentDate ?? null,
          };
          await this.assinatura.aplicarPagamento(pagamento);
        } else if (tipo === 'SUBSCRIPTION_DELETED' || tipo === 'SUBSCRIPTION_INACTIVATED') {
          await this.assinatura.marcarCancelamentoNoAsaas();
        }
      });
    } else {
      this.logger.warn(`Evento ${tipo} (${eventoId}) de uma assinatura que não conhecemos; só registrado.`);
    }
    await db.asaasEvento.update({ where: { eventoId }, data: { estabelecimentoId: salao?.estabelecimentoId ?? null, processadoEm: new Date() } });
    return { ok: true };
  }
}
