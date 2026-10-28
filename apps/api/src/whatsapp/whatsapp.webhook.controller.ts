import { Body, Controller, Headers, HttpCode, Logger, Post, RawBodyRequest, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { telefoneDoJid } from '@hora-h/shared';
import { Publico } from '../common/decorators';
import { TenantContext } from '../common/tenant-context';
import type { Env } from '../config/env';
import { comTenant, PrismaService } from '../prisma/prisma.service';
import { BotService } from './bot.service';
import { LembretesService } from './lembretes.service';
import { estadoDoWaAkg } from './waakg.provider';
import { WhatsappService } from './whatsapp.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Quanto esperar (no total, ~1,6 s) pelo id de uma mensagem que ainda está sendo gravada. */
const ESPERAS_DO_ID_MS = [100, 200, 300, 400, 600];
const STATUS: Record<string, 'ENVIADA' | 'ENTREGUE' | 'LIDA'> = { SENT: 'ENVIADA', DELIVERED: 'ENTREGUE', READ: 'LIDA' };

/**
 * Webhook do WA-AKG. Chega sem login: a autenticidade vem da assinatura HMAC-SHA256 do corpo CRU, com o
 * segredo combinado (`X-Webhook-Signature: sha256=...`). O nome da sessão é o id do salão, então o salão sai do
 * próprio evento (e um id que não existe simplesmente não acha nada). O WA-AKG não reenvia webhook que falhou:
 * por isso respondemos 200 depois de validar, e o que se perder cai no caminho seguro (sem entrega confirmada,
 * nada é cancelado e o dono é avisado).
 */
@Controller('webhooks')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly config: ConfigService<Env, true>,
    private readonly whatsapp: WhatsappService,
    private readonly lembretes: LembretesService,
    private readonly bot: BotService,
  ) {}

  @Publico()
  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post('whatsapp')
  async receber(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') assinatura: string | undefined,
    @Body() corpo: Record<string, any>,
  ): Promise<{ ok: true }> {
    const segredo = this.config.get('WAAKG_WEBHOOK_SECRET', { infer: true });
    if (!segredo || !assinatura || !req.rawBody || !this.assinaturaValida(segredo, req.rawBody, assinatura)) {
      throw new UnauthorizedException('Assinatura inválida.');
    }
    const sessaoId = String(corpo?.['sessionId'] ?? '');
    const evento = String(corpo?.['event'] ?? '');
    if (!UUID.test(sessaoId)) return { ok: true };
    try {
      await this.tenant.executarComo(sessaoId, async () => {
        if (!(await this.prisma.db.conexaoWhatsapp.findFirst())) return; // salão desconhecido ou sem WhatsApp
        const data = (corpo['data'] ?? {}) as Record<string, any>;
        if (evento === 'message.received') await this.mensagemRecebida(data);
        else if (evento === 'message.status') await this.statusDaMensagem(data);
        else if (evento === 'connection.update') await this.whatsapp.aoMudarConexao(estadoDoWaAkg(data['status']));
      });
    } catch (e) {
      this.logger.error(`Evento ${evento} do salão ${sessaoId} falhou: ${(e as Error).message}`);
    }
    return { ok: true };
  }

  private assinaturaValida(segredo: string, corpoCru: Buffer, recebida: string): boolean {
    const esperada = `sha256=${createHmac('sha256', segredo).update(corpoCru).digest('hex')}`;
    const a = Buffer.from(esperada);
    const b = Buffer.from(recebida);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async mensagemRecebida(data: Record<string, any>): Promise<void> {
    if (data['isGroup'] || data['chatType'] === 'GROUP' || data['key']?.fromMe || data['fromMe']) return;
    if (data['type'] && data['type'] !== 'TEXT') return; // o bot só entende texto
    const texto = typeof data['content'] === 'string' ? data['content'].trim() : '';
    const telefone = typeof data['from'] === 'string' ? telefoneDoJid(data['from']) : null;
    if (!texto || !telefone) return;

    const waId = data['key']?.id ?? data['id'] ?? data['messageId'] ?? null;
    try {
      await this.prisma.db.mensagemLog.create({
        data: comTenant({
          direcao: 'RECEBIDA', tipo: 'BOT', status: 'ENTREGUE', telefone, texto: texto.slice(0, 2000),
          chave: waId ? `in:${waId}` : null, waMensagemId: waId, entregueEm: new Date(),
        }),
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return; // mesma mensagem entregue duas vezes
      throw e;
    }
    await this.bot.receber(telefone, texto);
  }

  private async statusDaMensagem(data: Record<string, any>): Promise<void> {
    const status = STATUS[String(data['status'])];
    const keyId = data['keyId'];
    if (!status || typeof keyId !== 'string') return;
    const agora = new Date();
    // O aviso de entrega pode chegar antes de terminarmos de gravar o id da mensagem recém-enviada
    // (o envio e o webhook correm em paralelo): espera um instante em vez de perder a confirmação.
    let msg = await this.whatsapp.registrarStatus(keyId, status, agora);
    for (let tentativa = 0; !msg && tentativa < ESPERAS_DO_ID_MS.length; tentativa++) {
      await new Promise((r) => setTimeout(r, ESPERAS_DO_ID_MS[tentativa]));
      msg = await this.whatsapp.registrarStatus(keyId, status, agora);
    }
    // O lembrete foi ENTREGUE: começa a contagem para o cliente responder.
    if (msg && msg.tipo === 'LEMBRETE' && msg.agendamentoId && (status === 'ENTREGUE' || status === 'LIDA')) {
      await this.lembretes.aoEntregar(msg.agendamentoId, msg.entregueEm ?? agora);
    }
  }
}
