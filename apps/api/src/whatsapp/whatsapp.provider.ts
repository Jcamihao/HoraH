/**
 * Tudo que o Hora H precisa de um serviço de WhatsApp, e nada além (spec 7.1). O resto do sistema só
 * conhece esta interface: trocar o WA-AKG (Baileys, não oficial) pela API oficial da Meta é escrever outra
 * implementação, sem tocar em agenda, lembretes ou bot.
 */
export type EstadoDaSessao = 'DESCONECTADA' | 'AGUARDANDO_QR' | 'CONECTADA';

export interface SituacaoDaSessao {
  estado: EstadoDaSessao;
  /** Texto do QR code (a tela o desenha), só quando aguarda leitura. */
  qr: string | null;
}

export interface WhatsAppProvider {
  /** Falso quando o serviço não está configurado neste ambiente. */
  configurado(): boolean;
  /** Cria a sessão se não existir, deixa o webhook registrado e a inicia. Pode ser chamada de novo sem efeito colateral. */
  garantirSessao(sessaoId: string): Promise<void>;
  situacao(sessaoId: string): Promise<SituacaoDaSessao>;
  /** Alternativa ao QR: código de 8 caracteres digitado no WhatsApp (serve quando o celular do salão é o próprio que vai conectar). */
  codigoDePareamento(sessaoId: string, telefone: string): Promise<string>;
  desconectar(sessaoId: string): Promise<void>;
  /** `telefone` na forma canônica 55 + DDD + número. Devolve o id da mensagem, pelo qual a entrega volta. */
  enviarTexto(sessaoId: string, telefone: string, texto: string): Promise<{ mensagemId: string }>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export class WhatsappErro extends Error {
  constructor(
    message: string,
    /** Status HTTP do serviço (503 = sessão desconectada). */
    readonly statusHttp?: number,
  ) {
    super(message);
    this.name = 'WhatsappErro';
  }
}

/** O que chega por webhook, já traduzido para o nosso vocabulário. */
export type EventoWhatsapp =
  | { tipo: 'mensagem'; sessaoId: string; telefone: string; texto: string; mensagemId: string | null }
  | { tipo: 'status'; sessaoId: string; mensagemId: string; status: 'ENVIADA' | 'ENTREGUE' | 'LIDA' }
  | { tipo: 'conexao'; sessaoId: string; estado: EstadoDaSessao };
