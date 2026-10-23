import { PASSO_AGENDA_MIN } from '@hora-h/shared';
import { horaLocal, instanteLocal } from './tempo';

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

export interface Slot extends Intervalo {
  /** Hora de início no fuso do salão ("14:30"). */
  hora: string;
}

export interface EntradaDia {
  fuso: string;
  /** Dia no fuso do salão, "YYYY-MM-DD". */
  data: string;
  /** Faixas de trabalho do profissional NAQUELE dia da semana (minutos desde 00:00). */
  faixas: { inicioMin: number; fimMin: number }[];
  /** Agendamentos não cancelados e bloqueios do profissional que tocam o dia. */
  ocupados: Intervalo[];
  duracaoMin: number;
  /** Primeiro instante em que um atendimento pode começar (agora + antecedência mínima, no link). */
  inicioMinimo: Date;
  passoMin?: number;
}

const MS_MIN = 60_000;

/**
 * Disponibilidade = horário de trabalho − (agendamentos + bloqueios), com a duração do serviço
 * escolhido (spec seção 4, regra 1). Função pura: tudo de que depende vem em `EntradaDia`.
 *
 * Os horários seguem uma grade fixa a partir da meia-noite (09:00, 09:30...), e o atendimento
 * inteiro tem que caber numa faixa de trabalho. Encostar é permitido: quem termina às 10:00 não
 * atrapalha quem começa às 10:00.
 */
export function slotsDoDia(e: EntradaDia): Slot[] {
  const passo = e.passoMin ?? PASSO_AGENDA_MIN;
  const duracaoMs = e.duracaoMin * MS_MIN;
  const resultado: Slot[] = [];

  for (const faixa of [...e.faixas].sort((a, b) => a.inicioMin - b.inicioMin)) {
    const limite = instanteLocal(e.fuso, e.data, faixa.fimMin).instante.getTime();
    for (let min = Math.ceil(faixa.inicioMin / passo) * passo; min < faixa.fimMin; min += passo) {
      const { instante: inicio, exato } = instanteLocal(e.fuso, e.data, min);
      if (!exato) continue; // horário que não existe no relógio daquele dia (horário de verão)
      const fimMs = inicio.getTime() + duracaoMs;
      if (fimMs > limite) break; // os próximos começam mais tarde: também não cabem
      if (inicio < e.inicioMinimo) continue;
      const fim = new Date(fimMs);
      if (e.ocupados.some((o) => inicio < o.fim && fim > o.inicio)) continue;
      resultado.push({ inicio, fim, hora: horaLocal(e.fuso, inicio) });
    }
  }
  return resultado;
}
