import type { DiaDisponivelDto } from '@hora-h/shared';
import { agruparPorPeriodo, montarIcs, montarMeses } from './publico';

describe('publico', () => {
  describe('calendário', () => {
    const dias: DiaDisponivelDto[] = [
      { data: '2026-10-29', livre: true },
      { data: '2026-10-30', livre: false },
      { data: '2026-10-31', livre: true },
      { data: '2026-11-01', livre: true },
      { data: '2026-11-02', livre: false },
    ];

    it('agrupa por mês e começa a semana no domingo', () => {
      const meses = montarMeses(dias);
      expect(meses.map((m) => m.chave)).toEqual(['2026-10', '2026-11']);
      expect(meses[0].rotulo).toBe('Outubro de 2026');
      // 1º de outubro de 2026 é quinta: 4 células vazias (dom, seg, ter, qua)
      expect(meses[0].semanas[0].slice(0, 4)).toEqual([null, null, null, null]);
      expect(meses[0].semanas[0][4]?.data).toBe('2026-10-01');
      expect(meses.every((m) => m.semanas.every((s) => s.length === 7))).toBe(true);
    });

    it('só os dias livres da lista ficam tocáveis; o resto do mês aparece apagado', () => {
      const cels = montarMeses(dias)[0].semanas.flat().filter((c) => c !== null);
      expect(cels.length).toBe(31);
      expect(cels.filter((c) => c.livre).map((c) => c.data)).toEqual(['2026-10-29', '2026-10-31']);
    });

    it('domingo 1º de novembro cai na primeira coluna', () => {
      const nov = montarMeses(dias)[1];
      expect(nov.semanas[0][0]?.data).toBe('2026-11-01');
    });

    it('lista vazia não monta nada', () => {
      expect(montarMeses([])).toEqual([]);
    });
  });

  it('agrupa horários em manhã, tarde e noite e omite períodos vazios', () => {
    const h = (hora: string) => ({ hora, inicio: `2026-10-26T${hora}:00Z` });
    const grupos = agruparPorPeriodo([h('09:00'), h('11:30'), h('12:00'), h('17:30'), h('18:00'), h('19:30')]);
    expect(grupos.map((g) => [g.periodo, g.horarios.map((x) => x.hora)])).toEqual([
      ['Manhã', ['09:00', '11:30']],
      ['Tarde', ['12:00', '17:30']],
      ['Noite', ['18:00', '19:30']],
    ]);
    expect(agruparPorPeriodo([h('09:00')]).map((g) => g.periodo)).toEqual(['Manhã']);
    expect(agruparPorPeriodo([])).toEqual([]);
  });

  it('ics: instantes em UTC e textos escapados', () => {
    const ics = montarIcs({
      id: 'abc', inicio: '2026-10-26T12:00:00.000Z', fim: '2026-10-26T12:30:00.000Z',
      titulo: 'Corte, barba - Salão Bela', descricao: 'Com Ana; link: x\nfim', agora: new Date('2026-10-22T10:00:00Z'),
    });
    expect(ics).toContain('DTSTART:20261026T120000Z');
    expect(ics).toContain('DTEND:20261026T123000Z');
    expect(ics).toContain('DTSTAMP:20261022T100000Z');
    expect(ics).toContain('SUMMARY:Corte\\, barba - Salão Bela');
    expect(ics).toContain('DESCRIPTION:Com Ana\; link: x\\nfim');
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.split('\r\n').at(-1)).toBe('END:VCALENDAR');
  });
});
