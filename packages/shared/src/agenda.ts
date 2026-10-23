export const StatusAgendamento = {
  AGENDADO: 'AGENDADO',
  CONCLUIDO: 'CONCLUIDO',
  FALTOU: 'FALTOU',
  CANCELADO: 'CANCELADO',
} as const;
export type StatusAgendamento = (typeof StatusAgendamento)[keyof typeof StatusAgendamento];

/** Informativo; não é status do agendamento (spec seção 3). A Fase 4 é quem o altera. */
export const ConfirmacaoAgendamento = {
  PENDENTE: 'PENDENTE',
  CONFIRMADO: 'CONFIRMADO',
  SEM_RESPOSTA: 'SEM_RESPOSTA',
} as const;
export type ConfirmacaoAgendamento = (typeof ConfirmacaoAgendamento)[keyof typeof ConfirmacaoAgendamento];

export const OrigemAgendamento = {
  LINK: 'LINK',
  BOT: 'BOT',
  MANUAL: 'MANUAL',
} as const;
export type OrigemAgendamento = (typeof OrigemAgendamento)[keyof typeof OrigemAgendamento];

export const CanceladoPor = {
  CLIENTE: 'CLIENTE',
  PAINEL: 'PAINEL',
  AUTOMATICO: 'AUTOMATICO',
} as const;
export type CanceladoPor = (typeof CanceladoPor)[keyof typeof CanceladoPor];

/** Horários aparecem de 30 em 30 minutos (decisão do dono do produto, 2026-10-22). */
export const PASSO_AGENDA_MIN = 30;
/** Até quantos dias à frente o cliente marca pela página pública. */
export const HORIZONTE_PUBLICO_DIAS = 60;
/** O dono/profissional marca manualmente com mais folga (casamento, evento). */
export const HORIZONTE_MANUAL_DIAS = 365;
/** Teto de horários futuros ativos por WhatsApp e salão na página pública. */
export const MAX_AGENDAMENTOS_FUTUROS_POR_WHATSAPP = 3;
