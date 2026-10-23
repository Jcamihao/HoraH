// Sobe um PostgreSQL embutido (sem Docker). Usado no desenvolvimento local e nos testes e2e.
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(import.meta.url);

export async function portaLivre() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function subirPostgres({ dir, porta, usuario = 'horah', senha = 'horah', banco = 'horah', persistente = true }) {
  const mod = require('embedded-postgres');
  const EmbeddedPostgres = mod.default || mod;
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: usuario,
    password: senha,
    port: porta,
    persistent: persistente,
    onLog: () => {},
    onError: () => {},
  });
  const { existsSync } = await import('node:fs');
  if (!existsSync(`${dir}/PG_VERSION`)) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(banco);
  } catch (e) {
    if (!String(e?.message ?? e).includes('already exists')) throw e;
  }
  return {
    pg,
    url: `postgresql://${usuario}:${senha}@localhost:${porta}/${banco}?schema=public`,
    parar: () => pg.stop(),
  };
}
