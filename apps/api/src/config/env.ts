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
  };
}
