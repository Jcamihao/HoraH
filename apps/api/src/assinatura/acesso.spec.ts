import { StatusAssinatura } from '@hora-h/shared';
import { calcularAcesso, fimDaToleranciaPorTeste, fimDaToleranciaPorVencimento, type DadosAcesso } from './acesso';

const d = (iso: string) => new Date(iso);
const base = (p: Partial<DadosAcesso>): DadosAcesso => ({
  status: StatusAssinatura.TESTE, testeFimEm: d('2026-10-30T12:00:00Z'), toleranciaFimEm: null, cancelaEm: null, ...p,
});

describe('calcularAcesso', () => {
  it('teste em andamento: liberado', () => {
    expect(calcularAcesso(base({}), d('2026-10-25T12:00:00Z'))).toMatchObject({ status: 'TESTE', acesso: 'LIBERADO' });
  });

  it('teste vencido sem o job ter rodado: tolerância de 5 dias, depois bloqueio', () => {
    const dados = base({});
    expect(calcularAcesso(dados, d('2026-10-30T12:00:01Z'))).toMatchObject({ status: 'TOLERANCIA', acesso: 'LIBERADO' });
    expect(calcularAcesso(dados, d('2026-11-04T11:59:59Z'))).toMatchObject({ status: 'TOLERANCIA', acesso: 'LIBERADO' });
    expect(calcularAcesso(dados, d('2026-11-04T12:00:01Z'))).toMatchObject({ status: 'BLOQUEADA', acesso: 'RESTRITO' });
  });

  it('tolerância gravada: respeita o fim gravado', () => {
    const dados = base({ status: StatusAssinatura.TOLERANCIA, toleranciaFimEm: d('2026-11-16T03:00:00Z') });
    expect(calcularAcesso(dados, d('2026-11-16T02:59:59Z')).acesso).toBe('LIBERADO');
    expect(calcularAcesso(dados, d('2026-11-16T03:00:01Z'))).toMatchObject({ status: 'BLOQUEADA', acesso: 'RESTRITO' });
  });

  it('ativa: liberado; bloqueada e cancelada: restrito', () => {
    expect(calcularAcesso(base({ status: StatusAssinatura.ATIVA }), d('2027-01-01T00:00:00Z')).acesso).toBe('LIBERADO');
    expect(calcularAcesso(base({ status: StatusAssinatura.BLOQUEADA }), d('2026-10-01T00:00:00Z')).acesso).toBe('RESTRITO');
    expect(calcularAcesso(base({ status: StatusAssinatura.CANCELADA }), d('2026-10-01T00:00:00Z')).acesso).toBe('RESTRITO');
  });

  it('cancelamento agendado: acesso até o fim do período pago, sem tolerância', () => {
    const dados = base({ status: StatusAssinatura.ATIVA, cancelaEm: d('2026-11-10T03:00:00Z') });
    expect(calcularAcesso(dados, d('2026-11-10T02:59:59Z')).acesso).toBe('LIBERADO');
    expect(calcularAcesso(dados, d('2026-11-10T03:00:00Z'))).toMatchObject({ status: 'CANCELADA', acesso: 'RESTRITO' });
  });

  it('cancelou durante o teste: ao acabar o teste fecha na hora, sem os 5 dias', () => {
    const dados = base({ cancelaEm: d('2026-10-30T12:00:00Z') });
    expect(calcularAcesso(dados, d('2026-10-30T12:00:01Z'))).toMatchObject({ status: 'CANCELADA', acesso: 'RESTRITO' });
  });
});

describe('fim da tolerância', () => {
  it('por teste: 5 dias depois do fim', () => {
    expect(fimDaToleranciaPorTeste(d('2026-10-30T12:00:00Z')).toISOString()).toBe('2026-11-04T12:00:00.000Z');
  });

  it('por vencimento: segue liberado até o fim do 5º dia, bloqueia à meia-noite do dia 16 no fuso do salão', () => {
    // vence 10/11 em São Paulo (UTC-3): bloqueia em 16/11 00:00 local = 03:00Z
    expect(fimDaToleranciaPorVencimento('2026-11-10', 'America/Sao_Paulo').toISOString()).toBe('2026-11-16T03:00:00.000Z');
    expect(fimDaToleranciaPorVencimento('2026-11-10', 'America/Manaus').toISOString()).toBe('2026-11-16T04:00:00.000Z');
  });
});
