import { hhmmParaMinutos, minutosParaHHmm, type FaixaHorario } from '@hora-h/shared';

export interface DiaInfo {
  id: number;
  curto: string;
  longo: string;
}

/** Segunda primeiro, como o dono pensa a semana. O id segue o JavaScript (0 = domingo). */
export const DIAS: readonly DiaInfo[] = [
  { id: 1, curto: 'Seg', longo: 'Segunda' },
  { id: 2, curto: 'Ter', longo: 'Terça' },
  { id: 3, curto: 'Qua', longo: 'Quarta' },
  { id: 4, curto: 'Qui', longo: 'Quinta' },
  { id: 5, curto: 'Sex', longo: 'Sexta' },
  { id: 6, curto: 'Sáb', longo: 'Sábado' },
  { id: 0, curto: 'Dom', longo: 'Domingo' },
];

export interface FaixaCampo {
  inicio: string;
  fim: string;
}

export type SemanaCampos = Record<number, FaixaCampo[]>;

export function semanaVazia(): SemanaCampos {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/** Padrão sugerido no primeiro cadastro: seg a sáb, 09:00 às 18:00. */
export function semanaPadrao(): SemanaCampos {
  const s = semanaVazia();
  for (const d of [1, 2, 3, 4, 5, 6]) s[d] = [{ inicio: '09:00', fim: '18:00' }];
  return s;
}

export function faixasParaSemana(faixas: readonly FaixaHorario[]): SemanaCampos {
  const s = semanaVazia();
  for (const f of [...faixas].sort((a, b) => a.diaSemana - b.diaSemana || a.inicioMin - b.inicioMin)) {
    s[f.diaSemana].push({ inicio: minutosParaHHmm(f.inicioMin), fim: minutosParaHHmm(f.fimMin) });
  }
  return s;
}

/** Converte os campos da tela em faixas. Devolve a mensagem de erro se algum campo estiver errado. */
export function semanaParaFaixas(semana: SemanaCampos): { faixas: FaixaHorario[] } | { erro: string } {
  const faixas: FaixaHorario[] = [];
  for (const dia of DIAS) {
    for (const campo of semana[dia.id]) {
      const inicioMin = hhmmParaMinutos(campo.inicio);
      const fimMin = hhmmParaMinutos(campo.fim);
      if (inicioMin === null || fimMin === null) return { erro: `${dia.longo}: preencha o horário de início e de fim.` };
      if (fimMin <= inicioMin) return { erro: `${dia.longo}: o fim precisa ser depois do início.` };
      faixas.push({ diaSemana: dia.id, inicioMin, fimMin });
    }
    const doDia = faixas.filter((f) => f.diaSemana === dia.id).sort((a, b) => a.inicioMin - b.inicioMin);
    for (let i = 1; i < doDia.length; i++) {
      if (doDia[i].inicioMin < doDia[i - 1].fimMin) return { erro: `${dia.longo}: os horários estão sobrepostos.` };
    }
  }
  return { faixas };
}

/** "Seg a sáb, 09:00 às 18:00" a partir das faixas, para resumos curtos. */
export function resumoSemana(faixas: readonly FaixaHorario[]): string {
  if (!faixas.length) return 'Sem horário definido';
  const dias = DIAS.filter((d) => faixas.some((f) => f.diaSemana === d.id));
  const primeiro = dias[0].curto;
  const ultimo = dias[dias.length - 1].curto;
  const contiguo = dias.length > 2 && dias.every((d, i) => i === 0 || DIAS.indexOf(d) === DIAS.indexOf(dias[i - 1]) + 1);
  const rotulo = dias.length === 1 ? primeiro : contiguo ? `${primeiro} a ${ultimo}` : dias.map((d) => d.curto).join(', ');
  const comeco = Math.min(...faixas.map((f) => f.inicioMin));
  const fim = Math.max(...faixas.map((f) => f.fimMin));
  return `${rotulo}, ${minutosParaHHmm(comeco)} às ${minutosParaHHmm(fim)}`;
}

export function formatarDuracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const DURACOES = [15, 20, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240, 300];
