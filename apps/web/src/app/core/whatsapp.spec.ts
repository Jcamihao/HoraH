import { linkWhatsapp, mascaraWhatsapp, whatsappValido } from './whatsapp';

describe('whatsapp', () => {
  it('máscara acompanha a digitação', () => {
    expect(mascaraWhatsapp('')).toBe('');
    expect(mascaraWhatsapp('1')).toBe('(1');
    expect(mascaraWhatsapp('119')).toBe('(11) 9');
    expect(mascaraWhatsapp('119999')).toBe('(11) 9999');
    expect(mascaraWhatsapp('119999988')).toBe('(11) 99999-88');
    expect(mascaraWhatsapp('11999998888')).toBe('(11) 99999-8888');
    expect(mascaraWhatsapp('119999988889999')).toBe('(11) 99999-8888'); // não passa de 11 dígitos
  });

  it('aceita o +55 colado', () => {
    expect(mascaraWhatsapp('+55 11 99999-8888')).toBe('(11) 99999-8888');
  });

  it('valida só celular brasileiro com DDD', () => {
    expect(whatsappValido('(11) 99999-8888')).toBe(true);
    expect(whatsappValido('(11) 3333-4444')).toBe(false);
    expect(whatsappValido('(11) 9999')).toBe(false);
    expect(whatsappValido('')).toBe(false);
  });

  it('link do WhatsApp usa o número canônico', () => {
    expect(linkWhatsapp('5511999998888')).toBe('https://wa.me/5511999998888');
  });
});
