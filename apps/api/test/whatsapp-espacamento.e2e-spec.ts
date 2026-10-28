import { WaAkgFake } from './waakg-fake';
import { Ambiente, diaFuturo, enviarWebhookWa, envWhatsapp, instante, limparBanco, montarSalao, subirApp, whatsappUnico } from './helpers';

async function esperar(condicao: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const fim = Date.now() + ms;
  while (!(await condicao()) && Date.now() < fim) await new Promise((r) => setTimeout(r, 25));
}

/** Arquivo próprio: o espaçamento é lido do ambiente uma vez por arquivo de teste. */
describe('WhatsApp: espaçamento entre envios (anti-bloqueio)', () => {
  let env: Ambiente;
  let fake: WaAkgFake;

  beforeAll(async () => {
    fake = await new WaAkgFake().iniciar();
    env = await subirApp(envWhatsapp(fake.url, { WHATSAPP_ESPACAMENTO_MS: '60000' }));
    await limparBanco(env.prisma);
  });
  afterAll(async () => {
    await env.fechar();
    await fake.parar();
  });

  it('mensagens do mesmo salão não saem coladas: a 1ª sai na hora, a 2ª espera o intervalo', async () => {
    const s = await montarSalao(env);
    await env.http().post('/api/whatsapp/conectar').set(s.h).expect(200);
    fake.conectar(s.dono.estabelecimentoId);
    await enviarWebhookWa(env, 'connection.update', s.dono.estabelecimentoId, { status: 'CONNECTED' }).expect(200);

    const dia = diaFuturo(s.fuso, 4, 1);
    for (const hhmm of ['09:00', '09:30', '10:00']) {
      await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
        profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, dia, hhmm), nome: 'Espaçado Teste', whatsapp: whatsappUnico(), consentimento: true,
      }).expect(201);
    }
    await esperar(() => fake.envios.length >= 1);
    await new Promise((r) => setTimeout(r, 200));
    expect(fake.envios).toHaveLength(1); // só a primeira
    expect((await env.http().get('/api/whatsapp').set(s.h).expect(200)).body.naFila).toBe(2);

    const { RotinasService } = await import('../src/rotinas/rotinas.service');
    const rotinas = env.app.get(RotinasService);
    await rotinas.processarWhatsapp(new Date(Date.now() + 20_000)); // 20 s depois: ainda cedo (o intervalo mínimo é ~36 s)
    expect(fake.envios).toHaveLength(1);
    await rotinas.processarWhatsapp(new Date(Date.now() + 90_000)); // depois do intervalo: sai a 2ª, mas não a 3ª junto
    expect(fake.envios).toHaveLength(2);
    await rotinas.processarWhatsapp(new Date(Date.now() + 200_000));
    expect(fake.envios).toHaveLength(3);
  });

  it('o espaçamento é por salão: o intervalo de um não atrasa o outro', async () => {
    const [a, b] = [await montarSalao(env), await montarSalao(env)];
    for (const s of [a, b]) {
      await env.http().post('/api/whatsapp/conectar').set(s.h).expect(200);
      fake.conectar(s.dono.estabelecimentoId);
      await enviarWebhookWa(env, 'connection.update', s.dono.estabelecimentoId, { status: 'CONNECTED' }).expect(200);
    }
    fake.envios.length = 0;
    for (const s of [a, b]) {
      await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
        profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, diaFuturo(s.fuso, 4, 1), '11:00'), nome: 'Por Salão', whatsapp: whatsappUnico(), consentimento: true,
      }).expect(201);
    }
    await esperar(() => fake.envios.length >= 2);
    expect(new Set(fake.envios.map((e) => e.sessionId)).size).toBe(2);
  });
});
