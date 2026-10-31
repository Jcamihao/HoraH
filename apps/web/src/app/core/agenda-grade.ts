import type { FaixaHorario, StatusAgendamento } from '@hora-h/shared';
import type { ModoAgenda } from './agenda';
import { anoDaData, dataDoInstante, diaDoMes, inicioDaSemana, mesCurto, somarDias } from './datas';

/**
 * Contas das três visões da agenda (dia, semana, mês). Tudo sobre datas "puras" (YYYY-MM-DD) e
 * sem depender de tela: a página só desenha o que sai daqui.
 */

/** A API aceita no máximo 62 dias por consulta; o mês com as bordas da grade cabe em 42. */
export const MAX_DIAS_CONSULTA = 62;

/** Faixa de horas mostrada quando o salão ainda não cadastrou o horário de funcionamento: 7h às 20h. */
export const HORAS_PADRAO: readonly number[] = Array.from({ length: 13 }, (_, i) => 7 + i);

export interface Janela {
  de: string;
  ate: string;
}

export interface CelulaMes {
  data: string;
  /** Falso para os dias de outro mês que completam as semanas da grade. */
  dentro: boolean;
}

/** Soma meses mantendo o dia; se o mês de destino for mais curto, cai no último dia dele (31 jan + 1 = 28 fev). */
export function somarMeses(data: string, meses: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const alvo = ano * 12 + (mes - 1) + meses;
  const a = Math.floor(alvo / 12);
  const m = (alvo % 12) + 1;
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${String(m).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
}

/** Semanas (segunda a domingo) que cobrem o mês da data; dias fora do mês completam a primeira e a última. */
export function gradeDoMes(data: string): CelulaMes[][] {
  const mesDe = (d: string) => d.slice(0, 7);
  const primeiro = `${mesDe(data)}-01`;
  const ultimo = somarDias(somarMeses(primeiro, 1), -1);
  const inicio = inicioDaSemana(primeiro);
  const fim = somarDias(inicioDaSemana(ultimo), 6);
  const semanas: CelulaMes[][] = [];
  for (let dia = inicio; dia <= fim; dia = somarDias(dia, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => {
      const d = somarDias(dia, i);
      return { data: d, dentro: mesDe(d) === mesDe(data) };
    }));
  }
  return semanas;
}

/** Datas de segunda a domingo da semana da data. */
export function diasDaSemana(data: string): string[] {
  const segunda = inicioDaSemana(data);
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
}

/** Intervalo que a visão precisa carregar da API. */
export function janelaDaVisao(modo: ModoAgenda, data: string): Janela {
  if (modo === 'dia') return { de: data, ate: data };
  if (modo === 'semana') {
    const dias = diasDaSemana(data);
    return { de: dias[0], ate: dias[6] };
  }
  const grade = gradeDoMes(data);
  return { de: grade[0][0].data, ate: grade.at(-1)!.at(-1)!.data };
}

/** Data depois de andar `passo` períodos: 1 dia, 1 semana ou 1 mês. */
export function andarNaVisao(modo: ModoAgenda, data: string, passo: number): string {
  if (modo === 'dia') return somarDias(data, passo);
  if (modo === 'semana') return somarDias(data, passo * 7);
  return somarMeses(data, passo);
}

/** As duas datas estão no mesmo dia, semana ou mês, conforme a visão. */
export function mesmoPeriodo(modo: ModoAgenda, a: string, b: string): boolean {
  if (modo === 'dia') return a === b;
  if (modo === 'semana') return inicioDaSemana(a) === inicioDaSemana(b);
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Texto grande e microlinha de um ponto do seletor de data (anterior, atual ou próximo). */
export interface PontoDoSeletor {
  texto: string;
  micro: string;
}

export function pontoDoSeletor(modo: ModoAgenda, data: string): PontoDoSeletor {
  if (modo === 'dia') return { texto: String(diaDoMes(data)), micro: mesCurto(data) };
  if (modo === 'mes') return { texto: mesCurto(data), micro: String(anoDaData(data)) };
  const [primeiro, ultimo] = [diasDaSemana(data)[0], diasDaSemana(data)[6]];
  const meses = mesCurto(primeiro) === mesCurto(ultimo) ? mesCurto(primeiro) : `${mesCurto(primeiro)} ${mesCurto(ultimo)}`;
  return { texto: `${diaDoMes(primeiro)} - ${diaDoMes(ultimo)}`, micro: meses };
}

interface ComInicio {
  inicio: string;
  status: StatusAgendamento;
}

/** Quantos atendimentos há em cada dia (no calendário do salão). Cancelados não contam. */
export function contarPorDia(agendamentos: readonly ComInicio[], fuso: string): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const ag of agendamentos) {
    if (ag.status === 'CANCELADO') continue;
    const dia = dataDoInstante(ag.inicio, fuso);
    contagem.set(dia, (contagem.get(dia) ?? 0) + 1);
  }
  return contagem;
}

/** "14:30" -> 14. */
export function horaCheia(hhmm: string): number {
  return Number(hhmm.slice(0, 2));
}

/** Horas do dia em que o salão abre, pelo horário de funcionamento (primeira abertura até a última hora de fechamento). */
export function horasDeFuncionamento(faixas: readonly FaixaHorario[]): number[] {
  if (!faixas.length) return [...HORAS_PADRAO];
  const primeira = Math.floor(Math.min(...faixas.map((f) => f.inicioMin)) / 60);
  const ultima = Math.ceil(Math.max(...faixas.map((f) => f.fimMin)) / 60); // exclusivo
  return Array.from({ length: Math.max(0, ultima - primeira) }, (_, i) => primeira + i);
}

/** Faixa de horas mais as horas que têm item (um atendimento fora do expediente nunca some), em ordem. */
export function unirHoras(base: readonly number[], comItens: Iterable<number>): number[] {
  return [...new Set([...base, ...comItens])].sort((a, b) => a - b);
}
