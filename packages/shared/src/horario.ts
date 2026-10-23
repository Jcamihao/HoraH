/** Dias da semana como no JavaScript: 0 = domingo ... 6 = sábado. */
export const DIAS_SEMANA = [0, 1, 2, 3, 4, 5, 6] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

/** Uma faixa de atendimento num dia; horas guardadas em minutos desde 00:00 (0 a 1440). */
export interface FaixaHorario {
  diaSemana: number;
  inicioMin: number;
  fimMin: number;
}

/** Retorna mensagem de erro se as faixas forem inválidas (fim <= início, fora do dia ou sobrepostas no mesmo dia). */
export function validarFaixas(faixas: readonly FaixaHorario[]): string | null {
  for (const f of faixas) {
    if (!Number.isInteger(f.diaSemana) || f.diaSemana < 0 || f.diaSemana > 6) return 'Dia da semana inválido.';
    if (!Number.isInteger(f.inicioMin) || !Number.isInteger(f.fimMin)) return 'Horário inválido.';
    if (f.inicioMin < 0 || f.fimMin > 1440) return 'Horário fora do dia.';
    if (f.fimMin <= f.inicioMin) return 'O fim da faixa deve ser depois do início.';
  }
  for (const dia of DIAS_SEMANA) {
    const doDia = faixas.filter((f) => f.diaSemana === dia).sort((a, b) => a.inicioMin - b.inicioMin);
    for (let i = 1; i < doDia.length; i++) {
      if (doDia[i].inicioMin < doDia[i - 1].fimMin) return 'Há faixas de horário sobrepostas no mesmo dia.';
    }
  }
  return null;
}

export function minutosParaHHmm(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, '0');
  const m = (min % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** "08:30" -> 510. Retorna null se inválido. */
export function hhmmParaMinutos(valor: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valor);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi !== 0)) return null;
  return h * 60 + mi;
}
