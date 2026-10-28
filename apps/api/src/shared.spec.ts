import { faixaDe, formatarWhatsapp, telefoneDoJid, planoDaFaixa, tipoCpfCnpj, hhmmParaMinutos, minutosParaHHmm, normalizarWhatsapp, slugificar, validarFaixas, validarSlug } from '@hora-h/shared';

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

describe('faixas do plano', () => {
  it.each([
    [0, 1, 2990], [1, 1, 2990], [2, 2, 5990], [5, 2, 5990], [6, 3, 9990], [40, 3, 9990],
  ])('%i profissionais ativos -> faixa %i (%i centavos)', (n, faixa, valor) => {
    expect(faixaDe(n)).toMatchObject({ faixa, valorCentavos: valor });
  });

  it('planoDaFaixa cai na faixa 1 para valor desconhecido', () => {
    expect(planoDaFaixa(2).valorCentavos).toBe(5990);
    expect(planoDaFaixa(99).faixa).toBe(1);
  });
});

describe('CPF e CNPJ', () => {
  it.each([
    ['529.982.247-25', 'cpf'],
    ['52998224725', 'cpf'],
    ['11.222.333/0001-81', 'cnpj'],
    ['11222333000181', 'cnpj'],
  ])('%s é %s', (entrada, tipo) => {
    expect(tipoCpfCnpj(entrada)).toBe(tipo);
  });

  it.each(['', '123', '529.982.247-26', '111.111.111-11', '00000000000000', '11.222.333/0001-82', 'abc'])('recusa %s', (entrada) => {
    expect(tipoCpfCnpj(entrada)).toBeNull();
  });
});

describe('telefoneDoJid', () => {
  it.each([
    ['5511999998888@s.whatsapp.net', '5511999998888'],
    ['5511999998888:12@s.whatsapp.net', '5511999998888'], // com o aparelho: ainda é o mesmo número
    ['551199998888@s.whatsapp.net', '5511999998888'], // número antigo sem o 9
  ])('%s -> %s', (jid, esperado) => expect(telefoneDoJid(jid)).toBe(esperado));

  it.each(['1234567890-123456@g.us', '123456789012345@lid', '5511999998888', '14155552671@s.whatsapp.net', 'x@s.whatsapp.net', ''])('recusa %s', (jid) =>
    expect(telefoneDoJid(jid)).toBeNull(),
  );
});
