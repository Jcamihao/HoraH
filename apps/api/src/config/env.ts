export interface Env {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_ACCESS_TTL_SEC: number;
  REFRESH_TTL_DAYS: number;
  COOKIE_SECURE: boolean;
  /** Endereço público do front (usado para montar o link de convite). */
  APP_BASE_URL: string;
  /** Quantos proxies confiáveis existem na frente da API (para req.ip). 0 = nenhum. */
  TRUST_PROXY: number;
  THROTTLE_ENABLED: boolean;
  TRIAL_DAYS: number;
  /** Cobrança pelo Asaas. Sem chave, o resto do sistema funciona e a tela de assinatura avisa que a cobrança não está configurada. */
  ASAAS_API_KEY: string;
  /** Sandbox por padrão: produção só com a URL escolhida de propósito. */
  ASAAS_BASE_URL: string;
  /** Segredo que o Asaas manda no cabeçalho `asaas-access-token` de cada webhook. */
  ASAAS_WEBHOOK_TOKEN: string;
  /** `resend` envia de verdade; `log` só escreve no log (desenvolvimento); `memory` só em teste. */
  MAIL_PROVIDER: 'resend' | 'log' | 'memory';
  RESEND_API_KEY: string;
  MAIL_FROM: string;
  /** Fila dos jobs (BullMQ). Sem Redis, em desenvolvimento os jobs rodam num temporizador do próprio processo. */
  REDIS_URL: string;
  /** De quanto em quanto tempo o job de assinaturas roda. */
  ROTINAS_INTERVALO_MIN: number;
}

function inteiro(raw: Record<string, unknown>, chave: string, padrao: number, min: number, max: number): number {
  const valor = raw[chave];
  if (valor === undefined || valor === '') return padrao;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Variável ${chave} inválida: esperado inteiro entre ${min} e ${max}.`);
  }
  return n;
}

function booleano(raw: Record<string, unknown>, chave: string, padrao: boolean): boolean {
  const valor = raw[chave];
  if (valor === undefined || valor === '') return padrao;
  if (valor === 'true' || valor === '1') return true;
  if (valor === 'false' || valor === '0') return false;
  throw new Error(`Variável ${chave} inválida: use true ou false.`);
}

/** Valida as variáveis de ambiente no boot: falhar cedo é melhor do que rodar com segredo fraco. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const nodeEnv = (raw['NODE_ENV'] as string) || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV deve ser development, production ou test.');
  }
  const databaseUrl = raw['DATABASE_URL'];
  if (typeof databaseUrl !== 'string' || !databaseUrl.startsWith('postgres')) {
    throw new Error('DATABASE_URL ausente ou inválida (esperado postgresql://...).');
  }
  const jwtSecret = raw['JWT_SECRET'];
  if (typeof jwtSecret !== 'string' || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET ausente ou curto demais (mínimo 32 caracteres).');
  }
  const producao = nodeEnv === 'production';
  const texto = (chave: string, padrao = ''): string => {
    const valor = raw[chave];
    return typeof valor === 'string' && valor !== '' ? valor : padrao;
  };
  const provedor = texto('MAIL_PROVIDER', producao ? 'resend' : 'log');
  if (!['resend', 'log', 'memory'].includes(provedor)) throw new Error('MAIL_PROVIDER deve ser resend, log ou memory.');
  if (provedor === 'memory' && nodeEnv !== 'test') throw new Error('MAIL_PROVIDER=memory só vale em teste.');
  if (provedor === 'resend' && !texto('RESEND_API_KEY')) throw new Error('MAIL_PROVIDER=resend exige RESEND_API_KEY.');
  if (producao && !texto('REDIS_URL')) throw new Error('REDIS_URL é obrigatória em produção (fila dos jobs).');
  if (texto('ASAAS_API_KEY') && !texto('ASAAS_WEBHOOK_TOKEN')) {
    throw new Error('ASAAS_API_KEY exige ASAAS_WEBHOOK_TOKEN: sem ele qualquer um poderia forjar um pagamento.');
  }
  return {
    NODE_ENV: nodeEnv as Env['NODE_ENV'],
    PORT: inteiro(raw, 'PORT', 3000, 1, 65535),
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_ACCESS_TTL_SEC: inteiro(raw, 'JWT_ACCESS_TTL_SEC', 900, 60, 3600),
    REFRESH_TTL_DAYS: inteiro(raw, 'REFRESH_TTL_DAYS', 30, 1, 90),
    COOKIE_SECURE: booleano(raw, 'COOKIE_SECURE', producao),
    APP_BASE_URL: ((raw['APP_BASE_URL'] as string) || 'http://localhost:4200').replace(/\/+$/, ''),
    TRUST_PROXY: inteiro(raw, 'TRUST_PROXY', 0, 0, 5),
    THROTTLE_ENABLED: booleano(raw, 'THROTTLE_ENABLED', true),
    TRIAL_DAYS: inteiro(raw, 'TRIAL_DAYS', 7, 1, 60),
    ASAAS_API_KEY: texto('ASAAS_API_KEY'),
    ASAAS_BASE_URL: texto('ASAAS_BASE_URL', 'https://api-sandbox.asaas.com/v3').replace(/\/+$/, ''),
    ASAAS_WEBHOOK_TOKEN: texto('ASAAS_WEBHOOK_TOKEN'),
    MAIL_PROVIDER: provedor as Env['MAIL_PROVIDER'],
    RESEND_API_KEY: texto('RESEND_API_KEY'),
    MAIL_FROM: texto('MAIL_FROM', 'Hora H <onboarding@resend.dev>'),
    REDIS_URL: texto('REDIS_URL'),
    ROTINAS_INTERVALO_MIN: inteiro(raw, 'ROTINAS_INTERVALO_MIN', 10, 1, 1440),
  };
}
