// Banco de desenvolvimento: PostgreSQL embutido, dados persistentes em apps/api/.data/postgres.
// Uso: npm run db:dev -w @hora-h/api   (deixe rodando num terminal)
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { subirPostgres } from './pg-embutido.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(raiz, '.data/postgres');
const porta = Number(process.env.DB_DEV_PORT || 5440);
mkdirSync(dir, { recursive: true });

const { url, parar } = await subirPostgres({ dir, porta });
console.log(`PostgreSQL de desenvolvimento no ar: ${url}`);
execSync('npx prisma migrate deploy', { cwd: raiz, stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
console.log('Migrations aplicadas. Ctrl+C para parar.');

const encerrar = async () => {
  await parar();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
setInterval(() => {}, 1 << 30);
