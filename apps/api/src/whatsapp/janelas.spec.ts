import { fimDoPrazoDeResposta, momentoDoLembrete } from './janelas';

const SP = 'America/Sao_Paulo';
const d = (iso: string) => new Date(iso);

describe('momentoDoLembrete', () => {
  // São Paulo é UTC-3: 12:00Z = 09:00 local
  it('24 h antes dentro da janela: sai na hora exata', () => {
    // atendimento 28/10 10:00 local (13:00Z) -> 27/10 10:00 local (13:00Z)
    expect(momentoDoLembrete(d('2026-10-28T13:00:00Z'), SP, d('2026-10-20T12:00:00Z'))!.toISOString()).toBe('2026-10-27T13:00:00.000Z');
  });

  it('as 24 h caem antes das 8h: sai às 8h do mesmo dia', () => {
    // atendimento 28/10 06:30 local -> 24 h antes = 27/10 06:30 local -> 08:00 local do dia 27 (11:00Z)
    expect(momentoDoLembrete(d('2026-10-28T09:30:00Z'), SP, d('2026-10-20T12:00:00Z'))!.toISOString()).toBe('2026-10-27T11:00:00.000Z');
  });

  it('as 24 h caem depois das 20h: sai às 20h', () => {
    // atendimento 28/10 21:30 local -> 27/10 21:30 -> 20:00 local (23:00Z)
    expect(momentoDoLembrete(d('2026-10-29T00:30:00Z'), SP, d('2026-10-20T12:00:00Z'))!.toISOString()).toBe('2026-10-27T23:00:00.000Z');
  });

  it('exatamente 20:00 já cai na regra das 20h; 19:59 fica como está', () => {
    expect(momentoDoLembrete(d('2026-10-28T23:00:00Z'), SP, d('2026-10-20T12:00:00Z'))!.toISOString()).toBe('2026-10-27T23:00:00.000Z');
    expect(momentoDoLembrete(d('2026-10-28T22:59:00Z'), SP, d('2026-10-20T12:00:00Z'))!.toISOString()).toBe('2026-10-27T22:59:00.000Z');
  });

  it('menos de 24 h de antecedência: sem lembrete (só a confirmação imediata)', () => {
    expect(momentoDoLembrete(d('2026-10-28T13:00:00Z'), SP, d('2026-10-27T14:00:00Z'))).toBeNull();
    expect(momentoDoLembrete(d('2026-10-28T13:00:00Z'), SP, d('2026-10-28T12:00:00Z'))).toBeNull();
  });

  it('o horário do lembrete já passou: sem lembrete', () => {
    // atendimento 28/10 21:30 local; lembrete seria 27/10 20:00 local (23:00Z), mas agora são 27/10 21:00 local (00:00Z de 28)
    expect(momentoDoLembrete(d('2026-10-29T00:30:00Z'), SP, d('2026-10-28T00:00:00Z'))).toBeNull();
  });

  it('respeita o fuso do salão (Manaus, UTC-4)', () => {
    // atendimento 28/10 10:00 em Manaus (14:00Z) -> lembrete 27/10 10:00 Manaus (14:00Z)
    expect(momentoDoLembrete(d('2026-10-28T14:00:00Z'), 'America/Manaus', d('2026-10-20T12:00:00Z'))!.toISOString()).toBe('2026-10-27T14:00:00.000Z');
  });
});

describe('fimDoPrazoDeResposta (2 h de relógio ativo, pausa das 22h às 8h)', () => {
  const fim = (entregue: string, fuso = SP) => fimDoPrazoDeResposta(d(entregue), fuso).toISOString();

  it('de dia: 2 h depois', () => {
    expect(fim('2026-10-27T13:00:00Z')).toBe('2026-10-27T15:00:00.000Z'); // 10:00 -> 12:00
  });

  it('entregue às 20h vence às 22h, sem pausa', () => {
    expect(fim('2026-10-27T23:00:00Z')).toBe('2026-10-28T01:00:00.000Z'); // 20:00 -> 22:00 local
  });

  it('entregue às 21h vence às 9h do dia seguinte (1 h antes das 22h + 1 h depois das 8h)', () => {
    expect(fim('2026-10-28T00:00:00Z')).toBe('2026-10-28T12:00:00.000Z'); // 21:00 -> 09:00 local
  });

  it('entregue às 21h59 vence às 9h59', () => {
    expect(fim('2026-10-28T00:59:00Z')).toBe('2026-10-28T12:59:00.000Z');
  });

  it('entregue de madrugada: a contagem só começa às 8h', () => {
    expect(fim('2026-10-27T07:00:00Z')).toBe('2026-10-27T13:00:00.000Z'); // 04:00 local -> 08:00 + 2 h = 10:00 local
  });

  it('entregue depois das 22h: começa na manhã seguinte', () => {
    expect(fim('2026-10-28T02:30:00Z')).toBe('2026-10-28T13:00:00.000Z'); // 23:30 local -> 10:00 local do dia 28
  });

  it('exatamente às 22:00: começa às 8h', () => {
    expect(fim('2026-10-28T01:00:00Z')).toBe('2026-10-28T13:00:00.000Z');
  });

  it('respeita o fuso do salão (Manaus)', () => {
    // 21:00 em Manaus (01:00Z) -> 09:00 em Manaus (13:00Z)
    expect(fim('2026-10-28T01:00:00Z', 'America/Manaus')).toBe('2026-10-28T13:00:00.000Z');
  });
});
