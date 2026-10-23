import { cpfCnpjValido, mascaraCpfCnpj } from './documento';

describe('documento', () => {
  it('máscara de CPF acompanha a digitação', () => {
    expect(mascaraCpfCnpj('5')).toBe('5');
    expect(mascaraCpfCnpj('5299')).toBe('529.9');
    expect(mascaraCpfCnpj('529982')).toBe('529.982');
    expect(mascaraCpfCnpj('5299822')).toBe('529.982.2');
    expect(mascaraCpfCnpj('52998224725')).toBe('529.982.247-25');
  });

  it('passando de 11 dígitos vira máscara de CNPJ', () => {
    expect(mascaraCpfCnpj('112223330001')).toBe('11.222.333/0001');
    expect(mascaraCpfCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(mascaraCpfCnpj('1122233300018199')).toBe('11.222.333/0001-81'); // trava em 14
  });

  it('valida os dígitos verificadores', () => {
    expect(cpfCnpjValido('529.982.247-25')).toBe(true);
    expect(cpfCnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cpfCnpjValido('529.982.247-26')).toBe(false);
    expect(cpfCnpjValido('111.111.111-11')).toBe(false);
    expect(cpfCnpjValido('')).toBe(false);
  });
});
