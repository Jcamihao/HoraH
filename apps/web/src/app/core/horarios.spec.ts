import { faixasParaSemana, formatarDuracao, resumoSemana, semanaPadrao, semanaParaFaixas, semanaVazia } from './horarios';

describe('horários', () => {
  it('a semana padrão abre de segunda a sábado, 09:00 às 18:00', () => {
    const r = semanaParaFaixas(semanaPadrao());
    expect('faixas' in r).toBeTrue();
    if ('faixas' in r) {
      expect(r.faixas.length).toBe(6);
      expect(r.faixas.every((f) => f.inicioMin === 540 && f.fimMin === 1080)).toBeTrue();
      expect(r.faixas.some((f) => f.diaSemana === 0)).toBeFalse();
    }
  });

  it('ida e volta entre faixas e campos não perde nada', () => {
    const faixas = [
      { diaSemana: 1, inicioMin: 540, fimMin: 720 },
      { diaSemana: 1, inicioMin: 780, fimMin: 1080 },
      { diaSemana: 6, inicioMin: 480, fimMin: 780 },
    ];
    const r = semanaParaFaixas(faixasParaSemana(faixas));
    expect('faixas' in r && r.faixas).toEqual(faixas);
  });

  it('diz o dia quando o fim não é depois do início', () => {
    const s = semanaVazia();
    s[2] = [{ inicio: '10:00', fim: '10:00' }];
    const r = semanaParaFaixas(s);
    expect('erro' in r && r.erro).toContain('Terça');
  });

  it('diz o dia quando os horários se sobrepõem', () => {
    const s = semanaVazia();
    s[3] = [
      { inicio: '09:00', fim: '12:00' },
      { inicio: '11:00', fim: '14:00' },
    ];
    const r = semanaParaFaixas(s);
    expect('erro' in r && r.erro).toContain('sobrepostos');
  });

  it('pede para preencher quando falta hora', () => {
    const s = semanaVazia();
    s[1] = [{ inicio: '', fim: '18:00' }];
    const r = semanaParaFaixas(s);
    expect('erro' in r && r.erro).toContain('preencha');
  });

  it('resume a semana em uma frase curta', () => {
    expect(resumoSemana([])).toBe('Sem horário definido');
    const seg_sab = [1, 2, 3, 4, 5, 6].map((d) => ({ diaSemana: d, inicioMin: 540, fimMin: 1080 }));
    expect(resumoSemana(seg_sab)).toBe('Seg a Sáb, 09:00 às 18:00');
    expect(resumoSemana([{ diaSemana: 5, inicioMin: 600, fimMin: 900 }])).toBe('Sex, 10:00 às 15:00');
  });

  it('escreve duração em minutos e horas', () => {
    expect(formatarDuracao(45)).toBe('45 min');
    expect(formatarDuracao(60)).toBe('1 h');
    expect(formatarDuracao(90)).toBe('1 h 30 min');
  });
});
