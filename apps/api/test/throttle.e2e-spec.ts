import { Ambiente, cadastrarDono, limparBanco, SENHA, subirApp } from './helpers';

describe('limite de tentativas', () => {
  let env: Ambiente;
  beforeAll(async () => {
    env = await subirApp({ THROTTLE_ENABLED: 'true' });
    await limparBanco(env.prisma);
  });
  afterAll(() => env.fechar());

  it('login: depois de 5 tentativas no mesmo e-mail e IP, devolve 429', async () => {
    const dono = await cadastrarDono(env);
    const tentar = () => env.http().post('/api/auth/login').send({ email: dono.email, senha: 'errada-errada' });
    for (let i = 0; i < 5; i++) await tentar().expect(401);
    await tentar().expect(429);
    // a senha certa também é barrada enquanto durar a trava (não dá para "acertar no tiro")
    await env.http().post('/api/auth/login').send({ email: dono.email, senha: SENHA }).expect(429);
  });

  it('a trava é por e-mail: outro e-mail no mesmo IP não é afetado', async () => {
    const a = await cadastrarDono(env);
    const b = await cadastrarDono(env);
    for (let i = 0; i < 6; i++) await env.http().post('/api/auth/login').send({ email: a.email, senha: 'errada-errada' });
    await env.http().post('/api/auth/login').send({ email: b.email, senha: SENHA }).expect(200);
  });

  it('cadastro: no máximo 5 por hora por IP', async () => {
    // cadastrarDono já gastou parte da cota nos testes acima; ao fim, a próxima é barrada.
    let status = 201;
    for (let i = 0; i < 10 && status === 201; i++) {
      status = (await env.http().post('/api/auth/cadastro').send({
        nome: 'Maria', email: `lote${i}@exemplo.com`, senha: SENHA, nomeEstabelecimento: 'Studio', slug: `lote-${i}-${Date.now().toString(36)}`,
      })).status;
    }
    expect(status).toBe(429);
  });
});
