import { Ambiente, auth, cadastrarDono, limparBanco, Sessao, subirApp } from './helpers';
import { TenantContext } from '../src/common/tenant-context';

/** Critério de aceite: um salão NUNCA vê dados de outro. */
describe('isolamento entre salões (multi-tenant)', () => {
  let env: Ambiente;
  let A: Sessao;
  let B: Sessao;
  let profA: any, profB: any, servA: any, servB: any;

  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
    A = await cadastrarDono(env, { nomeEstabelecimento: 'Salão A' });
    B = await cadastrarDono(env, { nomeEstabelecimento: 'Salão B' });
    const montar = async (S: Sessao, rotulo: string) => {
      const h = auth(S.token);
      await env.http().put('/api/estabelecimento/horarios').set(h).send({ faixas: [{ diaSemana: 1, inicioMin: 540, fimMin: 1080 }] }).expect(200);
      const prof = (await env.http().post('/api/profissionais').set(h).send({ nome: `Prof ${rotulo}` }).expect(201)).body;
      const serv = (await env.http().post('/api/servicos').set(h).send({ nome: `Serviço ${rotulo}`, duracaoMin: 30 }).expect(201)).body;
      await env.http().put(`/api/profissionais/${prof.id}/servicos`).set(h).send({ servicos: [{ servicoId: serv.id, precoCentavos: 1000 }] }).expect(200);
      return { prof, serv };
    };
    ({ prof: profA, serv: servA } = await montar(A, 'A'));
    ({ prof: profB, serv: servB } = await montar(B, 'B'));
  });
  afterAll(() => env.fechar());

  it('listagens trazem só os dados do próprio salão', async () => {
    const profs = (await env.http().get('/api/profissionais').set(auth(A.token)).expect(200)).body;
    expect(profs.map((p: any) => p.id)).toEqual([profA.id]);
    const servs = (await env.http().get('/api/servicos?incluirInativos=true').set(auth(A.token)).expect(200)).body;
    expect(servs.map((s: any) => s.id)).toEqual([servA.id]);
    const est = (await env.http().get('/api/estabelecimento').set(auth(A.token)).expect(200)).body;
    expect(est.id).toBe(A.estabelecimentoId);
  });

  it('acessar recurso de outro salão pelo id dá 404 (não 403: não confirma que existe)', async () => {
    const h = auth(A.token);
    await env.http().get(`/api/profissionais/${profB.id}`).set(h).expect(404);
    await env.http().patch(`/api/profissionais/${profB.id}`).set(h).send({ nome: 'Invadido' }).expect(404);
    await env.http().put(`/api/profissionais/${profB.id}/horarios`).set(h).send({ faixas: [] }).expect(404);
    await env.http().put(`/api/profissionais/${profB.id}/servicos`).set(h).send({ servicos: [] }).expect(404);
    await env.http().post(`/api/profissionais/${profB.id}/convite`).set(h).expect(404);
    await env.http().patch(`/api/servicos/${servB.id}`).set(h).send({ nome: 'Invadido' }).expect(404);

    // e o dado de B continua intacto
    const b = (await env.http().get(`/api/profissionais/${profB.id}`).set(auth(B.token)).expect(200)).body;
    expect(b.nome).toBe('Prof B');
    expect(b.servicos).toHaveLength(1);
  });

  it('vincular serviço de outro salão ao meu profissional é recusado', async () => {
    await env.http().put(`/api/profissionais/${profA.id}/servicos`).set(auth(A.token))
      .send({ servicos: [{ servicoId: servB.id, precoCentavos: 1 }] }).expect(400);
    const a = (await env.http().get(`/api/profissionais/${profA.id}`).set(auth(A.token)).expect(200)).body;
    expect(a.servicos).toEqual([expect.objectContaining({ servicoId: servA.id, nome: 'Serviço A', precoCentavos: 1000 })]); // não destruiu o vínculo existente
  });

  it('substituir horários de A não mexe nos de B', async () => {
    await env.http().put('/api/estabelecimento/horarios').set(auth(A.token)).send({ faixas: [] }).expect(200);
    const b = (await env.http().get('/api/estabelecimento/horarios').set(auth(B.token)).expect(200)).body;
    expect(b).toHaveLength(1);
    const profBHorarios = (await env.http().get(`/api/profissionais/${profB.id}`).set(auth(B.token)).expect(200)).body.horarios;
    expect(profBHorarios).toHaveLength(1);
  });

  it('o banco recusa ligar entidades de salões diferentes (chave estrangeira composta)', async () => {
    const sql = env.prisma.semTenant;
    // ProfissionalServico: profissional de A + serviço de B
    await expect(
      sql.profissionalServico.create({
        data: { profissionalId: profA.id, servicoId: servB.id, estabelecimentoId: A.estabelecimentoId, precoCentavos: 1 },
      }),
    ).rejects.toThrow(/Foreign key constraint/);
    // HorarioTrabalho: profissional de B gravado com o tenant A
    await expect(
      sql.horarioTrabalho.create({
        data: { profissionalId: profB.id, estabelecimentoId: A.estabelecimentoId, diaSemana: 1, inicioMin: 600, fimMin: 700 },
      }),
    ).rejects.toThrow(/Foreign key constraint/);
    // Convite apontando profissional de outro salão
    await expect(
      sql.convite.create({
        data: { profissionalId: profB.id, estabelecimentoId: A.estabelecimentoId, tokenHash: 'x'.repeat(64), expiraEm: new Date() },
      }),
    ).rejects.toThrow(/Foreign key constraint/);
    // Profissional de A ligado a usuário (dono) de B
    await expect(
      sql.profissional.update({ where: { id: profA.id }, data: { usuarioId: B.usuarioId } }),
    ).rejects.toThrow();
  });

  describe('cliente Prisma escopado', () => {
    const tenant = () => env.app.get(TenantContext);

    it('sem tenant no contexto, a consulta falha em vez de vazar tudo', async () => {
      await expect(env.prisma.db.servico.findMany()).rejects.toThrow(/sem tenant/);
      await expect(env.prisma.db.profissional.count()).rejects.toThrow(/sem tenant/);
    });

    it('com o tenant de A só enxerga A, em qualquer operação de leitura', async () => {
      await tenant().executarComo(A.estabelecimentoId, async () => {
        expect(await env.prisma.db.profissional.findMany()).toHaveLength(1);
        expect(await env.prisma.db.servico.count()).toBe(1);
        expect(await env.prisma.db.servico.findUnique({ where: { id: servB.id } })).toBeNull();
        expect(await env.prisma.db.servico.findFirst({ where: { id: servB.id } })).toBeNull();
        expect(await env.prisma.db.usuario.findMany()).toHaveLength(1);
        expect(await env.prisma.db.profissionalServico.findMany()).toHaveLength(1);
      });
    });

    it('updateMany/deleteMany com o tenant de A não atingem B', async () => {
      await tenant().executarComo(A.estabelecimentoId, async () => {
        const r = await env.prisma.db.servico.updateMany({ data: { nome: 'Renomeado em massa' } });
        expect(r.count).toBe(1);
      });
      const b = await env.prisma.semTenant.servico.findUniqueOrThrow({ where: { id: servB.id } });
      expect(b.nome).toBe('Serviço B');
    });

    it('dentro de $transaction a extensão continua valendo', async () => {
      await tenant().executarComo(A.estabelecimentoId, async () => {
        await env.prisma.db.$transaction(async (tx) => {
          expect(await tx.servico.count()).toBe(1);
          await tx.servico.deleteMany({});
        });
      });
      expect(await env.prisma.semTenant.servico.count({ where: { estabelecimentoId: B.estabelecimentoId } })).toBe(1);
      expect(await env.prisma.semTenant.servico.count({ where: { estabelecimentoId: A.estabelecimentoId } })).toBe(0);
    });

    it('create ignora/recusa tentativa de gravar em outro tenant', async () => {
      await tenant().executarComo(A.estabelecimentoId, async () => {
        await expect(
          env.prisma.db.servico.create({ data: { nome: 'X', duracaoMin: 30, estabelecimentoId: B.estabelecimentoId } }),
        ).rejects.toThrow(/outro tenant/);
        const ok = await env.prisma.db.servico.create({ data: { nome: 'Do A', duracaoMin: 30 } as any });
        expect(ok.estabelecimentoId).toBe(A.estabelecimentoId);
      });
    });

    it('contextos concorrentes de tenants diferentes não se misturam', async () => {
      const ler = (id: string) =>
        tenant().executarComo(id, async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 20));
          return (await env.prisma.db.servico.findMany()).map((s) => s.estabelecimentoId);
        });
      const resultados = await Promise.all(
        Array.from({ length: 30 }, (_, i) => ler(i % 2 ? A.estabelecimentoId : B.estabelecimentoId)),
      );
      resultados.forEach((ids, i) => {
        const esperado = i % 2 ? A.estabelecimentoId : B.estabelecimentoId;
        expect(ids.every((x) => x === esperado)).toBe(true);
      });
    });
  });

  it('requisições simultâneas de salões diferentes recebem cada uma o seu dado', async () => {
    const pedidos = Array.from({ length: 20 }, (_, i) => {
      const S = i % 2 ? A : B;
      return env.http().get('/api/estabelecimento').set(auth(S.token)).then((r) => [S.estabelecimentoId, r.body.id]);
    });
    for (const [esperado, recebido] of await Promise.all(pedidos)) expect(recebido).toBe(esperado);
  });
});
