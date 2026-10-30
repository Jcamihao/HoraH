// Sobe tudo para desenvolver: banco, API e site, na ordem certa, num terminal só.
// Uso: npm run dev:all   (Ctrl+C para tudo)
// Na primeira vez também instala dependências, cria apps/api/.env e compila o pacote shared.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORTAS = { banco: 5440, api: 3000, site: 4200 };
const COR = { banco: '36', api: '33', site: '35' };

const passo = (msg) => console.log(`\n\x1b[1m▶ ${msg}\x1b[0m`);
const rodar = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: raiz, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`Falhou: ${cmd} ${args.join(' ')}`);
    process.exit(1);
  }
};

const portaOcupada = (porta) =>
  new Promise((ok) => {
    const s = net.createConnection({ port: porta, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), ok(true)));
    s.once('error', () => ok(false));
  });

// ---- preparo (só faz o que falta)
if (!existsSync(resolve(raiz, 'node_modules'))) {
  passo('Instalando dependências (primeira vez)');
  rodar('npm', ['install']);
}

const envApi = resolve(raiz, 'apps/api/.env');
if (!existsSync(envApi)) {
  passo('Criando apps/api/.env com JWT_SECRET aleatório');
  copyFileSync(resolve(raiz, 'apps/api/.env.example'), envApi);
  const segredo = randomBytes(48).toString('base64url');
  writeFileSync(envApi, readFileSync(envApi, 'utf8').replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${segredo}`));
}

if (!existsSync(resolve(raiz, 'packages/shared/dist/cjs'))) {
  passo('Compilando packages/shared');
  rodar('npm', ['run', 'build', '-w', '@hora-h/shared']);
}

for (const [nome, porta] of Object.entries(PORTAS)) {
  if (await portaOcupada(porta)) {
    console.error(`A porta ${porta} (${nome}) já está em uso. Feche o que está rodando nela e tente de novo.`);
    process.exit(1);
  }
}

// ---- processos
const filhos = [];
let encerrando = false;

function iniciar(nome, args, quandoPronto) {
  // detached: cada filho vira líder de grupo, e matamos o grupo todo (npm + node por baixo)
  const p = spawn('npm', args, { cwd: raiz, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  filhos.push({ nome, p });
  let resto = '';
  const imprimir = (buf) => {
    resto += buf.toString();
    const linhas = resto.split('\n');
    resto = linhas.pop();
    for (const l of linhas) {
      console.log(`\x1b[${COR[nome]}m[${nome}]\x1b[0m ${l}`);
      if (quandoPronto && quandoPronto.re.test(l)) {
        const f = quandoPronto.fn;
        quandoPronto.fn = null;
        quandoPronto.re = /$^/;
        f?.();
      }
    }
  };
  p.stdout.on('data', imprimir);
  p.stderr.on('data', imprimir);
  p.on('exit', (code) => {
    if (!encerrando) {
      console.error(`\n[${nome}] parou (código ${code}). Encerrando tudo.`);
      encerrar(1);
    }
  });
  return p;
}

function encerrar(codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  console.log('\nEncerrando…');
  for (const { nome, p } of [...filhos].reverse()) {
    try {
      // o banco precisa de SIGINT para fechar o PostgreSQL com calma
      process.kill(-p.pid, nome === 'banco' ? 'SIGINT' : 'SIGTERM');
    } catch {}
  }
  setTimeout(() => process.exit(codigo), 4000).unref();
  const vivos = () => filhos.filter(({ p }) => p.exitCode === null && p.signalCode === null);
  const t = setInterval(() => {
    if (!vivos().length) {
      clearInterval(t);
      process.exit(codigo);
    }
  }, 200);
}
process.on('SIGINT', () => encerrar(0));
process.on('SIGTERM', () => encerrar(0));

passo('Subindo o banco (PostgreSQL embutido, porta 5440)');
iniciar('banco', ['run', 'dev:db'], {
  re: /Migrations aplicadas/,
  fn: () => {
    passo('Subindo a API (porta 3000) e o site (porta 4200)');
    iniciar('api', ['run', 'dev:api'], {
      re: /escutando na porta/,
      fn: () => console.log('\x1b[32m✔ API pronta\x1b[0m'),
    });
    iniciar('site', ['run', 'dev:web'], {
      re: /Local:\s+http/,
      fn: () => console.log('\n\x1b[32m✔ Tudo no ar. Abra http://localhost:4200  (Ctrl+C para parar)\x1b[0m\n'),
    });
  },
});
