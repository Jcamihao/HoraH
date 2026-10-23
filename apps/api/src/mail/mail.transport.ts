import { Logger } from '@nestjs/common';

export interface Email {
  para: string;
  assunto: string;
  texto: string;
  html?: string;
}

export interface MailTransport {
  enviar(email: Email): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** Resend por HTTP (sem SDK). Qualquer resposta que não seja 2xx é erro: quem chama decide se tenta de novo. */
export class ResendTransport implements MailTransport {
  constructor(
    private readonly chave: string,
    private readonly de: string,
    private readonly base = 'https://api.resend.com',
  ) {}

  async enviar(email: Email): Promise<void> {
    const res = await fetch(`${this.base}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.chave}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.de, to: [email.para], subject: email.assunto, text: email.texto, html: email.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** Desenvolvimento: o e-mail aparece no log em vez de sair. */
export class LogTransport implements MailTransport {
  private readonly logger = new Logger('Mail');

  async enviar(email: Email): Promise<void> {
    this.logger.log(`E-mail para ${email.para}: ${email.assunto}\n${email.texto}`);
  }
}

/** Teste: guarda o que seria enviado para a suíte conferir. */
export class MemoryTransport implements MailTransport {
  static readonly caixa: Email[] = [];
  /** Liga uma falha para testar a repetição de envio. */
  static falhar = false;

  async enviar(email: Email): Promise<void> {
    if (MemoryTransport.falhar) throw new Error('falha simulada no envio');
    MemoryTransport.caixa.push(email);
  }
}
