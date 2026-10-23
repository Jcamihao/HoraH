import { Ambiente, auth, cadastrarDono, limparBanco, subirApp } from './helpers';

// Arquivo próprio: o ConfigModule valida o ambiente uma única vez por arquivo de teste.
describe('assinatura sem Asaas configurado', () => {
  let env: Ambiente;
  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
  });
  afterAll(() => env.fechar());

  it('o resto do sistema funciona e a tela avisa que a cobrança não está configurada', async () => {
    const dono = await cadastrarDono(env);
    const d = (await env.http().get('/api/assinatura').set(auth(dono.token)).expect(200)).body;
    expect(d).toMatchObject({ status: 'TESTE', acesso: 'LIBERADO', cobrancaConfigurada: false });
    const r = await env.http().post('/api/assinatura/assinar').set(auth(dono.token)).send({ cpfCnpj: '529.982.247-25' }).expect(400);
    expect(r.body.message).toMatch(/não está configurada/);
  });

  it('webhook sem segredo configurado nunca é aceito', async () => {
    const r = await env.http().post('/api/webhooks/asaas').set('asaas-access-token', 'qualquer').send({ id: 'evt_1', event: 'PAYMENT_RECEIVED' });
    expect([401]).toContain(r.status);
  });
});
