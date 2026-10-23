import { normalizarWhatsapp } from '@hora-h/shared';

export { formatarWhatsapp, normalizarWhatsapp } from '@hora-h/shared';

/** Formata enquanto digita: "11999998888" -> "(11) 99999-8888". Aceita o +55 colado. */
export function mascaraWhatsapp(texto: string): string {
  let digitos = texto.replace(/\D/g, '');
  if (digitos.length > 11 && digitos.startsWith('55')) digitos = digitos.slice(2);
  digitos = digitos.slice(0, 11);
  if (digitos.length <= 2) return digitos ? `(${digitos}` : '';
  if (digitos.length <= 7) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

export function whatsappValido(texto: string): boolean {
  return normalizarWhatsapp(texto) !== null;
}

/** Link que abre a conversa no WhatsApp com o cliente. */
export function linkWhatsapp(canonico: string): string {
  return `https://wa.me/${canonico}`;
}
