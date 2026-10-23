import { formatarWhatsapp, hhmmParaMinutos, minutosParaHHmm, normalizarWhatsapp, slugificar, validarFaixas, validarSlug } from '@hora-h/shared';

describe('slug', () => {
  it.each([
    ['studio-bela', null],
    ['ab', 'tamanho'],
    ['a'.repeat(41), 'tamanho'],
    ['Studio', 'formato'],
    ['studio_bela', 'formato'],
    ['-studio', 'formato'],
    ['studio-', 'formato'],
    ['studio--bela', 'formato'],
    ['admin', 'reservado'],
    ['painel', 'reservado'],
  ])('validarSlug(%s) -> %s', (slug, esperado) => {
    expect(validarSlug(slug)).toBe(esperado);
  });

  it('slugificar remove acento e símbolos', () => {
    expect(slugificar('  Salão da Zé & Cia! ')).toBe('salao-da-ze-cia');
  });
});

describe('faixas de horário', () => {
  it('aceita faixas com intervalo de almoço', () => {
    expect(validarFaixas([
      { diaSemana: 1, inicioMin: 540, fimMin: 720 },
      { diaSemana: 1, inicioMin: 780, fimMin: 1080 },
    ])).toBeNull();
  });
  it('recusa fim <= início, fora do dia e sobreposição', () => {
    expect(validarFaixas([{ diaSemana: 1, inicioMin: 600, fimMin: 600 }])).toMatch(/depois do início/);
    expect(validarFaixas([{ diaSemana: 1, inicioMin: 600, fimMin: 1500 }])).toMatch(/fora do dia/);
    expect(validarFaixas([{ diaSemana: 7, inicioMin: 600, fimMin: 700 }])).toMatch(/Dia da semana/);
    expect(validarFaixas([
      { diaSemana: 2, inicioMin: 540, fimMin: 700 },
      { diaSemana: 2, inicioMin: 650, fimMin: 800 },
    ])).toMatch(/sobrepostas/);
  });
  it('mesma faixa em dias diferentes não conflita', () => {
    expect(validarFaixas([
      { diaSemana: 1, inicioMin: 540, fimMin: 700 },
      { diaSemana: 2, inicioMin: 540, fimMin: 700 },
    ])).toBeNull();
  });
  it('converte HH:mm <-> minutos', () => {
    expect(minutosParaHHmm(545)).toBe('09:05');
    expect(hhmmParaMinutos('09:05')).toBe(545);
    expect(hhmmParaMinutos('24:00')).toBe(1440);
    expect(hhmmParaMinutos('25:00')).toBeNull();
    expect(hhmmParaMinutos('9h')).toBeNull();
  });
});

describe('WhatsApp', () => {
  it.each([
    ['(11) 99999-8888', '5511999998888'],
    ['11999998888', '5511999998888'],
    ['+55 11 99999-8888', '5511999998888'],
    ['55 (21) 98888-7777', '5521988887777'],
    ['  11 9 9999 8888 ', '5511999998888'],
  ])('normaliza %s -> %s', (entrada, canonico) => {
    expect(normalizarWhatsapp(entrada)).toBe(canonico);
  });

  it.each([
    '', '123', '1199998888', // 10 dígitos (fixo ou sem o 9)
    '(11) 3333-4444', // fixo
    '01999998888', // DDD com zero
    '11899998888', // celular sem o 9 inicial
    '5511999998888999', '+1 415 555 2671', 'abc',
  ])('recusa %s', (entrada) => {
    expect(normalizarWhatsapp(entrada)).toBeNull();
  });

  it('formatar é o inverso de normalizar', () => {
    expect(formatarWhatsapp('5511999998888')).toBe('(11) 99999-8888');
    expect(normalizarWhatsapp(formatarWhatsapp('5521988887777'))).toBe('5521988887777');
    expect(formatarWhatsapp('lixo')).toBe('lixo');
  });
});
