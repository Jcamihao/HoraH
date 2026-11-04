// Sobe tudo para desenvolver, na ordem certa, num terminal só: banco, WA-AKG (WhatsApp), túnel público,
// API e site. Também liga as peças entre si: acha (ou cria) a chave de API do WA-AKG, descobre o endereço
// do túnel e grava tudo em apps/api/.env antes de subir a API.
// Uso: npm run dev   (Ctrl+C para tudo)
//
// Variáveis opcionais: WAAKG_DIR (pasta do WA-AKG, padrão ../wa-akg), TUNEL=0 (não subir o túnel).
// Sem a pasta do WA-AKG o app sobe normalmente, só sem WhatsApp.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envApi = resolve(raiz, 'apps/api/.env');
const WAAKG_DIR = resolve(process.env.WAAKG_DIR || resolve(raiz, '..', 'wa-akg'));
const TUNEL_ATIVO = process.env.TUNEL !== '0';
const METRICAS_TUNEL = 20241;
const PORTAS_OBRIGATORIAS = { banco: 5440, api: 3000, site: 4200 };
const COR = { banco: '36', 'wa-akg': '32', túnel: '34', api: '33', site: '35' };

const passo = (msg) => console.log(`\n\x1b[1m▶ ${msg}\x1b[0m`);
const ok = (msg) => console.log(`\x1b[32m✔ ${msg}\x1b[0m`);
const aviso = (msg) => console.log(`\x1b[33m! ${msg}\x1b[0m`);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const rodar = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: raiz, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`Falhou: ${cmd} ${args.join(' ')}`);
    process.exit(1);
  }
};

const portaOcupada = (porta) =>
  new Promise((resolver) => {
    const s = net.createConnection({ port: porta, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolver(true)));
    s.once('error', () => resolver(false));
  });

const lerEnv = (arquivo) => {
  const valores = {};
  if (!existsSync(arquivo)) return valores;
  for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return valores;
};

// Troca (ou acrescenta) as linhas CHAVE=valor sem mexer no resto do arquivo.
function gravarEnv(arquivo, valores) {
  let texto = readFileSync(arquivo, 'utf8');
  for (const [chave, valor] of Object.entries(valores)) {
    const re = new RegExp(`^${chave}=.*$`, 'm');
    texto = re.test(texto) ? texto.replace(re, () => `${chave}=${valor}`) : texto.replace(/\n?$/, `\n${chave}=${valor}\n`);
  }
  writeFileSync(arquivo, texto);
}

async function esperarHttp(url, tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (r.status < 500) return true;
    } catch {}
    await dormir(2000);
  }
  return false;
}

// ---- preparo (só faz o que falta)
if (!existsSync(resolve(raiz, 'node_modules'))) {
  passo('Instalando dependências (primeira vez)');
  rodar('npm', ['install']);
}

if (!existsSync(envApi)) {
  passo('Criando apps/api/.env com JWT_SECRET aleatório');
  copyFileSync(resolve(raiz, 'apps/api/.env.example'), envApi);
  gravarEnv(envApi, { JWT_SECRET: randomBytes(48).toString('base64url') });
}

if (!existsSync(resolve(raiz, 'packages/shared/dist/cjs'))) {
  passo('Compilando packages/shared');
  rodar('npm', ['run', 'build', '-w', '@hora-h/shared']);
}

for (const [nome, porta] of Object.entries(PORTAS_OBRIGATORIAS)) {
  if (await portaOcupada(porta)) {
    console.error(`A porta ${porta} (${nome}) já está em uso. Feche o que está rodando nela e tente de novo.`);
    process.exit(1);
  }
}

// ---- processos
const filhos = [];
let encerrando = false;

/**
 * Sobe um processo e devolve { p, pronto }: `pronto` resolve quando uma linha da saída casa com `quandoPronto`.
 * `filtro` decide quais linhas aparecem no terminal. Cada filho vira líder de grupo para matarmos tudo dele.
 */
function iniciar(nome, cmd, args, { cwd = raiz, quandoPronto, filtro } = {}) {
  const p = spawn(cmd, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  filhos.push({ nome, p });
  let resolverPronto;
  const pronto = new Promise((r) => (resolverPronto = r));
  if (!quandoPronto) resolverPronto(true);
  let resto = '';
  const imprimir = (buf) => {
    resto += buf.toString();
    const linhas = resto.split('\n');
    resto = linhas.pop();
    for (const l of linhas) {
      const limpa = l.replace(/\x1b\[[0-9;]*m/g, ''); // alguns programas colorem no meio da frase
      if (!filtro || filtro(limpa)) console.log(`\x1b[${COR[nome]}m[${nome}]\x1b[0m ${l}`);
      if (quandoPronto && quandoPronto.test(limpa)) resolverPronto(true);
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
  return { p, pronto };
}

const comLimite = (promessa, ms, o_que) =>
  Promise.race([promessa, dormir(ms).then(() => { throw new Error(`${o_que} não ficou pronto em ${Math.round(ms / 1000)} s`); })]);

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
  setTimeout(() => process.exit(codigo), 5000).unref();
  const t = setInterval(() => {
    if (!filhos.some(({ p }) => p.exitCode === null && p.signalCode === null)) {
      clearInterval(t);
      process.exit(codigo);
    }
  }, 200);
}
process.on('SIGINT', () => encerrar(0));
process.on('SIGTERM', () => encerrar(0));
process.on('uncaughtException', (e) => {
  console.error(`\nErro: ${e.message}`);
  encerrar(1);
});
process.on('unhandledRejection', (e) => {
  console.error(`\nErro: ${e?.message ?? e}`);
  encerrar(1);
});

// ---- WhatsApp: chave de API do WA-AKG (acha a existente ou cria)
function chaveDoWaakg() {
  const script = `
    const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();const c=require('crypto');
    (async()=>{
      const com=await p.user.findFirst({where:{apiKey:{not:null}}});
      if(com){console.log(JSON.stringify({key:com.apiKey,criada:false}));return;}
      const alvo=(await p.user.findFirst({where:{role:'SUPERADMIN'}}))||(await p.user.findFirst());
      const key=c.randomUUID();
      if(alvo){await p.user.update({where:{id:alvo.id},data:{apiKey:key}});console.log(JSON.stringify({key,criada:true,email:alvo.email}));return;}
      const senha=c.randomBytes(9).toString('base64url');
      const hash=await require('bcryptjs').hash(senha,10);
      await p.user.create({data:{email:'admin@horah.local',name:'Admin Hora H',password:hash,role:'SUPERADMIN',apiKey:key}});
      console.log(JSON.stringify({key,criada:true,email:'admin@horah.local',senha}));
    })().catch(e=>{console.log(JSON.stringify({erro:String(e.message).slice(0,200)}));process.exit(1)}).finally(()=>p.$disconnect());`;
  const r = spawnSync('node', ['-e', script], { cwd: WAAKG_DIR, encoding: 'utf8' });
  const linha = (r.stdout || '').trim().split('\n').pop();
  try {
    return JSON.parse(linha);
  } catch {
    return { erro: (r.stderr || r.stdout || 'sem resposta').slice(0, 200) };
  }
}

async function preparaTunel() {
  const consulta = async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${METRICAS_TUNEL}/quicktunnel`, { signal: AbortSignal.timeout(2000) });
      return (await r.json()).hostname || null;
    } catch {
      return null;
    }
  };
  const existente = await consulta();
  if (existente) {
    ok(`Túnel já estava rodando, reaproveitado: ${existente}`);
    return existente;
  }
  const emPath = spawnSync('which', ['cloudflared'], { encoding: 'utf8' }).stdout.trim();
  let bin = emPath || join(homedir(), 'cloudflared');
  if (!emPath && !existsSync(bin)) {
    if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Instale o cloudflared manualmente (só baixo a versão linux x64).');
    passo('Baixando o cloudflared (primeira vez)');
    const r = await fetch('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64', { redirect: 'follow' });
    if (!r.ok) throw new Error(`Download do cloudflared falhou (${r.status})`);
    writeFileSync(bin, Buffer.from(await r.arrayBuffer()));
    chmodSync(bin, 0o755);
  }
  // só erros aparecem: o cloudflared é muito falante e o endereço é mostrado por este script
  iniciar('túnel', bin, ['tunnel', '--no-autoupdate', '--metrics', `127.0.0.1:${METRICAS_TUNEL}`, '--url', 'http://localhost:3000'], {
    filtro: (l) => /\bERR\b/.test(l),
  });
  for (let i = 0; i < 40; i++) {
    const host = await consulta();
    if (host) return host;
    await dormir(1500);
  }
  throw new Error('O túnel não informou o endereço público em 60 s');
}

passo('Subindo o banco (PostgreSQL embutido, porta 5440)');
const banco = iniciar('banco', 'npm', ['run', 'dev:db'], { quandoPronto: /Migrations aplicadas/ });
await comLimite(banco.pronto, 120_000, 'O banco');

let waakg = null; // { porta, host, chave } quando o WhatsApp está ligado
let tunelHost = null;
const temWaakg = existsSync(join(WAAKG_DIR, 'package.json'));
if (!temWaakg) {
  aviso(`Pasta do WA-AKG não encontrada (${WAAKG_DIR}). Subindo sem WhatsApp.`);
} else if (!existsSync(join(WAAKG_DIR, 'node_modules')) || !existsSync(join(WAAKG_DIR, '.env'))) {
  aviso('O WA-AKG não está instalado ou não tem .env (veja docs/roteiro-de-testes.md, parte B). Subindo sem WhatsApp.');
} else {
  const portaWaakg = Number(lerEnv(join(WAAKG_DIR, '.env')).PORT || 3100);
  if (portaWaakg === 3000 || portaWaakg === 4200 || portaWaakg === 5440) {
    aviso(`O WA-AKG está configurado na porta ${portaWaakg}, que o Hora H usa. Mude o PORT do .env dele (ex.: 3100). Subindo sem WhatsApp.`);
  } else {
    passo(`WhatsApp: WA-AKG na porta ${portaWaakg}`);
    if (await portaOcupada(portaWaakg)) {
      ok('WA-AKG já estava rodando, reaproveitado');
    } else {
      const w = iniciar('wa-akg', 'npm', ['run', 'dev'], {
        cwd: WAAKG_DIR,
        quandoPronto: /Server\s+http/,
        // o WA-AKG imprime linhas de depuração a cada minuto
        filtro: (l) => !/\bDBG\b|Scheduler|\[Cron\]/.test(l),
      });
      await comLimite(w.pronto, 180_000, 'O WA-AKG');
    }
    if (!(await esperarHttp(`http://127.0.0.1:${portaWaakg}/`, 30))) {
      aviso('O WA-AKG não respondeu. Subindo sem WhatsApp.');
    } else {
      const k = chaveDoWaakg();
      if (k.erro) {
        aviso(`Não consegui a chave de API do WA-AKG: ${k.erro}`);
      } else {
        if (k.criada) ok(`Chave de API criada para ${k.email} no WA-AKG${k.senha ? ` (usuário novo, senha: ${k.senha})` : ''}`);
        else ok('Chave de API do WA-AKG encontrada');
        waakg = { porta: portaWaakg, chave: k.key };
      }
    }
  }
}

if (waakg) {
  if (!TUNEL_ATIVO) {
    aviso('TUNEL=0: sem túnel, o WA-AKG recusa o endereço do webhook. O WhatsApp fica desligado.');
    waakg = null;
  } else {
    passo('Túnel público (o WA-AKG só chama endereço https)');
    try {
      tunelHost = await preparaTunel();
    } catch (e) {
      aviso(`${e.message}. Subindo sem WhatsApp.`);
      waakg = null;
    }
  }
}

// ---- liga as peças no .env da API (antes de subir a API)
if (waakg && tunelHost) {
  const atual = lerEnv(envApi);
  const segredo = atual.WAAKG_WEBHOOK_SECRET && atual.WAAKG_WEBHOOK_SECRET.length >= 32 && atual.WAAKG_WEBHOOK_SECRET !== waakg.chave
    ? atual.WAAKG_WEBHOOK_SECRET
    : randomBytes(32).toString('hex');
  gravarEnv(envApi, {
    WAAKG_URL: `http://127.0.0.1:${waakg.porta}`,
    WAAKG_API_KEY: waakg.chave,
    WAAKG_WEBHOOK_SECRET: segredo,
    WAAKG_WEBHOOK_URL: `https://${tunelHost}/api/webhooks/whatsapp`,
  });
  ok('apps/api/.env atualizado com as 4 variáveis do WhatsApp');
} else {
  // sem as quatro juntas a API não sobe: deixa todas vazias
  const atual = lerEnv(envApi);
  if (atual.WAAKG_URL) {
    gravarEnv(envApi, { WAAKG_URL: '', WAAKG_API_KEY: '', WAAKG_WEBHOOK_SECRET: '', WAAKG_WEBHOOK_URL: '' });
    aviso('WhatsApp desligado: variáveis WAAKG_* esvaziadas no apps/api/.env para a API subir.');
  }
}

passo('Subindo a API (porta 3000) e o site (porta 4200)');
const api = iniciar('api', 'npm', ['run', 'dev:api'], { quandoPronto: /escutando na porta/ });
const site = iniciar('site', 'npm', ['run', 'dev:web'], { quandoPronto: /Local:\s+http/ });
await comLimite(Promise.all([api.pronto, site.pronto]), 240_000, 'A API e o site');

let tunelOk = null;
if (waakg && tunelHost) tunelOk = await esperarHttp(`https://${tunelHost}/api/health`, 20);

console.log('');
ok('Tudo no ar');
console.log('  Site do Hora H:   http://localhost:4200');
console.log('  API:              http://localhost:3000/api');
if (waakg) {
  console.log(`  WA-AKG (painel):  http://localhost:${waakg.porta}   (use localhost, não 127.0.0.1)`);
  console.log(`  Túnel público:    https://${tunelHost}  ${tunelOk ? '(chega na API)' : '(AINDA NÃO chega na API: espere um minuto e teste de novo)'}`);
  console.log('  WhatsApp: no site, Ajustes, WhatsApp, Conectar WhatsApp, e leia o QR no celular do salão.');
} else {
  console.log('  WhatsApp: desligado nesta execução (veja os avisos acima).');
}
console.log('  Ctrl+C para parar tudo.\n');
