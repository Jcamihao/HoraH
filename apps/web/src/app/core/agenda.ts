import { Injectable, signal } from '@angular/core';
import { ConfirmacaoAgendamento, OrigemAgendamento, StatusAgendamento } from '@hora-h/shared';

export type ModoAgenda = 'dia' | 'semana';

/**
 * O que o usuário estava olhando na agenda (dia, visão, profissional). Fica na memória do app para
 * voltar do detalhe ao mesmo ponto, em vez de cair sempre em "hoje".
 */
@Injectable({ providedIn: 'root' })
export class AgendaEstado {
  readonly modo = signal<ModoAgenda>('dia');
  /** Nulo = hoje (segue o relógio do salão). */
  readonly data = signal<string | null>(null);
  /** Vazio = todos os profissionais. */
  readonly profissionalId = signal('');
  /** Recado de uma tela anterior (ex.: bloqueio criado), mostrado uma vez na agenda. */
  readonly aviso = signal('');
}

export function rotuloStatus(s: StatusAgendamento): string {
  return { AGENDADO: 'Agendado', CONCLUIDO: 'Concluído', FALTOU: 'Faltou', CANCELADO: 'Cancelado' }[s];
}

/** Só estados que dizem algo ganham etiqueta; "agendado" é o normal e fica sem. */
export function classeStatus(s: StatusAgendamento): string {
  return { AGENDADO: '', CONCLUIDO: 'badge--ok', FALTOU: 'badge--bad', CANCELADO: '' }[s];
}

export function rotuloConfirmacao(c: ConfirmacaoAgendamento): string {
  return { PENDENTE: 'Aguardando', CONFIRMADO: 'Confirmado', SEM_RESPOSTA: 'Sem resposta' }[c];
}

export function rotuloOrigem(o: OrigemAgendamento): string {
  return { LINK: 'Link de agendamento', BOT: 'WhatsApp', MANUAL: 'Lançado no painel' }[o];
}
