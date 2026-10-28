import { Ambiente, auth, cadastrarDono, diaFuturo, enviarWebhookWa, instante, limparBanco, montarSalao, subirApp, whatsappUnico } from './helpers';

/** Sem WAAKG_URL o WhatsApp fica desligado e o resto do sistema segue normal. */
describe('WhatsApp não configurado neste ambiente', () => {
  let env: Ambiente;
  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
  });
  afterAll(() => env.fechar());

  it('a tela avisa que não está configurado e conectar responde com mensagem clara', async () => {
    const dono = await cadastrarDono(env);
    const d = (await env.http().get('/api/whatsapp').set(auth(dono.token)).expect(200)).body;
    expect(d).toMatchObject({ configurado: false, status: 'DESCONECTADA' });
    const r = await env.http().post('/api/whatsapp/conectar').set(auth(dono.token));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(r.body)).toMatch(/WhatsApp/);
  });

  it('agendar funciona normalmente, sem confirmação por WhatsApp', async () => {
    const s = await montarSalao(env);
    await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
      profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, diaFuturo(s.fuso, 4, 1), '10:00'), nome: 'Sem Whats', whatsapp: whatsappUnico(), consentimento: true,
    }).expect(201);
  });

  it('webhook do WhatsApp nunca é aceito sem segredo configurado', async () => {
    const r = await enviarWebhookWa(env, 'message.received', '00000000-0000-4000-8000-000000000000', {});
    expect(r.status).toBe(401);
  });
});
