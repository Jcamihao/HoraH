import { DateTime } from 'luxon';

/**
 * Tudo no banco é instante UTC; o dia e a hora que o dono e o cliente enxergam são os do FUSO DO
 * SALÃO. Estas funções são a única ponte entre os dois (nada de `new Date(ano, mes, dia)`, que
 * usaria o fuso do servidor).
 */

export function fusoValido(fuso: string): boolean {
  return DateTime.utc().setZone(fuso).isValid;
}

/** "YYYY-MM-DD" que existe no calendário. */
export function dataValida(data: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(data) && DateTime.fromISO(data, { zone: 'utc' }).isValid;
}

/** Hoje no fuso do salão, "YYYY-MM-DD". */
export function hojeNoFuso(fuso: string, agora: Date = new Date()): string {
  return DateTime.fromJSDate(agora, { zone: fuso }).toISODate()!;
}

export function somarDias(data: string, dias: number): string {
  return DateTime.fromISO(data, { zone: 'utc' }).plus({ days: dias }).toISODate()!;
}

/** Quantos dias de `a` até `b` (b - a), ambos "YYYY-MM-DD". */
export function diasEntre(a: string, b: string): number {
  return Math.round(DateTime.fromISO(b, { zone: 'utc' }).diff(DateTime.fromISO(a, { zone: 'utc' }), 'days').days);
}

/** 0 = domingo ... 6 = sábado (mesma convenção dos horários de trabalho). */
export function diaDaSemana(data: string): number {
  return DateTime.fromISO(data, { zone: 'utc' }).weekday % 7;
}

/** Meia-noite local do dia até a meia-noite local do dia seguinte, como instantes. */
export function limitesDoDia(fuso: string, data: string): { inicio: Date; fim: Date } {
  const inicio = DateTime.fromISO(data, { zone: fuso });
  return { inicio: inicio.toJSDate(), fim: inicio.plus({ days: 1 }).toJSDate() };
}

/**
 * "Minuto `min` do dia `data`" (0..1440) no fuso do salão. `exato` é falso quando esse horário
 * não existe no relógio daquele dia (salto do horário de verão): o instante vem ajustado.
 */
export function instanteLocal(fuso: string, data: string, min: number): { instante: Date; exato: boolean } {
  const base = DateTime.fromISO(data, { zone: fuso });
  const dt = min >= 1440 ? base.plus({ days: 1 }) : base.set({ hour: Math.floor(min / 60), minute: min % 60 });
  const exato = min >= 1440 || dt.hour * 60 + dt.minute === min;
  return { instante: dt.toJSDate(), exato };
}

/** "14:30" no fuso do salão. */
export function horaLocal(fuso: string, instante: Date): string {
  return DateTime.fromJSDate(instante, { zone: fuso }).toFormat('HH:mm');
}

export function dataLocal(fuso: string, instante: Date): string {
  return DateTime.fromJSDate(instante, { zone: fuso }).toISODate()!;
}

/** Texto digitado em horário local ("2026-10-25T14:30") -> instante. Nulo se inválido. */
export function localParaInstante(fuso: string, texto: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(texto)) return null;
  const dt = DateTime.fromISO(texto, { zone: fuso });
  return dt.isValid ? dt.toJSDate() : null;
}
