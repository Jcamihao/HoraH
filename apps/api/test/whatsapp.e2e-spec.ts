import { DateTime } from 'luxon';
import { MemoryTransport } from '../src/mail/mail.transport';
import { CHAVE_WAAKG, SEGREDO_WEBHOOK, URL_WEBHOOK, WaAkgFake } from './waakg-fake';
import {
  Ambiente, auth, diaFuturo, enviarWebhookWa, envWhatsapp, instante, limparBanco, logarProfissional, montarSalao, SalaoPronto, subirApp,
  whatsappUnico,
} from './helpers';

async function esperar(condicao: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const fim = Date.now() + ms;
  while (!(await condicao()) && Date.now() < fim) await new Promise((r) => setTimeout(r, 25));
}

describe('WhatsApp: conexão e confirmação imediata', () => {
  let env: Ambiente;
  let fake: WaAkgFake;
  const sql = () => env.prisma.semTenant;

  beforeAll(async () => {
    fake = await new WaAkgFake().iniciar();
    env = await subirApp(envWhatsapp(fake.url));
    await limparBanco(env.prisma);
  });
  afterAll(async () => {
    await env.fechar();
    await fake.parar();
  });
  beforeEach(() => { fake.envios.length = 0; fake.falhasDeEnvio = 0; MemoryTransport.caixa.length = 0; });

  const idSessao = (s: SalaoPronto) => s.dono.estabelecimentoId;
  async function ligar(s: SalaoPronto): Promise<void> {
    await env.http().post('/api/whatsapp/conectar').set(s.h).expect(200);
    fake.conectar(idSessao(s));
    await enviarWebhookWa(env, 'connection.update', idSessao(s), { status: 'CONNECTED', qr: null }).expect(200);
  }
  const marcarPeloLink = async (s: SalaoPronto, hhmm = '10:00', dia = diaFuturo(s.fuso, 4, 1), nome = 'Maria Cliente', whatsapp = whatsappUnico()) =>
    (await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
      profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, dia, hhmm), nome, whatsapp, consentimento: true,
    }).expect(201)).body as { token: string; inicio: string };

  describe('conectar o número do salão', () => {
    it('antes de conectar: configurado, desconectado e sem nada na fila', async () => {
      const s = await montarSalao(env);
      expect((await env.http().get('/api/whatsapp').set(s.h).expect(200)).body).toMatchObject({
        configurado: true, status: 'DESCONECTADA', conectadoEm: null, ultimaQuedaEm: null, naFila: 0,
      });
    });

    it('conectar cria a sessão do salão (nome = id do salão), desliga o bot do WA-AKG e registra o webhook assinado', async () => {
      const s = await montarSalao(env);
      const r = (await env.http().post('/api/whatsapp/conectar').set(s.h).expect(200)).body;
      expect(r.status).toBe('AGUARDANDO_QR');
      const sessao = fake.sessoes.get(idSessao(s))!;
      expect(sessao.status).toBe('SCAN_QR');
      expect(sessao.botAtivo).toBe(false);
      expect(sessao.webhooks).toHaveLength(1);
      expect(sessao.webhooks[0]).toMatchObject({
        name: 'hora-h', url: URL_WEBHOOK, secret: SEGREDO_WEBHOOK, events: ['message.received', 'message.status', 'connection.update'],
      });
      expect(fake.chamadas.filter((c) => c.caminho === '/sessions' && c.metodo === 'POST').at(-1)!.corpo.sessionId).toBe(idSessao(s));
    });

    it('o QR chega como imagem PNG pronta para a tela desenhar', async () => {
      const s = await montarSalao(env);
      await env.http().post('/api/whatsapp/conectar').set(s.h).expect(200);
      const r = (await env.http().get('/api/whatsapp/qr').set(s.h).expect(200)).body;
      expect(r.status).toBe('AGUARDANDO_QR');
      expect(r.qrImagem).toMatch(/^data:image\/png;base64,/);
    });

    it('logo depois de conectar o WA-AKG ainda aparece parado: a tela segue "aguardando" e o QR chega quando fica pronto', async () => {
      const s = await montarSalao(env);
      fake.demoraParaGerarQr = true;
      try {
        const r = (await env.http().post('/api/whatsapp/conectar').set(s.h).expect(200)).body;
        expect(r.status).toBe('AGUARDANDO_QR');
        const cedo = (await env.http().get('/api/whatsapp/qr').set(s.h).expect(200)).body;
        expect(cedo).toEqual({ status: 'AGUARDANDO_QR', qrImagem: null }); // ainda sem QR, mas NÃO virou "desconectado"
        fake.gerarQr(idSessao(s));
        const pronto = (await env.http().get('/api/whatsapp/qr').set(s.h).expect(200)).body;
        expect(pronto.qrImagem).toMatch(/^data:image\/png;base64,/);
      } finally {
        fake.demoraParaGerarQr = false;
      }
    });

    it('conectar de novo não duplica sessão nem webhook; a URL e o segredo atuais valem', async () => {
      const s = await montarSalao(env);
      await env.http().post('/api/whatsapp/conectar').set(s.h).expect(200);
      fake.sessoes.get(idSessao(s))!.webhooks[0].secret = 'segredo-antigo';
      await env.http().post('/api/whatsapp/conectar').set(s.h).expect(200);
      const sessao = fake.sessoes.get(idSessao(s))!;
      expect(fake.chamadas.filter((c) => c.metodo === 'POST' && c.caminho === '/sessions' && c.corpo.sessionId === idSessao(s))).toHaveLength(1);
      expect(sessao.webhooks).toHaveLength(1);
      expect(sessao.webhooks[0].secret).toBe(SEGREDO_WEBHOOK);
    });

    it('cada salão tem a própria sessão: o de um nunca aparece no outro', async () => {
      const a = await montarSalao(env);
      const b = await montarSalao(env);
      await ligar(a);
      expect((await env.http().get('/api/whatsapp').set(a.h).expect(200)).body.status).toBe('CONECTADA');
      expect((await env.http().get('/api/whatsapp').set(b.h).expect(200)).body.status).toBe('DESCONECTADA');
      expect(fake.sessoes.has(idSessao(b))).toBe(false);
    });

    it('webhook connection.update: conectou vira CONECTADA; caiu avisa o dono (painel e e-mail), uma vez', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      expect((await env.http().get('/api/whatsapp').set(s.h).expect(200)).body.conectadoEm).not.toBeNull();

      await enviarWebhookWa(env, 'connection.update', idSessao(s), { status: 'DISCONNECTED', qr: null }).expect(200);
      await enviarWebhookWa(env, 'connection.update', idSessao(s), { status: 'DISCONNECTED', qr: null }).expect(200); // repetido
      const d = (await env.http().get('/api/whatsapp').set(s.h).expect(200)).body;
      // a tela confere com o WA-AKG, que (no fake) ainda diz CONNECTED: o webhook é o aviso, a conferência corrige depois
      expect(d.ultimaQuedaEm).not.toBeNull();
      const notificacoes = (await env.http().get('/api/notificacoes').set(s.h).expect(200)).body;
      expect(notificacoes.itens.filter((n: any) => n.tipo === 'whatsapp_caiu')).toHaveLength(1);
      await esperar(() => MemoryTransport.caixa.some((e) => /desconectou/.test(e.assunto)));
      expect(MemoryTransport.caixa.filter((e) => /desconectou/.test(e.assunto))).toHaveLength(1);
    });

    it('código de pareamento: serve quando o celular do salão é o que vai conectar', async () => {
      const s = await montarSalao(env);
      await env.http().post('/api/whatsapp/conectar').set(s.h).expect(200);
      const r = (await env.http().post('/api/whatsapp/parear').set(s.h).send({ telefone: '(11) 99999-8888' }).expect(200)).body;
      expect(r.codigo).toBe('ABCD-1234');
      expect(fake.chamadas.filter((c) => c.caminho.endsWith('/pair')).at(-1)!.corpo).toEqual({ phoneNumber: '5511999998888' });
      await env.http().post('/api/whatsapp/parear').set(s.h).send({ telefone: '123' }).expect(400);
    });

    it('desconectar pede logout ao WA-AKG e não alarma o dono', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      const r = (await env.http().post('/api/whatsapp/desconectar').set(s.h).expect(200)).body;
      expect(r.status).toBe('DESCONECTADA');
      expect(fake.sessoes.get(idSessao(s))!.status).toBe('STOPPED'); // logout e depois parar, para não gerar QR sozinho
      const n = (await env.http().get('/api/notificacoes').set(s.h).expect(200)).body;
      expect(n.itens.filter((x: any) => x.tipo === 'whatsapp_caiu')).toHaveLength(0);
    });

    it('só o dono mexe na conexão', async () => {
      const s = await montarSalao(env);
      const prof = await logarProfissional(env, s.h, s.profId);
      for (const [m, rota] of [['get', '/api/whatsapp'], ['post', '/api/whatsapp/conectar'], ['get', '/api/whatsapp/qr'], ['post', '/api/whatsapp/desconectar'], ['get', '/api/notificacoes']] as const) {
        await env.http()[m](rota).set(auth(prof)).expect(403);
      }
      await env.http().get('/api/whatsapp').expect(401);
    });
  });

  describe('webhook do WhatsApp', () => {
    it('sem assinatura, com assinatura errada ou de outro segredo: 401 e nada acontece', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      const corpo = JSON.stringify({ event: 'connection.update', sessionId: idSessao(s), data: { status: 'DISCONNECTED' } });
      await env.http().post('/api/webhooks/whatsapp').set('content-type', 'application/json').send(corpo).expect(401);
      await env.http().post('/api/webhooks/whatsapp').set('content-type', 'application/json').set('x-webhook-signature', 'sha256=abc').send(corpo).expect(401);
      await enviarWebhookWa(env, 'connection.update', idSessao(s), { status: 'DISCONNECTED' }, { segredo: 'outro-segredo' }).expect(401);
      expect((await env.http().get('/api/whatsapp').set(s.h).expect(200)).body.status).toBe('CONECTADA');
    });

    it('corpo adulterado depois de assinado é recusado', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      const corpo = JSON.stringify({ event: 'connection.update', sessionId: idSessao(s), data: { status: 'CONNECTED' } });
      const assinatura = `sha256=${require('node:crypto').createHmac('sha256', SEGREDO_WEBHOOK).update(corpo).digest('hex')}`;
      await env.http().post('/api/webhooks/whatsapp').set('content-type', 'application/json').set('x-webhook-signature', assinatura)
        .send(corpo.replace('CONNECTED', 'DISCONNECTED')).expect(401);
    });

    it('sessão desconhecida ou lixo: 200 sem efeito (o WA-AKG não reenvia, e erro só gera ruído)', async () => {
      await enviarWebhookWa(env, 'message.received', '00000000-0000-4000-8000-000000000000', { from: '5511999998888@s.whatsapp.net', content: 'oi', type: 'TEXT' }).expect(200);
      await enviarWebhookWa(env, 'message.received', 'nao-e-uuid', {}).expect(200);
      expect(fake.envios).toHaveLength(0);
    });
  });

  describe('confirmação imediata do agendamento', () => {
    it('marcou pelo link: o cliente recebe a confirmação com o link para gerenciar; entra no log com o id do WhatsApp', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      const nome = 'Maria Silva Souza';
      const whatsapp = whatsappUnico();
      const ag = await marcarPeloLink(s, '10:00', undefined, nome, whatsapp);
      await esperar(() => fake.envios.length >= 1);
      expect(fake.envios).toHaveLength(1);
      const envio = fake.envios[0];
      expect(envio.sessionId).toBe(idSessao(s));
      expect(envio.jid).toBe(`55${whatsapp.replace(/\D/g, '')}@s.whatsapp.net`);
      expect(envio.texto).toContain('Olá, Maria!');
      expect(envio.texto).toContain('Corte com Prof Um');
      expect(envio.texto).toContain(`/agendamento/${ag.token}`);
      const log = await sql().mensagemLog.findFirstOrThrow({ where: { estabelecimentoId: s.dono.estabelecimentoId } });
      expect(log).toMatchObject({ direcao: 'ENVIADA', tipo: 'CONFIRMACAO', status: 'ENVIADA', waMensagemId: envio.id });
    });

    it('agendamento lançado no painel também recebe a confirmação (mesmo fluxo)', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      const dia = diaFuturo(s.fuso, 4, 2);
      await env.http().post('/api/agenda/agendamentos').set(s.h).send({
        profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, dia, '11:00'), nome: 'Balcão Teste', whatsapp: '(11) 98888-7777',
      }).expect(201);
      await esperar(() => fake.envios.length >= 1);
      expect(fake.envios[0].jid).toBe('5511988887777@s.whatsapp.net');
    });

    it('remarcar manda a confirmação do novo horário', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      const ag = await marcarPeloLink(s, '10:00');
      await esperar(() => fake.envios.length >= 1);
      const novo = instante(s.fuso, diaFuturo(s.fuso, 4, 1), '15:00');
      await env.http().post(`/api/meu-agendamento/${ag.token}/remarcar`).send({ inicio: novo }).expect(200);
      await esperar(() => fake.envios.length >= 2);
      expect(fake.envios[1].texto).toContain('remarcado');
      expect(fake.envios[1].texto).toContain('15:00');
    });

    it('salão sem WhatsApp conectado nunca enfileira nada', async () => {
      const s = await montarSalao(env);
      await marcarPeloLink(s);
      await new Promise((r) => setTimeout(r, 150));
      expect(await sql().mensagemLog.count({ where: { estabelecimentoId: s.dono.estabelecimentoId } })).toBe(0);
      expect(fake.envios).toHaveLength(0);
    });

    it('WhatsApp desconectado na hora: a mensagem espera na fila e sai quando reconecta', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      await enviarWebhookWa(env, 'connection.update', idSessao(s), { status: 'DISCONNECTED' }).expect(200);
      await marcarPeloLink(s);
      await new Promise((r) => setTimeout(r, 150));
      expect(fake.envios).toHaveLength(0);
      expect((await env.http().get('/api/whatsapp').set(s.h).expect(200)).body.naFila).toBe(1);
      await enviarWebhookWa(env, 'connection.update', idSessao(s), { status: 'CONNECTED' }).expect(200);
      await esperar(() => fake.envios.length >= 1);
      expect(fake.envios).toHaveLength(1);
    });

    it('envio que falha é repetido com espera; depois de 5 tentativas vira FALHOU (e não trava o resto)', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      fake.falhasDeEnvio = 99;
      await marcarPeloLink(s);
      await esperar(async () => (await sql().mensagemLog.count({ where: { estabelecimentoId: s.dono.estabelecimentoId, tentativas: { gte: 1 } } })) > 0);
      const m = await sql().mensagemLog.findFirstOrThrow({ where: { estabelecimentoId: s.dono.estabelecimentoId } });
      expect(m).toMatchObject({ status: 'NA_FILA', tentativas: 1 });
      expect(m.enviarApartirDe.getTime()).toBeGreaterThan(Date.now() + 20_000); // espera de 30 s antes da próxima

      const { RotinasService } = await import('../src/rotinas/rotinas.service');
      const rotinas = env.app.get(RotinasService);
      for (let i = 0; i < 6; i++) await rotinas.processarWhatsapp(new Date(Date.now() + (i + 1) * 3_600_000));
      const depois = await sql().mensagemLog.findUniqueOrThrow({ where: { id: m.id } });
      expect(depois.status).toBe('FALHOU');
      expect(depois.tentativas).toBe(5);
      expect(depois.erro).toMatch(/not connected/i);
    });

    it('o WhatsApp do salão cai por horas: a mensagem expira em vez de sair velha', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      await enviarWebhookWa(env, 'connection.update', idSessao(s), { status: 'DISCONNECTED' }).expect(200);
      await marcarPeloLink(s);
      const { RotinasService } = await import('../src/rotinas/rotinas.service');
      await env.app.get(RotinasService).processarWhatsapp(new Date(Date.now() + 7 * 3_600_000));
      const m = await sql().mensagemLog.findFirstOrThrow({ where: { estabelecimentoId: s.dono.estabelecimentoId } });
      expect(m.status).toBe('FALHOU');
      expect(m.erro).toMatch(/Expirou/);
    });

    it('vários despachos ao mesmo tempo (reconexão, job, enfileirar) nunca mandam a mesma mensagem duas vezes', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      const { WhatsappService } = await import('../src/whatsapp/whatsapp.service');
      const { TenantContext } = await import('../src/common/tenant-context');
      await sql().mensagemLog.create({
        data: { estabelecimentoId: s.dono.estabelecimentoId, direcao: 'ENVIADA', tipo: 'BOT', status: 'NA_FILA', telefone: '5511977776666', texto: 'uma só vez', enviarApartirDe: new Date(Date.now() - 1000) },
      });
      const servico = env.app.get(WhatsappService);
      const ctx = env.app.get(TenantContext);
      await Promise.all(Array.from({ length: 8 }, () => ctx.executarComo(s.dono.estabelecimentoId, () => servico.despachar())));
      expect(fake.envios.filter((e) => e.texto === 'uma só vez')).toHaveLength(1);
    });

    it('a mesma confirmação nunca é enfileirada duas vezes', async () => {
      const s = await montarSalao(env);
      await ligar(s);
      await marcarPeloLink(s);
      await esperar(() => fake.envios.length >= 1);
      const { WhatsappService } = await import('../src/whatsapp/whatsapp.service');
      const { TenantContext } = await import('../src/common/tenant-context');
      const ag = await sql().agendamento.findFirstOrThrow({ where: { estabelecimentoId: s.dono.estabelecimentoId }, include: { cliente: true, servico: true, profissional: true } });
      await env.app.get(TenantContext).executarComo(s.dono.estabelecimentoId, () => env.app.get(WhatsappService).enviarConfirmacao(ag));
      await new Promise((r) => setTimeout(r, 100));
      expect(fake.envios).toHaveLength(1);
    });
  });

  describe('notificações do painel', () => {
    it('novo agendamento pelo link e cancelamento do cliente aparecem para o dono; marcar como lida', async () => {
      const s = await montarSalao(env);
      const ag = await marcarPeloLink(s, '09:00', undefined, 'Joana Painel');
      await env.http().post(`/api/meu-agendamento/${ag.token}/cancelar`).expect(200);
      await esperar(async () => (await env.http().get('/api/notificacoes').set(s.h)).body.itens?.length >= 2);
      const n = (await env.http().get('/api/notificacoes').set(s.h).expect(200)).body;
      expect(n.naoLidas).toBe(2);
      expect(n.itens.map((i: any) => i.tipo).sort()).toEqual(['cancelamento', 'novo_agendamento']);
      expect(n.itens.find((i: any) => i.tipo === 'novo_agendamento').titulo).toContain('Joana Painel');
      await env.http().post(`/api/notificacoes/${n.itens[0].id}/lida`).set(s.h).expect(204);
      expect((await env.http().get('/api/notificacoes').set(s.h).expect(200)).body.naoLidas).toBe(1);
      await env.http().post('/api/notificacoes/lidas').set(s.h).expect(204);
      expect((await env.http().get('/api/notificacoes').set(s.h).expect(200)).body.naoLidas).toBe(0);
    });

    it('notificação de outro salão é 404, e o painel de um nunca lista as do outro', async () => {
      const a = await montarSalao(env);
      const b = await montarSalao(env);
      await marcarPeloLink(a);
      await esperar(async () => (await env.http().get('/api/notificacoes').set(a.h)).body.itens?.length >= 1);
      const deA = (await env.http().get('/api/notificacoes').set(a.h).expect(200)).body.itens[0];
      expect((await env.http().get('/api/notificacoes').set(b.h).expect(200)).body.itens).toEqual([]);
      await env.http().post(`/api/notificacoes/${deA.id}/lida`).set(b.h).expect(404);
    });
  });
});
