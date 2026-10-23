import { Ambiente, auth, cadastrarDono, limparBanco, SENHA, subirApp, unico } from './helpers';

describe('convite de profissional', () => {
  let env: Ambiente;
  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
  });
  afterAll(() => env.fechar());

  async function prepararProfissional() {
    const dono = await cadastrarDono(env, { nomeEstabelecimento: 'Studio Convite' });
    const p = (await env.http().post('/api/profissionais').set(auth(dono.token)).send({ nome: 'Lia' }).expect(201)).body;
    return { dono, p };
  }
  const tokenDoLink = (link: string) => link.split('/convite/')[1];

  it('fluxo: dono gera o link, profissional define a senha e entra com papel PROFISSIONAL', async () => {
    const { dono, p } = await prepararProfissional();
    const convite = (await env.http().post(`/api/profissionais/${p.id}/convite`).set(auth(dono.token)).expect(201)).body;
    expect(convite.link).toMatch(/\/convite\/.{40,}$/);
    const token = tokenDoLink(convite.link);

    const previa = (await env.http().get(`/api/auth/convite/${token}`).expect(200)).body;
    expect(previa).toEqual({ estabelecimento: 'Studio Convite', profissional: 'Lia' });

    const email = `${unico('lia')}@exemplo.com`;
    const res = await env.http().post(`/api/auth/convite/${token}/aceitar`).send({ email, senha: SENHA }).expect(201);
    expect(res.body.usuario).toMatchObject({ papel: 'PROFISSIONAL', profissionalId: p.id, estabelecimentoId: dono.estabelecimentoId, nome: 'Lia' });

    // login normal depois
    await env.http().post('/api/auth/login').send({ email, senha: SENHA }).expect(200);
    // dono vê que o profissional já tem acesso
    expect((await env.http().get(`/api/profissionais/${p.id}`).set(auth(dono.token)).expect(200)).body.temUsuario).toBe(true);
  });

  it('o token só é guardado como hash e o link não pode ser usado duas vezes', async () => {
    const { dono, p } = await prepararProfissional();
    const token = tokenDoLink((await env.http().post(`/api/profissionais/${p.id}/convite`).set(auth(dono.token)).expect(201)).body.link);
    const guardado = await env.prisma.semTenant.convite.findFirstOrThrow({ where: { profissionalId: p.id } });
    expect(guardado.tokenHash).not.toBe(token);
    expect(guardado.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    await env.http().post(`/api/auth/convite/${token}/aceitar`).send({ email: `${unico('a')}@exemplo.com`, senha: SENHA }).expect(201);
    await env.http().post(`/api/auth/convite/${token}/aceitar`).send({ email: `${unico('b')}@exemplo.com`, senha: SENHA }).expect(404);
    await env.http().get(`/api/auth/convite/${token}`).expect(404);
  });

  it('dois aceites simultâneos criam um único usuário', async () => {
    const { dono, p } = await prepararProfissional();
    const token = tokenDoLink((await env.http().post(`/api/profissionais/${p.id}/convite`).set(auth(dono.token)).expect(201)).body.link);
    const resultados = await Promise.all([
      env.http().post(`/api/auth/convite/${token}/aceitar`).send({ email: `${unico('c')}@exemplo.com`, senha: SENHA }),
      env.http().post(`/api/auth/convite/${token}/aceitar`).send({ email: `${unico('d')}@exemplo.com`, senha: SENHA }),
    ]);
    expect(resultados.map((r) => r.status).sort()).toEqual([201, 404]);
    const usuarios = await env.prisma.semTenant.usuario.count({ where: { estabelecimentoId: dono.estabelecimentoId, papel: 'PROFISSIONAL' } });
    expect(usuarios).toBe(1);
  });

  it('novo convite invalida o anterior', async () => {
    const { dono, p } = await prepararProfissional();
    const velho = tokenDoLink((await env.http().post(`/api/profissionais/${p.id}/convite`).set(auth(dono.token)).expect(201)).body.link);
    const novo = tokenDoLink((await env.http().post(`/api/profissionais/${p.id}/convite`).set(auth(dono.token)).expect(201)).body.link);
    await env.http().get(`/api/auth/convite/${velho}`).expect(404);
    await env.http().get(`/api/auth/convite/${novo}`).expect(200);
  });

  it('convite vencido, inexistente ou de profissional desativado dá 404', async () => {
    const { dono, p } = await prepararProfissional();
    const token = tokenDoLink((await env.http().post(`/api/profissionais/${p.id}/convite`).set(auth(dono.token)).expect(201)).body.link);
    await env.http().get('/api/auth/convite/token-que-nao-existe').expect(404);

    await env.prisma.semTenant.convite.updateMany({ where: { profissionalId: p.id }, data: { expiraEm: new Date(Date.now() - 1000) } });
    await env.http().get(`/api/auth/convite/${token}`).expect(404);

    await env.prisma.semTenant.convite.updateMany({ where: { profissionalId: p.id }, data: { expiraEm: new Date(Date.now() + 60_000) } });
    await env.http().get(`/api/auth/convite/${token}`).expect(200);
    await env.http().patch(`/api/profissionais/${p.id}`).set(auth(dono.token)).send({ ativo: false }).expect(200);
    await env.http().get(`/api/auth/convite/${token}`).expect(404);
    await env.http().post(`/api/profissionais/${p.id}/convite`).set(auth(dono.token)).expect(400);
  });

  it('e-mail já usado dá 409 e o convite continua válido', async () => {
    const { dono, p } = await prepararProfissional();
    const token = tokenDoLink((await env.http().post(`/api/profissionais/${p.id}/convite`).set(auth(dono.token)).expect(201)).body.link);
    await env.http().post(`/api/auth/convite/${token}/aceitar`).send({ email: dono.email, senha: SENHA }).expect(409);
    await env.http().get(`/api/auth/convite/${token}`).expect(200);
  });

  it('desativar o profissional bloqueia o acesso na hora; reativar devolve', async () => {
    const { dono, p } = await prepararProfissional();
    const token = tokenDoLink((await env.http().post(`/api/profissionais/${p.id}/convite`).set(auth(dono.token)).expect(201)).body.link);
    const email = `${unico('x')}@exemplo.com`;
    const sessao = (await env.http().post(`/api/auth/convite/${token}/aceitar`).send({ email, senha: SENHA }).expect(201)).body;
    await env.http().get('/api/profissionais/eu').set(auth(sessao.accessToken)).expect(200);

    await env.http().patch(`/api/profissionais/${p.id}`).set(auth(dono.token)).send({ ativo: false }).expect(200);
    await env.http().get('/api/profissionais/eu').set(auth(sessao.accessToken)).expect(401);
    await env.http().post('/api/auth/login').send({ email, senha: SENHA }).expect(401);

    await env.http().patch(`/api/profissionais/${p.id}`).set(auth(dono.token)).send({ ativo: true }).expect(200);
    await env.http().post('/api/auth/login').send({ email, senha: SENHA }).expect(200);
  });

  it('desativar o profissional que é o próprio dono não tranca o dono para fora', async () => {
    const dono = await cadastrarDono(env);
    const eu = (await env.http().post('/api/profissionais').set(auth(dono.token)).send({ nome: 'Eu', vincularAoDono: true }).expect(201)).body;
    await env.http().patch(`/api/profissionais/${eu.id}`).set(auth(dono.token)).send({ ativo: false }).expect(200);
    await env.http().get('/api/auth/me').set(auth(dono.token)).expect(200);
  });
});
