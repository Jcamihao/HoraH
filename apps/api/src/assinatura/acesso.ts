import { DateTime } from 'luxon';
import { StatusAssinatura, TOLERANCIA_DIAS } from '@hora-h/shared';

export interface DadosAcesso {
  status: StatusAssinatura;
  testeFimEm: Date | null;
  toleranciaFimEm: Date | null;
  cancelaEm: Date | null;
}

export interface EstadoAcesso {
  status: StatusAssinatura;
  /** RESTRITO = novos agendamentos bloqueados e painel só para consulta. */
  acesso: 'LIBERADO' | 'RESTRITO';
  toleranciaFimEm: Date | null;
}

const DIA_MS = 86_400_000;

/** Teste vencido sem pagamento: a tolerância conta a partir do fim do teste. */
export function fimDaToleranciaPorTeste(testeFimEm: Date): Date {
  return new Date(testeFimEm.getTime() + TOLERANCIA_DIAS * DIA_MS);
}

/**
 * Cobrança vencida em "YYYY-MM-DD": a tolerância vai até o fim do 5º dia depois do vencimento
 * (vence dia 10, segue liberado até 15, bloqueia a partir de 16 à meia-noite do fuso do salão).
 */
export function fimDaToleranciaPorVencimento(vencimento: string, fuso: string): Date {
  return DateTime.fromISO(vencimento, { zone: fuso }).plus({ days: TOLERANCIA_DIAS + 1 }).toJSDate();
}

/**
 * O acesso de verdade, calculado com o relógio. O `status` gravado é só o último que o job/webhook
 * escreveu: se o job atrasar, esta função continua certa (nunca libera nem bloqueia por atraso do job).
 */
export function calcularAcesso(a: DadosAcesso, agora: Date): EstadoAcesso {
  // Quem cancelou perde o acesso quando acaba o período que já pagou, sem tolerância.
  if (a.cancelaEm && agora >= a.cancelaEm) {
    return { status: StatusAssinatura.CANCELADA, acesso: 'RESTRITO', toleranciaFimEm: a.toleranciaFimEm };
  }
  switch (a.status) {
    case StatusAssinatura.ATIVA:
      return { status: a.status, acesso: 'LIBERADO', toleranciaFimEm: null };
    case StatusAssinatura.TESTE: {
      if (!a.testeFimEm || agora <= a.testeFimEm) return { status: a.status, acesso: 'LIBERADO', toleranciaFimEm: null };
      const fim = a.toleranciaFimEm ?? fimDaToleranciaPorTeste(a.testeFimEm);
      return agora <= fim
        ? { status: StatusAssinatura.TOLERANCIA, acesso: 'LIBERADO', toleranciaFimEm: fim }
        : { status: StatusAssinatura.BLOQUEADA, acesso: 'RESTRITO', toleranciaFimEm: fim };
    }
    case StatusAssinatura.TOLERANCIA:
      if (!a.toleranciaFimEm || agora <= a.toleranciaFimEm) {
        return { status: a.status, acesso: 'LIBERADO', toleranciaFimEm: a.toleranciaFimEm };
      }
      return { status: StatusAssinatura.BLOQUEADA, acesso: 'RESTRITO', toleranciaFimEm: a.toleranciaFimEm };
    default:
      return { status: a.status, acesso: 'RESTRITO', toleranciaFimEm: a.toleranciaFimEm };
  }
}
