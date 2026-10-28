/**
 * WhatsApp brasileiro de celular: DDD (2 dígitos, sem zero inicial) + 9 + 8 dígitos.
 * Forma canônica guardada no banco e usada nos envios: "55" + DDD + número, só dígitos
 * (ex.: 5511999998888). Telefone fixo e número estrangeiro ficam de fora de propósito:
 * o lançamento é só no Brasil e o WhatsApp do salão precisa receber a mensagem.
 */
export const WHATSAPP_CANONICO_REGEX = /^55[1-9][0-9]9[0-9]{8}$/;

/** Aceita "(11) 99999-8888", "+55 11 99999-8888", "11999998888"... Devolve a forma canônica ou null. */
export function normalizarWhatsapp(bruto: string): string | null {
  let digitos = bruto.replace(/\D/g, '');
  if (digitos.length === 13 && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (digitos.length !== 11) return null;
  const canonico = `55${digitos}`;
  return WHATSAPP_CANONICO_REGEX.test(canonico) ? canonico : null;
}

/** "5511999998888" -> "(11) 99999-8888". Se não estiver na forma canônica, devolve como veio. */
export function formatarWhatsapp(canonico: string): string {
  if (!WHATSAPP_CANONICO_REGEX.test(canonico)) return canonico;
  const nacional = canonico.slice(2);
  return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
}

/**
 * "5511999998888@s.whatsapp.net" -> "5511999998888". Só conversa individual (grupo e `@lid` ficam de fora).
 * Alguns números antigos do Brasil vêm sem o 9 depois do DDD (12 dígitos): completamos para a forma canônica.
 */
export function telefoneDoJid(jid: string): string | null {
  const m = /^(\d{10,15})(?::\d+)?@s\.whatsapp\.net$/.exec(jid);
  if (!m) return null;
  let digitos = m[1];
  if (digitos.length === 12 && digitos.startsWith('55')) digitos = `${digitos.slice(0, 4)}9${digitos.slice(4)}`;
  return WHATSAPP_CANONICO_REGEX.test(digitos) ? digitos : null;
}
