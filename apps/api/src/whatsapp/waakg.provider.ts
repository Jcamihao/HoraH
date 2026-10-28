import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { EstadoDaSessao, SituacaoDaSessao, WhatsAppProvider, WhatsappErro } from './whatsapp.provider';

/** Eventos que o Hora H usa. Qualquer outro evento do WA-AKG (grupos, contatos, stories) nem sai de lá. */
export const EVENTOS_ASSINADOS = ['message.received', 'message.status', 'connection.update'];
const NOME_WEBHOOK = 'hora-h';

export function estadoDoWaAkg(status: string | undefined): EstadoDaSessao {
  if (status === 'CONNECTED') return 'CONECTADA';
  if (status === 'SCAN_QR') return 'AGUARDANDO_QR';
  return 'DESCONECTADA'; // STOPPED, DISCONNECTED, LOGGED_OUT e o que vier
}

/** WA-AKG (Baileys) por HTTP. Contrato conferido na documentação e contra uma instância real (QR, sessão, webhook, bot). */
@Injectable()
export class WaAkgProvider implements WhatsAppProvider {
  private readonly logger = new Logger(WaAkgProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  configurado(): boolean {
    return this.config.get('WAAKG_URL', { infer: true }) !== '';
  }

  async garantirSessao(sessaoId: string): Promise<void> {
    const existente = await this.chamar('GET', `/sessions/${sessaoId}`, undefined, [404]);
    if (!existente) {
      await this.chamar('POST', '/sessions', { name: `Hora H ${sessaoId.slice(0, 8)}`, sessionId: sessaoId });
    }
    // O bot do WA-AKG responderia sozinho às mensagens: quem conversa com o cliente é o bot do Hora H.
    await this.chamar('POST', `/sessions/${sessaoId}/bot-config`, { enabled: false });
    await this.registrarWebhook(sessaoId);
    const estado = existente?.data?.status as string | undefined;
    if (estado !== 'CONNECTED' && estado !== 'SCAN_QR') await this.chamar('POST', `/sessions/${sessaoId}/start`, {});
  }

  private async registrarWebhook(sessaoId: string): Promise<void> {
    const url = this.config.get('WAAKG_WEBHOOK_URL', { infer: true });
    const secret = this.config.get('WAAKG_WEBHOOK_SECRET', { infer: true });
    const lista = await this.chamar('GET', `/webhooks/${sessaoId}`);
    const nossos = ((lista?.data ?? []) as { id: string; name: string; url: string; isActive: boolean }[]).filter((w) => w.name === NOME_WEBHOOK);
    const corpo = { name: NOME_WEBHOOK, url, secret, events: EVENTOS_ASSINADOS, isActive: true };
    if (!nossos.length) {
      await this.chamar('POST', `/webhooks/${sessaoId}`, corpo);
      return;
    }
    // Mantém um só e sempre com a URL e o segredo atuais (se mudarem no deploy, a próxima conexão corrige).
    await this.chamar('PUT', `/webhooks/${sessaoId}/${nossos[0].id}`, corpo);
    for (const extra of nossos.slice(1)) await this.chamar('DELETE', `/webhooks/${sessaoId}/${extra.id}`, undefined, [404]);
  }

  async situacao(sessaoId: string): Promise<SituacaoDaSessao> {
    const r = await this.chamar('GET', `/sessions/${sessaoId}`);
    const estado = estadoDoWaAkg(r?.data?.status);
    let qr: string | null = null;
    if (estado === 'AGUARDANDO_QR') {
      qr = (r?.data?.qr as string | null) ?? null;
      if (!qr) qr = ((await this.chamar('GET', `/sessions/${sessaoId}/qr`, undefined, [404]))?.qr as string | undefined) ?? null;
    }
    return { estado, qr };
  }

  async codigoDePareamento(sessaoId: string, telefone: string): Promise<string> {
    const r = await this.chamar('POST', `/sessions/${sessaoId}/pair`, { phoneNumber: telefone });
    const codigo = r?.data?.pairingCode as string | undefined;
    if (!codigo) throw new WhatsappErro('O WhatsApp não devolveu o código de pareamento.');
    return codigo;
  }

  async desconectar(sessaoId: string): Promise<void> {
    await this.chamar('POST', `/sessions/${sessaoId}/logout`, {}, [404]);
    // Depois do logout o WA-AKG sozinho gera um QR novo; parar a sessão evita ficar "aguardando leitura" sem o dono ter pedido.
    await this.chamar('POST', `/sessions/${sessaoId}/stop`, {}, [404]).catch(() => undefined);
  }

  async enviarTexto(sessaoId: string, telefone: string, texto: string): Promise<{ mensagemId: string }> {
    const jid = encodeURIComponent(`${telefone}@s.whatsapp.net`);
    const r = await this.chamar('POST', `/messages/${sessaoId}/${jid}/send`, { message: { text: texto } });
    const id = r?.data?.key?.id as string | undefined;
    if (!id) throw new WhatsappErro('O WhatsApp não devolveu o id da mensagem enviada.');
    return { mensagemId: id };
  }

  /** `toleradas`: status HTTP que significam "não existe" e devolvem null em vez de erro. */
  private async chamar(metodo: string, caminho: string, corpo?: unknown, toleradas: number[] = []): Promise<any> {
    if (!this.configurado()) throw new WhatsappErro('O WhatsApp ainda não está configurado neste ambiente.');
    let res: Response;
    try {
      res = await fetch(`${this.config.get('WAAKG_URL', { infer: true })}/api${caminho}`, {
        method: metodo,
        headers: { 'content-type': 'application/json', 'x-api-key': this.config.get('WAAKG_API_KEY', { infer: true }) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new WhatsappErro(`Não consegui falar com o WhatsApp: ${(e as Error).message}`);
    }
    const texto = await res.text();
    let json: any;
    try { json = texto ? JSON.parse(texto) : {}; } catch { json = {}; }
    if (toleradas.includes(res.status)) return null;
    if (!res.ok || json?.status === false) {
      const msg = json?.message || json?.error || `O WhatsApp respondeu ${res.status}`;
      this.logger.warn(`WA-AKG ${metodo} ${caminho} -> ${res.status}: ${msg}`);
      throw new WhatsappErro(String(msg), res.status);
    }
    return json;
  }
}
