import { Ambiente, auth, cadastrarDono, limparBanco, SENHA, subirApp, unico } from './helpers';

describe('papéis e permissões', () => {
  let env: Ambiente;
  let dono: Awaited<ReturnType<typeof cadastrarDono>>;
  let profToken: string;
  let profId: string;
  let outroProfId: string;

  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
    dono = await cadastrarDono(env);
    const h = auth(dono.token);
    const p = (await env.http().post('/api/profissionais').set(h).send({ nome: 'Prof Um' }).expect(201)).body;
    outroProfId = (await env.http().post('/api/profissionais').set(h).send({ nome: 'Prof Dois' }).expect(201)).body.id;
    profId = p.id;
    const s = (await env.http().post('/api/servicos').set(h).send({ nome: 'Corte', duracaoMin: 30 }).expect(201)).body;
    await env.http().put(`/api/profissionais/${p.id}/servicos`).set(h).send({ servicos: [{ servicoId: s.id, precoCentavos: 5000 }] }).expect(200);
    const token = (await env.http().post(`/api/profissionais/${p.id}/convite`).set(h).expect(201)).body.link.split('/convite/')[1];
    const sessao = (await env.http().post(`/api/auth/convite/${token}/aceitar`).send({ email: `${unico('p')}@exemplo.com`, senha: SENHA }).expect(201)).body;
    profToken = sessao.accessToken;
  });
  afterAll(() => env.fechar());

  it('sem token, toda rota protegida dá 401', async () => {
    for (const rota of ['/api/estabelecimento', '/api/estabelecimento/horarios', '/api/profissionais', '/api/profissionais/eu', '/api/servicos', '/api/auth/me']) {
      await env.http().get(rota).expect(401);
    }
  });

  it('profissional acessa o que é dele: /auth/me, /profissionais/eu e o nome do salão', async () => {
    await env.http().get('/api/auth/me').set(auth(profToken)).expect(200);
    const eu = (await env.http().get('/api/profissionais/eu').set(auth(profToken)).expect(200)).body;
    expect(eu.id).toBe(profId);
    expect(eu.servicos).toEqual([expect.objectContaining({ precoCentavos: 5000, ativo: true })]);
    await env.http().get('/api/estabelecimento').set(auth(profToken)).expect(200);
  });

  it('profissional NÃO vê assinatura (assunto do dono)', async () => {
    const comoProf = (await env.http().get('/api/estabelecimento').set(auth(profToken)).expect(200)).body;
    expect(comoProf.assinatura).toBeNull();
    const comoDono = (await env.http().get('/api/estabelecimento').set(auth(dono.token)).expect(200)).body;
    expect(comoDono.assinatura).not.toBeNull();
  });

  it('profissional NÃO acessa agenda/cadastro de outro profissional, nem configuração, serviços, horários, convites', async () => {
    const p = auth(profToken);
    const proibidos: [string, string, object?][] = [
      ['get', '/api/profissionais'],
      ['get', `/api/profissionais/${outroProfId}`],
      ['get', `/api/profissionais/${profId}`], // nem o próprio pelo caminho do dono: ele usa /eu
      ['post', '/api/profissionais', { nome: 'Intruso' }],
      ['patch', `/api/profissionais/${profId}`, { nome: 'Novo nome' }],
      ['put', `/api/profissionais/${profId}/horarios`, { faixas: [] }],
      ['put', `/api/profissionais/${profId}/servicos`, { servicos: [] }],
      ['post', `/api/profissionais/${outroProfId}/convite`],
      ['get', '/api/servicos'],
      ['post', '/api/servicos', { nome: 'Hack', duracaoMin: 30 }],
      ['patch', '/api/estabelecimento', { nome: 'Hackeado' }],
      ['get', '/api/estabelecimento/horarios'],
      ['put', '/api/estabelecimento/horarios', { faixas: [] }],
      ['post', '/api/estabelecimento/onboarding/concluir'],
    ];
    for (const [metodo, rota, corpo] of proibidos) {
      const req = (env.http() as any)[metodo](rota).set(p);
      const res = await (corpo ? req.send(corpo) : req);
      expect({ rota, status: res.status }).toEqual({ rota, status: 403 });
    }
  });

  it('o dono continua com acesso total', async () => {
    const h = auth(dono.token);
    for (const rota of ['/api/profissionais', '/api/servicos', '/api/estabelecimento/horarios']) {
      await env.http().get(rota).set(h).expect(200);
    }
    await env.http().get('/api/profissionais/eu').set(h).expect(403); // rota exclusiva de profissional
  });

  it('dono sem cadastro de profissional não tem /profissionais/eu mesmo se tentar (403)', async () => {
    const outro = await cadastrarDono(env);
    await env.http().get('/api/profissionais/eu').set(auth(outro.token)).expect(403);
  });

  it('o profissional não consegue se promover: papel vem do banco, não do corpo/token', async () => {
    await env.http().post('/api/auth/cadastro').send({}).expect(400);
    // token do profissional continua sendo de profissional
    const me = (await env.http().get('/api/auth/me').set(auth(profToken)).expect(200)).body;
    expect(me.papel).toBe('PROFISSIONAL');
  });
});
