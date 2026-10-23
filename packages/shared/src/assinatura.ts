/** Dias de tolerância depois de um vencimento (ou do fim do teste) antes de bloquear novos agendamentos. */
export const TOLERANCIA_DIAS = 5;
/** Quantos dias antes do fim do teste o dono recebe o primeiro aviso. */
export const AVISO_FIM_TESTE_DIAS = 2;

export interface FaixaPlano {
  faixa: 1 | 2 | 3;
  /** Profissionais ativos que cabem na faixa. */
  min: number;
  max: number | null;
  valorCentavos: number;
  rotulo: string;
}

/** Spec seção 10: o preço depende de quantos profissionais ativos o salão tem. */
export const FAIXAS: readonly FaixaPlano[] = [
  { faixa: 1, min: 0, max: 1, valorCentavos: 2990, rotulo: '1 profissional' },
  { faixa: 2, min: 2, max: 5, valorCentavos: 5990, rotulo: '2 a 5 profissionais' },
  { faixa: 3, min: 6, max: null, valorCentavos: 9990, rotulo: '6 ou mais profissionais' },
];

export function faixaDe(profissionaisAtivos: number): FaixaPlano {
  return FAIXAS.find((f) => profissionaisAtivos >= f.min && (f.max === null || profissionaisAtivos <= f.max))!;
}

export function planoDaFaixa(faixa: number): FaixaPlano {
  return FAIXAS.find((f) => f.faixa === faixa) ?? FAIXAS[0];
}

export function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Devolve 'cpf' ou 'cnpj' se os dígitos verificadores batem; nulo se não for um documento válido. */
export function tipoCpfCnpj(texto: string): 'cpf' | 'cnpj' | null {
  const d = somenteDigitos(texto);
  if (/^(\d)\1+$/.test(d)) return null; // 111.111.111-11 passa na conta mas não existe
  if (d.length === 11) {
    const primeiro = digitoVerificador(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const segundo = digitoVerificador(d.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return primeiro === Number(d[9]) && segundo === Number(d[10]) ? 'cpf' : null;
  }
  if (d.length === 14) {
    const primeiro = digitoVerificador(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const segundo = digitoVerificador(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return primeiro === Number(d[12]) && segundo === Number(d[13]) ? 'cnpj' : null;
  }
  return null;
}

export const StatusCobranca = {
  PENDENTE: 'PENDENTE',
  PAGA: 'PAGA',
  VENCIDA: 'VENCIDA',
  ESTORNADA: 'ESTORNADA',
  CANCELADA: 'CANCELADA',
} as const;
export type StatusCobranca = (typeof StatusCobranca)[keyof typeof StatusCobranca];

/** Código do erro 409 quando adicionar/reativar um profissional muda a faixa de uma assinatura ativa. */
export const CODIGO_FAIXA_MUDA = 'FAIXA_MUDA';
