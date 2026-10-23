export const Papel = {
  DONO: 'DONO',
  PROFISSIONAL: 'PROFISSIONAL',
} as const;
export type Papel = (typeof Papel)[keyof typeof Papel];

export const StatusAssinatura = {
  TESTE: 'TESTE',
  ATIVA: 'ATIVA',
  TOLERANCIA: 'TOLERANCIA',
  BLOQUEADA: 'BLOQUEADA',
  CANCELADA: 'CANCELADA',
} as const;
export type StatusAssinatura = (typeof StatusAssinatura)[keyof typeof StatusAssinatura];
