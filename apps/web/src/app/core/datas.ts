/**
 * Datas do painel e da página pública. O dia e a hora mostrados são sempre os do FUSO DO SALÃO,
 * não os do aparelho: quem consulta de outro fuso (viagem, VPN) vê o mesmo que o salão.
 * Datas "puras" são texto "YYYY-MM-DD"; instantes chegam da API em ISO (UTC).
 */

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function partes(data: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = data.split('-').map(Number);
  return { ano, mes, dia };
}

function utc(data: string): Date {
  const { ano, mes, dia } = partes(data);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    formatadores.set(fuso, f);
  }
  return f;
}

function relogio(instante: Date, fuso: string): { data: string; hora: string } {
  const p = Object.fromEntries(formatador(fuso).formatToParts(instante).map((x) => [x.type, x.value]));
  return { data: `${p['year']}-${p['month']}-${p['day']}`, hora: `${p['hour']}:${p['minute']}` };
}

/** Hoje no calendário do salão. */
export function hojeNoFuso(fuso: string, agora: Date = new Date()): string {
  return relogio(agora, fuso).data;
}

export function dataDoInstante(iso: string, fuso: string): string {
  return relogio(new Date(iso), fuso).data;
}

/** "14:30" no fuso do salão. */
export function horaDoInstante(iso: string, fuso: string): string {
  return relogio(new Date(iso), fuso).hora;
}

export function somarDias(data: string, dias: number): string {
  const d = utc(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado. */
export function diaDaSemana(data: string): number {
  return utc(data).getUTCDay();
}

/** Segunda-feira da semana da data (a semana do painel começa na segunda). */
export function inicioDaSemana(data: string): string {
  return somarDias(data, -((diaDaSemana(data) + 6) % 7));
}

/** "qua, 22 out". */
export function diaCurto(data: string): string {
  const { mes, dia } = partes(data);
  return `${DIAS_CURTOS[diaDaSemana(data)]}, ${dia} ${MESES_CURTOS[mes - 1]}`;
}

/** "quarta-feira, 22 de outubro". */
export function diaLongo(data: string): string {
  const { mes, dia } = partes(data);
  return `${DIAS_LONGOS[diaDaSemana(data)]}, ${dia} de ${MESES_LONGOS[mes - 1]}`;
}

/** "Hoje", "Amanhã", "Ontem" ou o dia por extenso curto. */
export function rotuloDoDia(data: string, hoje: string): string {
  if (data === hoje) return 'Hoje';
  if (data === somarDias(hoje, 1)) return 'Amanhã';
  if (data === somarDias(hoje, -1)) return 'Ontem';
  return diaCurto(data);
}

/** "22 out – 28 out". */
export function intervaloCurto(de: string, ate: string): string {
  const a = partes(de);
  const b = partes(ate);
  return `${a.dia} ${MESES_CURTOS[a.mes - 1]} – ${b.dia} ${MESES_CURTOS[b.mes - 1]}`;
}

/** "qua, 22 out" com a hora: "qua, 22 out às 14:30". */
export function diaEHora(iso: string, fuso: string): string {
  return `${diaCurto(dataDoInstante(iso, fuso))} às ${horaDoInstante(iso, fuso)}`;
}

export function fusoDoAparelho(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** "America/Manaus" -> "Manaus". */
export function nomeDoFuso(fuso: string): string {
  return (fuso.split('/').pop() ?? fuso).replace(/_/g, ' ');
}

/** "2026-11-10" -> "10/11/2026". */
export function dataBR(data: string): string {
  const { ano, mes, dia } = partes(data);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}

/** Instante (ISO) -> "10/11/2026" no calendário do salão. */
export function dataBRDoInstante(iso: string, fuso: string): string {
  return dataBR(dataDoInstante(iso, fuso));
}

/** Quantos dias inteiros faltam até o instante (0 = hoje ainda vale; negativo = já passou). */
export function diasAte(iso: string, agora: Date = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - agora.getTime()) / 86_400_000);
}
