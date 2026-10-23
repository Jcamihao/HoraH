import { Ambiente, auth, cadastrarDono, limparBanco, subirApp, unico } from './helpers';

const SEG_A_SEX = [1, 2, 3, 4, 5].flatMap((d) => [
  { diaSemana: d, inicioMin: 540, fimMin: 720 },
  { diaSemana: d, inicioMin: 780, fimMin: 1080 },
]);

describe('passo a passo do dono (fase 1)', () => {
  let env: Ambiente;
  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
  });
  afterAll(() => env.fechar());

  it('fluxo completo: horário -> profissionais -> serviços -> preços -> concluir', async () => {
    const dono = await cadastrarDono(env);
    const h = auth(dono.token);

    let est = (await env.http().get('/api/estabelecimento').set(h).expect(200)).body;
    expect(est.onboardingConcluido).toBe(false);
    expect(est.assinatura.status).toBe('TESTE');

    // Concluir antes da hora diz o que falta.
    const cedo = await env.http().post('/api/estabelecimento/onboarding/concluir').set(h).expect(400);
    expect(cedo.body.message).toMatch(/horário de funcionamento/);

    // 2) horário de funcionamento (com almoço)
    const horarios = await env.http().put('/api/estabelecimento/horarios').set(h).send({ faixas: SEG_A_SEX }).expect(200);
    expect(horarios.body).toHaveLength(10);

    // 3) profissionais: o horário do salão vem pré-preenchido
    const ana = (await env.http().post('/api/profissionais').set(h).send({ nome: 'Ana' }).expect(201)).body;
    expect(ana.horarios).toHaveLength(10);
    expect(ana.ativo).toBe(true);
    expect(ana.temUsuario).toBe(false);

    // 4) serviços
    const corte = (await env.http().post('/api/servicos').set(h).send({ nome: 'Corte', duracaoMin: 45 }).expect(201)).body;
    const barba = (await env.http().post('/api/servicos').set(h).send({ nome: 'Barba', duracaoMin: 30 }).expect(201)).body;

    // concluir ainda falta vincular serviços ao profissional
    const semVinculo = await env.http().post('/api/estabelecimento/onboarding/concluir').set(h).expect(400);
    expect(semVinculo.body.message).toMatch(/serviços \(com preço\)/);

    // 5) preços por profissional
    const comPreco = await env.http().put(`/api/profissionais/${ana.id}/servicos`).set(h).send({
      servicos: [{ servicoId: corte.id, precoCentavos: 4500 }, { servicoId: barba.id, precoCentavos: 3000 }],
    }).expect(200);
    expect(comPreco.body.servicos).toHaveLength(2);

    est = (await env.http().post('/api/estabelecimento/onboarding/concluir').set(h).expect(200)).body;
    expect(est.onboardingConcluido).toBe(true);
    // Concluir de novo não muda nada nem falha.
    await env.http().post('/api/estabelecimento/onboarding/concluir').set(h).expect(200);
  });

  describe('profissionais', () => {
    it('o dono pode se cadastrar como profissional, uma única vez', async () => {
      const dono = await cadastrarDono(env);
      const h = auth(dono.token);
      const eu = (await env.http().post('/api/profissionais').set(h).send({ nome: 'Dona', vincularAoDono: true }).expect(201)).body;
      expect(eu.temUsuario).toBe(true);
      const me = (await env.http().get('/api/auth/me').set(h).expect(200)).body;
      expect(me.profissionalId).toBe(eu.id);
      await env.http().post('/api/profissionais').set(h).send({ nome: 'Dona 2', vincularAoDono: true }).expect(409);
    });

    it('substitui horários de trabalho e valida faixas inválidas', async () => {
      const dono = await cadastrarDono(env);
      const h = auth(dono.token);
      const p = (await env.http().post('/api/profissionais').set(h).send({ nome: 'Bia' }).expect(201)).body;
      expect(p.horarios).toHaveLength(0); // salão ainda sem horário

      const ok = await env.http().put(`/api/profissionais/${p.id}/horarios`).set(h).send({
        faixas: [{ diaSemana: 6, inicioMin: 480, fimMin: 780 }],
      }).expect(200);
      expect(ok.body.horarios).toEqual([{ diaSemana: 6, inicioMin: 480, fimMin: 780 }]);

      for (const faixas of [
        [{ diaSemana: 1, inicioMin: 600, fimMin: 600 }],
        [{ diaSemana: 1, inicioMin: 600, fimMin: 1500 }],
        [{ diaSemana: 9, inicioMin: 600, fimMin: 700 }],
        [{ diaSemana: 1, inicioMin: 600, fimMin: 800 }, { diaSemana: 1, inicioMin: 700, fimMin: 900 }],
      ]) {
        await env.http().put(`/api/profissionais/${p.id}/horarios`).set(h).send({ faixas }).expect(400);
      }
      // O inválido não destruiu o que já estava salvo.
      const depois = (await env.http().get(`/api/profissionais/${p.id}`).set(h).expect(200)).body;
      expect(depois.horarios).toHaveLength(1);
    });

    it('preços: rejeita serviço repetido, inexistente, inativo e preço negativo', async () => {
      const dono = await cadastrarDono(env);
      const h = auth(dono.token);
      const p = (await env.http().post('/api/profissionais').set(h).send({ nome: 'Caio' }).expect(201)).body;
      const s = (await env.http().post('/api/servicos').set(h).send({ nome: 'Unha', duracaoMin: 60 }).expect(201)).body;
      const inativo = (await env.http().post('/api/servicos').set(h).send({ nome: 'Velho', duracaoMin: 60 }).expect(201)).body;
      await env.http().patch(`/api/servicos/${inativo.id}`).set(h).send({ ativo: false }).expect(200);

      const put = (servicos: unknown[]) => env.http().put(`/api/profissionais/${p.id}/servicos`).set(h).send({ servicos });
      await put([{ servicoId: s.id, precoCentavos: 100 }, { servicoId: s.id, precoCentavos: 200 }]).expect(400);
      await put([{ servicoId: '00000000-0000-4000-8000-000000000000', precoCentavos: 100 }]).expect(400);
      await put([{ servicoId: inativo.id, precoCentavos: 100 }]).expect(400);
      await put([{ servicoId: s.id, precoCentavos: -1 }]).expect(400);
      await put([{ servicoId: s.id, precoCentavos: 12.5 }]).expect(400);
      await put([{ servicoId: s.id, precoCentavos: 5000 }]).expect(200);
    });

    it('preço pode variar por profissional para o mesmo serviço', async () => {
      const dono = await cadastrarDono(env);
      const h = auth(dono.token);
      const a = (await env.http().post('/api/profissionais').set(h).send({ nome: 'Profissional A' }).expect(201)).body;
      const b = (await env.http().post('/api/profissionais').set(h).send({ nome: 'Profissional B' }).expect(201)).body;
      const s = (await env.http().post('/api/servicos').set(h).send({ nome: 'Corte', duracaoMin: 30 }).expect(201)).body;
      await env.http().put(`/api/profissionais/${a.id}/servicos`).set(h).send({ servicos: [{ servicoId: s.id, precoCentavos: 4000 }] }).expect(200);
      await env.http().put(`/api/profissionais/${b.id}/servicos`).set(h).send({ servicos: [{ servicoId: s.id, precoCentavos: 6500 }] }).expect(200);
      const lista = (await env.http().get('/api/profissionais').set(h).expect(200)).body;
      const preco = (nome: string) => lista.find((p: any) => p.nome === nome).servicos[0].precoCentavos;
      expect(preco('Profissional A')).toBe(4000);
      expect(preco('Profissional B')).toBe(6500);
    });

    it('desativar não apaga: o profissional some da lista de ativos mas segue no cadastro', async () => {
      const dono = await cadastrarDono(env);
      const h = auth(dono.token);
      const p = (await env.http().post('/api/profissionais').set(h).send({ nome: 'Dani' }).expect(201)).body;
      const off = (await env.http().patch(`/api/profissionais/${p.id}`).set(h).send({ ativo: false }).expect(200)).body;
      expect(off.ativo).toBe(false);
      const lista = (await env.http().get('/api/profissionais').set(h).expect(200)).body;
      expect(lista.find((x: any) => x.id === p.id).ativo).toBe(false);
    });
  });

  describe('serviços', () => {
    it('valida duração e nome; lista só ativos por padrão', async () => {
      const dono = await cadastrarDono(env);
      const h = auth(dono.token);
      await env.http().post('/api/servicos').set(h).send({ nome: 'X', duracaoMin: 30 }).expect(400);
      await env.http().post('/api/servicos').set(h).send({ nome: 'Corte', duracaoMin: 4 }).expect(400);
      await env.http().post('/api/servicos').set(h).send({ nome: 'Corte', duracaoMin: 601 }).expect(400);
      await env.http().post('/api/servicos').set(h).send({ nome: 'Corte', duracaoMin: 30.5 }).expect(400);
      const s = (await env.http().post('/api/servicos').set(h).send({ nome: '  Corte  ', duracaoMin: 30 }).expect(201)).body;
      expect(s.nome).toBe('Corte');
      await env.http().patch(`/api/servicos/${s.id}`).set(h).send({ ativo: false }).expect(200);
      expect((await env.http().get('/api/servicos').set(h).expect(200)).body).toHaveLength(0);
      expect((await env.http().get('/api/servicos?incluirInativos=true').set(h).expect(200)).body).toHaveLength(1);
    });
  });

  describe('configurações do salão', () => {
    it('altera nome, fuso, antecedência e prazo; slug novo respeita unicidade e reservados', async () => {
      const dono = await cadastrarDono(env);
      const outro = await cadastrarDono(env);
      const h = auth(dono.token);

      const ok = await env.http().patch('/api/estabelecimento').set(h).send({
        nome: 'Novo Nome', fusoHorario: 'America/Manaus', antecedenciaMinMin: 30, prazoCancelamentoMin: 240,
      }).expect(200);
      expect(ok.body).toMatchObject({ nome: 'Novo Nome', fusoHorario: 'America/Manaus', antecedenciaMinMin: 30, prazoCancelamentoMin: 240 });

      await env.http().patch('/api/estabelecimento').set(h).send({ fusoHorario: 'Marte/Olympus' }).expect(400);
      await env.http().patch('/api/estabelecimento').set(h).send({ slug: 'login' }).expect(400);
      await env.http().patch('/api/estabelecimento').set(h).send({ slug: outro.slug }).expect(409);
      const novoSlug = unico('novo');
      expect((await env.http().patch('/api/estabelecimento').set(h).send({ slug: novoSlug }).expect(200)).body.slug).toBe(novoSlug);
      await env.http().patch('/api/estabelecimento').set(h).send({ id: 'x' }).expect(400);
    });
  });
});
