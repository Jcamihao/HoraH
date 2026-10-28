import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const CHAVE_WAAKG = 'chave-fake-do-waakg';
export const SEGREDO_WEBHOOK = 'segredo-do-webhook-whatsapp';
export const URL_WEBHOOK = 'https://api.exemplo.com/api/webhooks/whatsapp';

export interface SessaoFake {
  sessionId: string;
  status: 'STOPPED' | 'SCAN_QR' | 'CONNECTED' | 'DISCONNECTED' | 'LOGGED_OUT';
  qr: string | null;
  botAtivo: boolean;
  webhooks: { id: string; name: string; url: string; secret: string; events: string[]; isActive: boolean }[];
}

export interface EnvioFake {
  sessionId: string;
  jid: string;
  texto: string;
  id: string;
}

/**
 * WA-AKG de mentira com o formato de resposta que uma instância real devolveu (sessão, QR, webhook, bot-config)
 * e o que a documentação descreve para envio e pareamento. Não faz WhatsApp: serve para testar o Hora H.
 */
export class WaAkgFake {
  sessoes = new Map<string, SessaoFake>();
  envios: EnvioFake[] = [];
  chamadas: { metodo: string; caminho: string; corpo: any }[] = [];
  /** Quantos envios devem falhar com 503 (sessão fora do ar). */
  falhasDeEnvio = 0;
  /** Como o WA-AKG de verdade: logo depois de `start` a sessão ainda aparece parada, antes de gerar o QR. */
  demoraParaGerarQr = false;
  private seq = 0;
  private servidor!: Server;
  url = '';

  async iniciar(porta = 0): Promise<this> {
    this.servidor = createServer((req, res) => void this.tratar(req, res));
    await new Promise<void>((ok) => this.servidor.listen(porta, '127.0.0.1', ok));
    this.url = `http://127.0.0.1:${(this.servidor.address() as AddressInfo).port}`;
    return this;
  }

  async parar(): Promise<void> {
    this.servidor.closeAllConnections?.();
    await new Promise<void>((ok) => this.servidor.close(() => ok()));
  }

  /** O QR finalmente fica pronto. */
  gerarQr(sessionId: string): void {
    const s = this.sessoes.get(sessionId)!;
    s.status = 'SCAN_QR';
    s.qr = `https://wa.me/settings/linked_devices#2@fake-${sessionId}`;
  }

  conectar(sessionId: string): void {
    const s = this.sessoes.get(sessionId)!;
    s.status = 'CONNECTED';
    s.qr = null;
  }

  private async corpoDe(req: IncomingMessage): Promise<any> {
    const partes: Buffer[] = [];
    for await (const p of req) partes.push(p as Buffer);
    const t = Buffer.concat(partes).toString('utf8');
    return t ? JSON.parse(t) : undefined;
  }

  private async tratar(req: IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
    const enviar = (status: number, corpo: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(corpo));
    };
    const erro = (status: number, msg: string) => enviar(status, { status: false, message: msg, error: msg });
    const corpo = await this.corpoDe(req);
    const metodo = req.method ?? 'GET';
    const caminho = (req.url ?? '').replace(/^\/api/, '');
    this.chamadas.push({ metodo, caminho, corpo });
    if (req.headers['x-api-key'] !== CHAVE_WAAKG) return erro(401, 'Unauthorized');

    if (metodo === 'POST' && caminho === '/sessions') {
      const id = corpo.sessionId as string;
      this.sessoes.set(id, { sessionId: id, status: 'STOPPED', qr: null, botAtivo: true, webhooks: [] });
      return enviar(200, { status: true, message: 'Session created successfully', data: { sessionId: id, status: 'STOPPED', qr: null } });
    }
    let m = /^\/sessions\/([^/]+)(?:\/([^/]+))?$/.exec(caminho);
    if (m) {
      const s = this.sessoes.get(m[1]);
      if (!s) return erro(404, 'Session not found');
      const acao = m[2];
      if (metodo === 'GET' && !acao) return enviar(200, { status: true, message: 'Session details retrieved successfully', data: { sessionId: s.sessionId, status: s.status, qr: s.qr } });
      if (metodo === 'GET' && acao === 'qr') return s.qr ? enviar(200, { success: true, qr: s.qr }) : erro(404, 'QR not available yet');
      if (metodo === 'POST' && acao === 'start') {
        if (s.status !== 'CONNECTED' && !this.demoraParaGerarQr) { s.status = 'SCAN_QR'; s.qr = `https://wa.me/settings/linked_devices#2@fake-${s.sessionId}`; }
        return enviar(200, { status: true, message: 'Session started successfully' });
      }
      if (metodo === 'POST' && acao === 'bot-config') { s.botAtivo = corpo.enabled !== false; return enviar(200, { status: true, data: corpo }); }
      if (metodo === 'POST' && acao === 'pair') return enviar(200, { status: true, message: 'Pairing code generated', data: { pairingCode: 'ABCD-1234' } });
      if (metodo === 'POST' && acao === 'logout') { s.status = 'LOGGED_OUT'; s.qr = null; return enviar(200, { status: true, message: 'Logged out' }); }
      if (metodo === 'POST' && acao === 'stop') { s.status = 'STOPPED'; s.qr = null; return enviar(200, { status: true, message: 'Session stopped' }); }
    }
    m = /^\/webhooks\/([^/]+)(?:\/([^/]+))?$/.exec(caminho);
    if (m) {
      const s = this.sessoes.get(m[1]);
      if (!s) return erro(404, 'Session not found');
      if (metodo === 'GET' && !m[2]) return enviar(200, { status: true, data: s.webhooks });
      if (metodo === 'POST' && !m[2]) {
        if (!corpo.url?.startsWith('https://')) return erro(400, "Invalid webhook URL: Protocol 'http:' is not allowed. Only HTTPS is supported.");
        const w = { id: `wh_${++this.seq}`, name: corpo.name, url: corpo.url, secret: corpo.secret, events: corpo.events, isActive: true };
        s.webhooks.push(w);
        return enviar(200, { status: true, message: 'Webhook created successfully', data: w });
      }
      if (metodo === 'PUT' && m[2]) {
        const w = s.webhooks.find((x) => x.id === m![2]);
        if (!w) return erro(404, 'Webhook not found');
        Object.assign(w, corpo);
        return enviar(200, { status: true, data: w });
      }
      if (metodo === 'DELETE' && m[2]) {
        s.webhooks = s.webhooks.filter((x) => x.id !== m![2]);
        return enviar(200, { status: true });
      }
    }
    m = /^\/messages\/([^/]+)\/([^/]+)\/send$/.exec(caminho);
    if (m && metodo === 'POST') {
      const s = this.sessoes.get(m[1]);
      if (!s) return erro(404, 'Session not found');
      if (s.status !== 'CONNECTED' || this.falhasDeEnvio > 0) {
        if (this.falhasDeEnvio > 0) this.falhasDeEnvio -= 1;
        return erro(503, 'Session not connected or ready');
      }
      const jid = decodeURIComponent(m[2]);
      const id = `3EB0FAKE${String(++this.seq).padStart(6, '0')}`;
      this.envios.push({ sessionId: m[1], jid, texto: corpo?.message?.text, id });
      return enviar(200, { status: true, message: 'Message sent successfully', data: { key: { remoteJid: jid, fromMe: true, id }, message: { conversation: corpo?.message?.text } } });
    }
    return erro(404, `Rota desconhecida no fake: ${metodo} ${caminho}`);
  }
}

/** Corpo e cabeçalho de um webhook assinado como o WA-AKG assina (HMAC-SHA256 do corpo cru). */
export function webhookAssinado(evento: string, sessionId: string, data: unknown, segredo = SEGREDO_WEBHOOK): { corpo: string; assinatura: string } {
  const corpo = JSON.stringify({ event: evento, sessionId, timestamp: new Date().toISOString(), data });
  return { corpo, assinatura: `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}` };
}
