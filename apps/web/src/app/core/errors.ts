import { HttpErrorResponse } from '@angular/common/http';
import type { FaixaMudaDto } from '@hora-h/shared';

/** Traduz erro de rede ou da API para uma frase que diz o problema e o que fazer. */
export function mensagemDeErro(e: unknown, padrao = 'Não deu certo. Tente de novo.'): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
    if (e.status === 429) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
    if (e.status >= 500) return 'O servidor teve um problema. Tente de novo em instantes.';
    const msg = e.error?.message;
    if (Array.isArray(msg) && msg.length) return String(msg[0]);
    if (typeof msg === 'string' && msg) return msg;
  }
  return padrao;
}

/** Adicionar ou reativar um profissional muda a faixa do plano: o servidor pede a confirmação do dono (409). */
export function faixaMuda(e: unknown): FaixaMudaDto | null {
  if (e instanceof HttpErrorResponse && e.status === 409 && e.error?.code === 'FAIXA_MUDA') return e.error as FaixaMudaDto;
  return null;
}
