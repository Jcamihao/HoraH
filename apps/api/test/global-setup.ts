import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Sobe um PostgreSQL embutido numa porta livre, aplica as migrations reais e expõe DATABASE_URL.
 * Os testes rodam contra o mesmo schema (e as mesmas constraints) da produção.
 */
export default async function globalSetup(): Promise<void> {
  const raiz = resolve(__dirname, '..');
  const { portaLivre, subirPostgres } = await import(resolve(raiz, 'scripts/pg-embutido.mjs'));
  const dir = mkdtempSync(join(tmpdir(), 'horah-pg-'));
  const porta = await portaLivre();
  const banco = await subirPostgres({ dir, porta, persistente: false });

  execSync('npx prisma migrate deploy', {
    cwd: raiz,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: banco.url },
  });

  process.env.DATABASE_URL = banco.url;
  (globalThis as any).__HORAH_PG__ = banco;
}
