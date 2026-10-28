import { DateTime } from 'luxon';

/** Janela em que o salão manda lembrete: das 8h às 20h, no fuso do salão (spec seção 6). */
export const LEMBRETE_ABRE_H = 8;
export const LEMBRETE_FECHA_H = 20;
/** Quanto tempo o cliente tem para responder depois que o lembrete foi ENTREGUE. */
export const PRAZO_RESPOSTA_MIN = 120;
/** A contagem do prazo para durante a noite: das 22h às 8h (decisão do dono do produto, 2026-10-23). */
export const PAUSA_COMECA_H = 22;
export const PAUSA_TERMINA_H = 8;

const DIA_MS = 86_400_000;

/**
 * Quando o lembrete deve sair: 24 h antes do atendimento, mas só entre 8h e 20h do fuso do salão.
 * Antes das 8h sai às 8h do mesmo dia; depois das 20h sai às 20h.
 *
 * Nulo (só a confirmação imediata, sem lembrete e sem cancelamento automático) quando o agendamento
 * foi feito com menos de 24 h de antecedência ou quando esse horário de lembrete já passou.
 */
export function momentoDoLembrete(inicio: Date, fuso: string, agora: Date): Date | null {
  if (inicio.getTime() - agora.getTime() < DIA_MS) return null;
  const alvo = DateTime.fromJSDate(new Date(inicio.getTime() - DIA_MS), { zone: fuso });
  let saida = alvo;
  if (alvo.hour < LEMBRETE_ABRE_H) saida = alvo.set({ hour: LEMBRETE_ABRE_H, minute: 0, second: 0, millisecond: 0 });
  else if (alvo.hour >= LEMBRETE_FECHA_H) saida = alvo.set({ hour: LEMBRETE_FECHA_H, minute: 0, second: 0, millisecond: 0 });
  const instante = saida.toJSDate();
  return instante.getTime() > agora.getTime() ? instante : null;
}

/**
 * Prazo final para o cliente responder: `PRAZO_RESPOSTA_MIN` minutos de relógio ATIVO depois da entrega,
 * sem contar das 22h às 8h. Entregue às 20h vence às 22h; entregue às 21h vence às 9h (1 h antes das 22h
 * e 1 h depois das 8h).
 */
export function fimDoPrazoDeResposta(entregueEm: Date, fuso: string, minutos = PRAZO_RESPOSTA_MIN): Date {
  let cursor = DateTime.fromJSDate(entregueEm, { zone: fuso });
  let restante = minutos;
  while (restante > 0) {
    if (cursor.hour >= PAUSA_COMECA_H) {
      cursor = cursor.plus({ days: 1 }).set({ hour: PAUSA_TERMINA_H, minute: 0, second: 0, millisecond: 0 });
      continue;
    }
    if (cursor.hour < PAUSA_TERMINA_H) {
      cursor = cursor.set({ hour: PAUSA_TERMINA_H, minute: 0, second: 0, millisecond: 0 });
      continue;
    }
    const inicioPausa = cursor.set({ hour: PAUSA_COMECA_H, minute: 0, second: 0, millisecond: 0 });
    const ativo = Math.max(0, Math.floor(inicioPausa.diff(cursor, 'minutes').minutes));
    const usa = Math.min(restante, ativo);
    cursor = cursor.plus({ minutes: usa });
    restante -= usa;
    if (restante > 0) cursor = cursor.plus({ minutes: 0 }); // chegou às 22h com tempo sobrando: o próximo giro pula a noite
  }
  return cursor.toJSDate();
}
