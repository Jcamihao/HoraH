import { formatarReais, lerReais, reaisParaCampo } from './money';

describe('dinheiro', () => {
  it('formata centavos em reais, sem ,00 quando é inteiro', () => {
    expect(formatarReais(8000)).toBe('R$ 80');
    expect(formatarReais(8050)).toBe('R$ 80,50');
    expect(formatarReais(5)).toBe('R$ 0,05');
    expect(formatarReais(120000)).toBe('R$ 1.200');
  });

  it('lê o que a pessoa digita', () => {
    expect(lerReais('80')).toBe(8000);
    expect(lerReais('80,5')).toBe(8050);
    expect(lerReais('80,50')).toBe(8050);
    expect(lerReais('R$ 1.200,00')).toBe(120000);
    expect(lerReais(' 65,50 ')).toBe(6550);
  });

  it('recusa o que não é valor', () => {
    for (const ruim of ['', 'abc', '-5', '80,555', '1,2,3', '8 0 x', '1.20']) expect(lerReais(ruim)).toBeNull();
  });

  it('preenche o campo com duas casas', () => {
    expect(reaisParaCampo(8000)).toBe('80,00');
    expect(reaisParaCampo(6550)).toBe('65,50');
  });
});
