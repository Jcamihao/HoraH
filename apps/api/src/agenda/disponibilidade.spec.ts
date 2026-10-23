import { slotsDoDia, type EntradaDia } from './disponibilidade';
import { dataLocal, diaDaSemana, diasEntre, hojeNoFuso, limitesDoDia, localParaInstante, somarDias } from './tempo';

const base = (parcial: Partial<EntradaDia> = {}): EntradaDia => ({
  fuso: 'America/Sao_Paulo',
  data: '2026-10-26',
  faixas: [{ inicioMin: 540, fimMin: 720 }], // 09:00-12:00
  ocupados: [],
  duracaoMin: 60,
  inicioMinimo: new Date(0),
  ...parcial,
});
const horas = (e: EntradaDia) => slotsDoDia(e).map((s) => s.hora);
const iso = (e: EntradaDia) => slotsDoDia(e).map((s) => s.inicio.toISOString());

describe('slotsDoDia', () => {
  it('gera a grade de 30 min e exige que o atendimento caiba na faixa', () => {
    expect(horas(base())).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
    expect(horas(base({ duracaoMin: 90 }))).toEqual(['09:00', '09:30', '10:00', '10:30']);
    expect(horas(base({ duracaoMin: 45 }))).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00']);
  });

  it('serviço maior que a faixa não gera horário', () => {
    expect(horas(base({ duracaoMin: 200 }))).toEqual([]);
  });

  it('faixa que não começa na grade: primeiro horário é o próximo da grade', () => {
    expect(horas(base({ faixas: [{ inicioMin: 555, fimMin: 660 }] }))).toEqual(['09:30', '10:00']);
  });

  it('respeita intervalo de almoço (duas faixas no mesmo dia)', () => {
    const e = base({ faixas: [{ inicioMin: 540, fimMin: 660 }, { inicioMin: 780, fimMin: 900 }], duracaoMin: 60 });
    expect(horas(e)).toEqual(['09:00', '09:30', '10:00', '13:00', '13:30', '14:00']);
  });

  it('dia sem faixa de trabalho não tem horário', () => {
    expect(horas(base({ faixas: [] }))).toEqual([]);
  });

  describe('agendamentos e bloqueios', () => {
    const ocupa = (de: string, ate: string) => ({ inicio: new Date(de), fim: new Date(ate) });

    it('remove os horários que sobrepõem; encostar é permitido', () => {
      // 10:00-11:00 BRT (UTC-3) = 13:00-14:00Z
      const e = base({ ocupados: [ocupa('2026-10-26T13:00:00Z', '2026-10-26T14:00:00Z')] });
      expect(horas(e)).toEqual(['09:00', '11:00']);
    });

    it('um atendimento longo não pode começar antes de um ocupado e invadi-lo', () => {
      const e = base({ duracaoMin: 90, ocupados: [ocupa('2026-10-26T13:00:00Z', '2026-10-26T14:00:00Z')] });
      expect(horas(e)).toEqual([]);
    });

    it('bloqueio parcial dentro do slot também conta', () => {
      const e = base({ duracaoMin: 30, ocupados: [ocupa('2026-10-26T12:10:00Z', '2026-10-26T12:20:00Z')] }); // 09:10-09:20
      expect(horas(e)).toEqual(['09:30', '10:00', '10:30', '11:00', '11:30']);
    });
  });

  it('inicioMinimo (antecedência) corta o que começa antes', () => {
    const e = base({ inicioMinimo: new Date('2026-10-26T13:00:00Z') }); // 10:00 local
    expect(horas(e)).toEqual(['10:00', '10:30', '11:00']);
  });

  describe('fusos horários', () => {
    const casos: [string, string][] = [
      ['America/Sao_Paulo', '2026-10-26T12:00:00.000Z'], // UTC-3
      ['America/Manaus', '2026-10-26T13:00:00.000Z'], // UTC-4
      ['America/Noronha', '2026-10-26T11:00:00.000Z'], // UTC-2
      ['America/Rio_Branco', '2026-10-26T14:00:00.000Z'], // UTC-5
      ['Asia/Tokyo', '2026-10-26T00:00:00.000Z'], // UTC+9
    ];
    it.each(casos)('09:00 em %s é %s', (fuso, esperado) => {
      expect(iso(base({ fuso }))[0]).toBe(esperado);
      expect(horas(base({ fuso }))[0]).toBe('09:00');
    });

    it('o mesmo instante é horário diferente em cada fuso (dois salões, dois relógios)', () => {
      const sp = iso(base({ fuso: 'America/Sao_Paulo' }))[0];
      const manaus = iso(base({ fuso: 'America/Manaus' }))[0];
      expect(sp).not.toBe(manaus);
      expect(new Date(manaus).getTime() - new Date(sp).getTime()).toBe(3_600_000);
    });
  });

  describe('horário de verão (fusos que mudam o relógio)', () => {
    it('salto da primavera: 02:00-03:00 não existe e não gera horário', () => {
      // America/New_York, 2026-03-08: às 02:00 o relógio vai para 03:00
      const e = base({ fuso: 'America/New_York', data: '2026-03-08', faixas: [{ inicioMin: 60, fimMin: 240 }], duracaoMin: 30 });
      expect(horas(e)).toEqual(['01:00', '01:30', '03:00', '03:30']);
    });

    it('volta do outono: horário repetido aparece uma vez só e sem erro', () => {
      const e = base({ fuso: 'America/New_York', data: '2026-11-01', faixas: [{ inicioMin: 0, fimMin: 180 }], duracaoMin: 30 });
      const lista = horas(e);
      expect(new Set(lista).size).toBe(lista.length);
      expect(lista).toContain('01:00');
    });
  });
});

describe('tempo', () => {
  it('limitesDoDia: meia-noite local até meia-noite local', () => {
    const { inicio, fim } = limitesDoDia('America/Sao_Paulo', '2026-10-26');
    expect(inicio.toISOString()).toBe('2026-10-26T03:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-10-27T03:00:00.000Z');
  });

  it('hojeNoFuso usa o calendário do salão, não o do servidor', () => {
    const instante = new Date('2026-10-26T01:30:00Z'); // 22:30 do dia 25 em SP; 10:30 do dia 26 em Tóquio
    expect(hojeNoFuso('America/Sao_Paulo', instante)).toBe('2026-10-25');
    expect(hojeNoFuso('Asia/Tokyo', instante)).toBe('2026-10-26');
    expect(dataLocal('America/Sao_Paulo', instante)).toBe('2026-10-25');
  });

  it('diaDaSemana: 0 = domingo', () => {
    expect(diaDaSemana('2026-10-25')).toBe(0);
    expect(diaDaSemana('2026-10-26')).toBe(1);
    expect(diaDaSemana('2026-10-31')).toBe(6);
  });

  it('somarDias e diasEntre atravessam virada de mês e de ano', () => {
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(diasEntre('2026-10-26', '2026-12-25')).toBe(60);
  });

  it('localParaInstante interpreta no fuso do salão e recusa lixo', () => {
    expect(localParaInstante('America/Sao_Paulo', '2026-10-26T09:00')?.toISOString()).toBe('2026-10-26T12:00:00.000Z');
    expect(localParaInstante('America/Sao_Paulo', '2026-10-26 09:00')).toBeNull();
    expect(localParaInstante('America/Sao_Paulo', '2026-13-26T09:00')).toBeNull();
  });
});
