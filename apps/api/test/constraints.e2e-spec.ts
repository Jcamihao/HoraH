import { Ambiente, auth, cadastrarDono, limparBanco, montarSalao, novoProfissional, SalaoPronto, subirApp } from './helpers';

/** Regras que valem no banco mesmo que a aplicação tenha um bug. */
describe('constraints do banco', () => {
  let env: Ambiente;
  let est: string;
  let prof: string;
  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
    const dono = await cadastrarDono(env);
    est = dono.estabelecimentoId;
    prof = (await env.http().post('/api/profissionais').set(auth(dono.token)).send({ nome: 'Prof' }).expect(201)).body.id;
  });
  afterAll(() => env.fechar());

  const sql = () => env.prisma.semTenant;

  it('slug fora do formato é recusado', async () => {
    for (const slug of ['AB', 'a b c', '-abc', 'abc-', 'a--bc', 'ab', 'x'.repeat(41), 'ábc']) {
      await expect(sql().estabelecimento.create({ data: { nome: 'x', slug } })).rejects.toThrow();
    }
  });

  it('e-mail só em minúsculo', async () => {
    await expect(
      sql().usuario.create({ data: { estabelecimentoId: est, email: 'Maiuscula@Exemplo.com', nome: 'x', senhaHash: 'x', papel: 'DONO' } }),
    ).rejects.toThrow();
  });

  it('faixas de horário inválidas são recusadas (fim <= início, fora do dia, dia inexistente)', async () => {
    const base = { estabelecimentoId: est, profissionalId: prof, diaSemana: 1, inicioMin: 600, fimMin: 700 };
    await expect(sql().horarioTrabalho.create({ data: { ...base, fimMin: 600 } })).rejects.toThrow();
    await expect(sql().horarioTrabalho.create({ data: { ...base, fimMin: 1441 } })).rejects.toThrow();
    await expect(sql().horarioTrabalho.create({ data: { ...base, inicioMin: -1 } })).rejects.toThrow();
    await expect(sql().horarioTrabalho.create({ data: { ...base, diaSemana: 7 } })).rejects.toThrow();
    await expect(sql().horarioFuncionamento.create({ data: { estabelecimentoId: est, diaSemana: 1, inicioMin: 700, fimMin: 600 } })).rejects.toThrow();
  });

  it('duração fora de 5..1440 e preço negativo são recusados', async () => {
    await expect(sql().servico.create({ data: { estabelecimentoId: est, nome: 'x', duracaoMin: 0 } })).rejects.toThrow();
    const s = await sql().servico.create({ data: { estabelecimentoId: est, nome: 'ok', duracaoMin: 30 } });
    await expect(
      sql().profissionalServico.create({ data: { estabelecimentoId: est, profissionalId: prof, servicoId: s.id, precoCentavos: -1 } }),
    ).rejects.toThrow();
  });

  it('um usuário só pode estar ligado a um profissional', async () => {
    const dono = await cadastrarDono(env);
    const h = auth(dono.token);
    await env.http().post('/api/profissionais').set(h).send({ nome: 'Eu', vincularAoDono: true }).expect(201);
    const outro = (await env.http().post('/api/profissionais').set(h).send({ nome: 'Outro' }).expect(201)).body;
    await expect(sql().profissional.update({ where: { id: outro.id }, data: { usuarioId: dono.usuarioId } })).rejects.toThrow();
  });

  describe('agenda (Fase 2)', () => {
    let a: SalaoPronto;
    let b: SalaoPronto;
    const base = new Date(Date.now() + 5 * 86_400_000);
    base.setUTCHours(13, 0, 0, 0);
    const em = (min: number) => new Date(base.getTime() + min * 60_000);

    const ag = (s: SalaoPronto, clienteId: string, inicioMin: number, duracaoMin: number, extra: object = {}) =>
      sql().agendamento.create({
        data: {
          estabelecimentoId: s.dono.estabelecimentoId, profissionalId: s.profId, servicoId: s.servicoId, clienteId,
          inicio: em(inicioMin), fim: em(inicioMin + duracaoMin), precoCentavos: 5000, duracaoMin,
          origem: 'MANUAL', token: `t${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`, ...extra,
        },
      });
    const cliente = (s: SalaoPronto, whatsapp: string) =>
      sql().cliente.create({ data: { estabelecimentoId: s.dono.estabelecimentoId, nome: 'Cliente', whatsapp } });

    beforeAll(async () => {
      a = await montarSalao(env);
      b = await montarSalao(env);
    });

    it('dois agendamentos sobrepostos do mesmo profissional: o banco recusa', async () => {
      const c = await cliente(a, '5511999000001');
      await ag(a, c.id, 0, 60);
      await expect(ag(a, c.id, 30, 60)).rejects.toThrow(/exclusion|agendamentos_sem_sobreposicao_excl/i);
      await expect(ag(a, c.id, 0, 60)).rejects.toThrow(/exclusion|agendamentos_sem_sobreposicao_excl/i);
      await expect(ag(a, c.id, 15, 15)).rejects.toThrow(/exclusion|agendamentos_sem_sobreposicao_excl/i); // dentro do outro
    });

    it('encostar é permitido: quem termina às 10:00 não conflita com quem começa às 10:00', async () => {
      const c = await cliente(a, '5511999000002');
      await ag(a, c.id, 600, 30);
      await ag(a, c.id, 630, 30); // começa quando o anterior termina
      await ag(a, c.id, 570, 30); // termina quando o primeiro começa
    });

    it('cancelado não ocupa horário; reabrir em cima de outro é recusado', async () => {
      const c = await cliente(a, '5511999000003');
      const cancelado = await ag(a, c.id, 1200, 30, { status: 'CANCELADO', canceladoEm: new Date(), canceladoPor: 'CLIENTE' });
      await ag(a, c.id, 1200, 30);
      await expect(sql().agendamento.update({
        where: { id: cancelado.id }, data: { status: 'AGENDADO', canceladoEm: null, canceladoPor: null },
      })).rejects.toThrow(/exclusion/i);
    });

    it('profissionais diferentes podem ter o mesmo horário', async () => {
      const outro = await novoProfissional(env, a.h, 'Outro', [{ servicoId: a.servicoId, precoCentavos: 1000 }]);
      const c = await cliente(a, '5511999000004');
      await ag(a, c.id, 2000, 30);
      await sql().agendamento.create({
        data: {
          estabelecimentoId: a.dono.estabelecimentoId, profissionalId: outro, servicoId: a.servicoId, clienteId: c.id,
          inicio: em(2000), fim: em(2030), precoCentavos: 1000, duracaoMin: 30, origem: 'MANUAL', token: `o${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
        },
      });
    });

    it('o banco recusa misturar salões: profissional, serviço ou cliente de outro tenant', async () => {
      const cA = await cliente(a, '5511999000005');
      const cB = await cliente(b, '5511999000006');
      const dados = { estabelecimentoId: a.dono.estabelecimentoId, profissionalId: a.profId, servicoId: a.servicoId, clienteId: cA.id, inicio: em(3000), fim: em(3030), precoCentavos: 1, duracaoMin: 30, origem: 'MANUAL' as const };
      const tk = () => `x${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      await expect(sql().agendamento.create({ data: { ...dados, profissionalId: b.profId, token: tk() } })).rejects.toThrow(/foreign key/i);
      await expect(sql().agendamento.create({ data: { ...dados, servicoId: b.servicoId, token: tk() } })).rejects.toThrow(/foreign key/i);
      await expect(sql().agendamento.create({ data: { ...dados, clienteId: cB.id, token: tk() } })).rejects.toThrow(/foreign key/i);
      await expect(sql().bloqueio.create({ data: { estabelecimentoId: a.dono.estabelecimentoId, profissionalId: b.profId, inicio: em(0), fim: em(60) } })).rejects.toThrow(/foreign key/i);
    });

    it('valores inválidos são recusados no banco', async () => {
      const c = await cliente(a, '5511999000007');
      await expect(ag(a, c.id, 4000, 0)).rejects.toThrow(); // fim = início
      await expect(sql().agendamento.create({
        data: { estabelecimentoId: a.dono.estabelecimentoId, profissionalId: a.profId, servicoId: a.servicoId, clienteId: c.id, inicio: em(5000), fim: em(4990), precoCentavos: 1, duracaoMin: 30, origem: 'MANUAL', token: 'tfimantes1234567890123456789012345678901234' },
      })).rejects.toThrow();
      await expect(ag(a, c.id, 6000, 30, { precoCentavos: -1 })).rejects.toThrow();
      await expect(ag(a, c.id, 6000, 30, { duracaoMin: 2 })).rejects.toThrow();
      await expect(ag(a, c.id, 7000, 30, { status: 'CANCELADO' })).rejects.toThrow(); // cancelado sem quem/quando
      await expect(ag(a, c.id, 7000, 30, { canceladoEm: new Date(), canceladoPor: 'CLIENTE' })).rejects.toThrow(); // datado como cancelado mas agendado
      await expect(sql().bloqueio.create({ data: { estabelecimentoId: a.dono.estabelecimentoId, profissionalId: a.profId, inicio: em(60), fim: em(60) } })).rejects.toThrow();
    });

    it('WhatsApp só na forma canônica, único por salão (e repetível em outro salão)', async () => {
      for (const ruim of ['11999998888', '+5511999998888', '551133334444', '5511 99999-8888', '5501999998888']) {
        await expect(cliente(a, ruim)).rejects.toThrow();
      }
      await cliente(a, '5511988880000');
      await expect(cliente(a, '5511988880000')).rejects.toThrow(/unique/i);
      await cliente(b, '5511988880000');
    });

    it('o token do link é único', async () => {
      const c = await cliente(a, '5511999000008');
      await ag(a, c.id, 8000, 30, { token: 'repetidorepetidorepetidorepetidorepetidoXX' });
      await expect(ag(a, c.id, 8100, 30, { token: 'repetidorepetidorepetidorepetidorepetidoXX' })).rejects.toThrow(/unique/i);
    });

    it('não dá para apagar profissional, serviço ou cliente que têm agendamento (histórico preservado)', async () => {
      const c = await cliente(a, '5511999000009');
      await ag(a, c.id, 9000, 30);
      await expect(sql().cliente.delete({ where: { id: c.id } })).rejects.toThrow();
      await expect(sql().profissional.delete({ where: { id: a.profId } })).rejects.toThrow();
      await expect(sql().servico.delete({ where: { id: a.servicoId } })).rejects.toThrow();
    });
  });
});
