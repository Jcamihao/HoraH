import { Ambiente, auth, cadastrarDono, cookieRefresh, limparBanco, SENHA, subirApp, unico } from './helpers';

describe('autenticação', () => {
  let env: Ambiente;
  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
  });
  afterAll(() => env.fechar());

  const corpo = (extra: Record<string, unknown> = {}) => ({
    nome: 'Maria',
    email: `${unico('m')}@exemplo.com`,
    senha: SENHA,
    nomeEstabelecimento: 'Studio Maria',
    slug: unico('studio'),
    ...extra,
  });

  describe('cadastro do dono', () => {
    it('cria salão, dono e teste grátis de 7 dias, e já devolve sessão', async () => {
      const dados = corpo({ email: '  Maria@Exemplo.COM ' });
      const res = await env.http().post('/api/auth/cadastro').send(dados).expect(201);

      expect(res.body.usuario).toMatchObject({ nome: 'Maria', email: 'maria@exemplo.com', papel: 'DONO', profissionalId: null });
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.headers['cache-control']).toBe('no-store');

      const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(/^hh_refresh=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\/api\/auth/);

      const est = await env.prisma.semTenant.estabelecimento.findUniqueOrThrow({
        where: { slug: dados.slug },
        include: { assinatura: true },
      });
      expect(est.fusoHorario).toBe('America/Sao_Paulo');
      expect(est.antecedenciaMinMin).toBe(60);
      expect(est.prazoCancelamentoMin).toBe(120);
      expect(est.assinatura?.status).toBe('TESTE');
      const dias = (est.assinatura!.testeFimEm!.getTime() - Date.now()) / 86_400_000;
      expect(dias).toBeGreaterThan(6.9);
      expect(dias).toBeLessThanOrEqual(7);
    });

    it('guarda a senha com hash argon2, nunca em texto', async () => {
      const dados = corpo();
      await env.http().post('/api/auth/cadastro').send(dados).expect(201);
      const u = await env.prisma.semTenant.usuario.findUniqueOrThrow({ where: { email: dados.email } });
      expect(u.senhaHash).toMatch(/^\$argon2id\$/);
      expect(u.senhaHash).not.toContain(SENHA);
    });

    it('recusa e-mail repetido e slug repetido com 409', async () => {
      const a = corpo();
      await env.http().post('/api/auth/cadastro').send(a).expect(201);
      await env.http().post('/api/auth/cadastro').send(corpo({ email: a.email })).expect(409);
      await env.http().post('/api/auth/cadastro').send(corpo({ slug: a.slug })).expect(409);
    });

    it('recusa slug reservado, malformado e senha curta com 400', async () => {
      await env.http().post('/api/auth/cadastro').send(corpo({ slug: 'admin' })).expect(400);
      await env.http().post('/api/auth/cadastro').send(corpo({ slug: 'Com Espaço' })).expect(400);
      await env.http().post('/api/auth/cadastro').send(corpo({ slug: 'ab' })).expect(400);
      await env.http().post('/api/auth/cadastro').send(corpo({ senha: '1234567' })).expect(400);
      await env.http().post('/api/auth/cadastro').send(corpo({ email: 'nao-e-email' })).expect(400);
    });

    it('rejeita campos extras (não aceita o cliente escolher papel ou estabelecimento)', async () => {
      await env.http().post('/api/auth/cadastro').send(corpo({ papel: 'DONO', estabelecimentoId: 'x' })).expect(400);
    });
  });

  describe('login', () => {
    it('entra com e-mail (sem diferenciar maiúsculas) e senha corretos', async () => {
      const dono = await cadastrarDono(env);
      const res = await env.http().post('/api/auth/login').send({ email: dono.email.toUpperCase(), senha: SENHA }).expect(200);
      expect(res.body.usuario.id).toBe(dono.usuarioId);
    });

    it('responde igual para senha errada e para e-mail inexistente (sem enumeração)', async () => {
      const dono = await cadastrarDono(env);
      const errada = await env.http().post('/api/auth/login').send({ email: dono.email, senha: 'errada-errada' }).expect(401);
      const inexistente = await env.http().post('/api/auth/login').send({ email: 'ninguem@exemplo.com', senha: 'errada-errada' }).expect(401);
      expect(errada.body).toEqual(inexistente.body);
    });

    it('usuário desativado não entra', async () => {
      const dono = await cadastrarDono(env);
      await env.prisma.semTenant.usuario.update({ where: { id: dono.usuarioId }, data: { ativo: false } });
      await env.http().post('/api/auth/login').send({ email: dono.email, senha: SENHA }).expect(401);
    });
  });

  describe('sessão', () => {
    it('/me exige token e devolve o usuário', async () => {
      const dono = await cadastrarDono(env);
      await env.http().get('/api/auth/me').expect(401);
      await env.http().get('/api/auth/me').set('Authorization', 'Bearer lixo').expect(401);
      const res = await env.http().get('/api/auth/me').set(auth(dono.token)).expect(200);
      expect(res.body).toMatchObject({ id: dono.usuarioId, papel: 'DONO', estabelecimentoId: dono.estabelecimentoId });
    });

    it('token assinado com outro segredo é recusado', async () => {
      const dono = await cadastrarDono(env);
      const { JwtService } = await import('@nestjs/jwt');
      const falso = await new JwtService({ secret: 'outro-segredo-com-mais-de-trinta-e-dois-caracteres' }).signAsync({ sub: dono.usuarioId });
      await env.http().get('/api/auth/me').set(auth(falso)).expect(401);
    });

    it('token de usuário desativado deixa de valer na hora', async () => {
      const dono = await cadastrarDono(env);
      await env.http().get('/api/auth/me').set(auth(dono.token)).expect(200);
      await env.prisma.semTenant.usuario.update({ where: { id: dono.usuarioId }, data: { ativo: false } });
      await env.http().get('/api/auth/me').set(auth(dono.token)).expect(401);
    });

    it('refresh troca o cookie (rotação) e o antigo deixa de servir', async () => {
      const dono = await cadastrarDono(env);
      const r1 = await env.http().post('/api/auth/refresh').set('Cookie', dono.cookie).expect(200);
      const novo = cookieRefresh(r1);
      expect(novo).not.toBe(dono.cookie);
      expect(r1.body.usuario.id).toBe(dono.usuarioId);
      await env.http().post('/api/auth/refresh').set('Cookie', novo).expect(200);
      await env.http().post('/api/auth/refresh').set('Cookie', dono.cookie).expect(401);
    });

    it('refresh sem cookie ou com cookie inventado dá 401', async () => {
      await env.http().post('/api/auth/refresh').expect(401);
      await env.http().post('/api/auth/refresh').set('Cookie', 'hh_refresh=inventado').expect(401);
    });

    it('reuso tardio de um refresh token antigo derruba a sessão inteira (roubo)', async () => {
      const dono = await cadastrarDono(env);
      const r1 = await env.http().post('/api/auth/refresh').set('Cookie', dono.cookie).expect(200);
      const atual = cookieRefresh(r1);

      // Simula que o token antigo foi revogado há 1 minuto (fora da janela de tolerância de 10 s).
      await env.prisma.semTenant.refreshToken.updateMany({
        where: { revogadoEm: { not: null }, usuarioId: dono.usuarioId },
        data: { revogadoEm: new Date(Date.now() - 60_000) },
      });
      await env.http().post('/api/auth/refresh').set('Cookie', dono.cookie).expect(401);
      await env.http().post('/api/auth/refresh').set('Cookie', atual).expect(401); // a família caiu
    });

    it('reuso imediato (duas abas) falha sem derrubar a sessão atual', async () => {
      const dono = await cadastrarDono(env);
      const r1 = await env.http().post('/api/auth/refresh').set('Cookie', dono.cookie).expect(200);
      await env.http().post('/api/auth/refresh').set('Cookie', dono.cookie).expect(401);
      await env.http().post('/api/auth/refresh').set('Cookie', cookieRefresh(r1)).expect(200);
    });

    it('duas renovações simultâneas com o mesmo cookie: só uma vence', async () => {
      const dono = await cadastrarDono(env);
      const [a, b] = await Promise.all([
        env.http().post('/api/auth/refresh').set('Cookie', dono.cookie),
        env.http().post('/api/auth/refresh').set('Cookie', dono.cookie),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 401]);
    });

    it('logout revoga o refresh e limpa o cookie', async () => {
      const dono = await cadastrarDono(env);
      const res = await env.http().post('/api/auth/logout').set('Cookie', dono.cookie).expect(204);
      expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/hh_refresh=;/);
      await env.http().post('/api/auth/refresh').set('Cookie', dono.cookie).expect(401);
    });

    it('guarda só o hash do refresh token no banco', async () => {
      const dono = await cadastrarDono(env);
      const valor = dono.cookie.split('=')[1];
      const todos = await env.prisma.semTenant.refreshToken.findMany({ where: { usuarioId: dono.usuarioId } });
      expect(todos).toHaveLength(1);
      expect(todos[0].tokenHash).not.toBe(valor);
      expect(todos[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('verificação de slug', () => {
    it('informa disponível, em uso, reservado e inválido', async () => {
      const dono = await cadastrarDono(env);
      const livre = unico('livre');
      expect((await env.http().get(`/api/auth/slug-disponivel?slug=${livre}`).expect(200)).body).toEqual({ disponivel: true });
      expect((await env.http().get(`/api/auth/slug-disponivel?slug=${dono.slug}`).expect(200)).body).toEqual({ disponivel: false, motivo: 'em_uso' });
      expect((await env.http().get('/api/auth/slug-disponivel?slug=admin').expect(200)).body).toMatchObject({ disponivel: false, motivo: 'reservado' });
      expect((await env.http().get('/api/auth/slug-disponivel?slug=A_B').expect(200)).body).toMatchObject({ disponivel: false });
      await env.http().get('/api/auth/slug-disponivel').expect(400);
    });
  });
});
