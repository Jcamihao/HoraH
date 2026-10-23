import type { DiaDisponivelDto, SlotDto } from '@hora-h/shared';
import { diaDaSemana, somarDias } from './datas';

export interface CelulaDia {
  data: string;
  dia: number;
  livre: boolean;
}

export interface MesCalendario {
  /** "2026-10" */
  chave: string;
  rotulo: string;
  /** Domingo primeiro; `null` preenche o começo e o fim das semanas. */
  semanas: (CelulaDia | null)[][];
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Monta os meses (domingo a sábado) cobertos pela lista de dias; só os dias marcados `livre` são tocáveis. */
export function montarMeses(dias: readonly DiaDisponivelDto[]): MesCalendario[] {
  if (!dias.length) return [];
  const livres = new Map(dias.map((d) => [d.data, d.livre]));
  const chaves = [...new Set(dias.map((d) => d.data.slice(0, 7)))];
  return chaves.map((chave) => {
    const [ano, mes] = chave.split('-').map(Number);
    const primeiro = `${chave}-01`;
    const celulas: (CelulaDia | null)[] = Array.from({ length: diaDaSemana(primeiro) }, () => null);
    for (let data = primeiro; data.startsWith(chave); data = somarDias(data, 1)) {
      celulas.push({ data, dia: Number(data.slice(8)), livre: livres.get(data) === true });
    }
    while (celulas.length % 7) celulas.push(null);
    const semanas = Array.from({ length: celulas.length / 7 }, (_, i) => celulas.slice(i * 7, i * 7 + 7));
    return { chave, rotulo: `${MESES[mes - 1]} de ${ano}`, semanas };
  });
}

export interface GrupoHorarios {
  periodo: 'Manhã' | 'Tarde' | 'Noite';
  horarios: SlotDto[];
}

/** Manhã até 11:59, tarde até 17:59, noite depois: mais fácil de varrer do que uma lista de 20 horas. */
export function agruparPorPeriodo(horarios: readonly SlotDto[]): GrupoHorarios[] {
  const periodos: GrupoHorarios[] = [
    { periodo: 'Manhã', horarios: [] },
    { periodo: 'Tarde', horarios: [] },
    { periodo: 'Noite', horarios: [] },
  ];
  for (const h of horarios) {
    const hora = Number(h.hora.slice(0, 2));
    periodos[hora < 12 ? 0 : hora < 18 ? 1 : 2].horarios.push(h);
  }
  return periodos.filter((p) => p.horarios.length);
}

function escaparIcs(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function instanteIcs(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Arquivo .ics para o cliente guardar o horário no calendário do aparelho. */
export function montarIcs(e: { id: string; inicio: string; fim: string; titulo: string; descricao: string; agora?: Date }): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hora H//Agendamento//PT-BR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.id}@horah`,
    `DTSTAMP:${instanteIcs((e.agora ?? new Date()).toISOString())}`,
    `DTSTART:${instanteIcs(e.inicio)}`,
    `DTEND:${instanteIcs(e.fim)}`,
    `SUMMARY:${escaparIcs(e.titulo)}`,
    `DESCRIPTION:${escaparIcs(e.descricao)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function baixarIcs(conteudo: string, nome = 'horario.ics'): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
