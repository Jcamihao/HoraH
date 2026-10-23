/** Slugs que não podem ser usados por estabelecimentos (rotas do sistema e termos que enganam). */
export const SLUGS_RESERVADOS: readonly string[] = [
  'admin', 'api', 'app', 'painel', 'login', 'logout', 'cadastro', 'entrar', 'sair',
  'assets', 'static', 'public', 'www', 'mail', 'suporte', 'ajuda', 'help', 'contato',
  'termos', 'privacidade', 'planos', 'precos', 'sobre', 'blog', 'status', 'health',
  'convite', 'agendamento', 'agendamentos', 'webhook', 'webhooks', 'auth', 'conta',
  'horah', 'hora-h', 'asaas', 'whatsapp', 'robots', 'sitemap', 'favicon',
];

/** 3 a 40 caracteres, minúsculas/dígitos/hífen, sem hífen nas pontas nem duplo. */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

export type ErroSlug = 'tamanho' | 'formato' | 'reservado';

export function validarSlug(slug: string): ErroSlug | null {
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) return 'tamanho';
  if (!SLUG_REGEX.test(slug)) return 'formato';
  if (SLUGS_RESERVADOS.includes(slug)) return 'reservado';
  return null;
}

/** Sugere um slug a partir do nome (remove acentos, troca separadores por hífen). */
export function slugificar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
}
