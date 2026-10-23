import {
  Ambiente, auth, diaFuturo, instante, limparBanco, montarSalao, novoProfissional, SalaoPronto, subirApp, whatsappUnico,
} from './helpers';

describe('página pública: disponibilidade e marcação', () => {
  let env: Ambiente;
  let s: SalaoPronto;
  let segunda: string;

  const publico = (rota = '') => env.http().get(`/api/publico/${s.slug}${rota}`);
  const reservar = (inicio: string, extra: object = {}) =>
    env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
      profissionalId: s.profId, servicoId: s.servicoId, inicio, nome: 'Maria Cliente', whatsapp: whatsappUnico(), consentimento: true, ...extra,
    });
  const horarios = async (data = segunda) =>
    (await publico(`/horarios?profissionalId=${s.profId}&servicoId=${s.servicoId}&data=${data}`).expect(200)).body as { inicio: string; hora: string }[];

  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
    s = await montarSalao(env);
    segunda = diaFuturo(s.fuso, 3, 1);
  });
  afterAll(() => env.fechar());

  it('mostra o salão com profissionais e serviços (nome, duração, preço do profissional)', async () => {
    const r = (await publico().expect(200)).body;
    expect(r).toMatchObject({ slug: s.slug, fusoHorario: 'America/Sao_Paulo', horizonteDias: 60 });
    expect(r.profissionais).toEqual([
      { id: s.profId, nome: 'Prof Um', servicos: [{ servicoId: s.servicoId, nome: 'Corte', duracaoMin: 30, precoCentavos: 5000 }] },
    ]);
  });

  it('slug inexistente e slug inválido respondem igual (404 genérico)', async () => {
    const a = await env.http().get('/api/publico/nao-existe-mesmo').expect(404);
    const b = await env.http().get('/api/publico/ABC%20DEF').expect(404);
    expect(a.body.message).toBe(b.body.message);
  });

  it('não lista profissional inativo, nem serviço inativo', async () => {
    const h = auth(s.dono.token);
    const outro = await novoProfissional(env, h, 'Inativo', [{ servicoId: s.servicoId, precoCentavos: 1000 }]);
    expect((await publico().expect(200)).body.profissionais).toHaveLength(2);
    await env.http().patch(`/api/profissionais/${outro}`).set(h).send({ ativo: false }).expect(200);
    expect((await publico().expect(200)).body.profissionais.map((p: any) => p.id)).toEqual([s.profId]);
    await env.http().get(`/api/publico/${s.slug}/horarios?profissionalId=${outro}&servicoId=${s.servicoId}&data=${segunda}`).expect(404);
  });

  it('horários do dia: grade de 30 min das 09:00 às 17:30, no fuso do salão', async () => {
    const lista = await horarios();
    expect(lista).toHaveLength(18);
    expect(lista[0]).toEqual({ inicio: instante(s.fuso, segunda, '09:00'), hora: '09:00' });
    expect(lista.at(-1)!.hora).toBe('17:30');
  });

  it('dias: devolve hoje + 60 dias com a marca de livre', async () => {
    const dias = (await publico(`/dias?profissionalId=${s.profId}&servicoId=${s.servicoId}`).expect(200)).body as { data: string; livre: boolean }[];
    expect(dias).toHaveLength(61);
    expect(dias.find((d) => d.data === segunda)?.livre).toBe(true);
  });

  it('marca o horário: guarda preço e duração, devolve o link único e tira o horário da lista', async () => {
    const inicio = instante(s.fuso, segunda, '10:00');
    const r = (await reservar(inicio).expect(201)).body;
    expect(r).toMatchObject({
      inicio, status: 'AGENDADO', precoCentavos: 5000, duracaoMin: 30, clienteNome: 'Maria Cliente', podeAlterar: true,
      salao: { slug: s.slug }, profissional: { id: s.profId }, servico: { nome: 'Corte' },
    });
    expect(r.token).toHaveLength(43);
    expect(r).not.toHaveProperty('cliente'); // o cliente não vê o WhatsApp de volta nem dados internos
    expect((await horarios()).map((x) => x.hora)).not.toContain('10:00');

    const no = await env.prisma.semTenant.agendamento.findUniqueOrThrow({ where: { token: r.token } });
    expect(no).toMatchObject({ origem: 'LINK', confirmacao: 'PENDENTE', status: 'AGENDADO' });
    expect(no.consentimentoEm).toBeInstanceOf(Date);
  });

  it('o mesmo horário não pode ser marcado duas vezes', async () => {
    const r = await reservar(instante(s.fuso, segunda, '10:00')).expect(409);
    expect(r.body.message).toMatch(/não está mais disponível/);
  });

  it('serviço longo ocupa a duração inteira e bloqueia os horários que sobrepõem', async () => {
    const h = auth(s.dono.token);
    const longo = (await env.http().post('/api/servicos').set(h).send({ nome: 'Coloração', duracaoMin: 90 }).expect(201)).body;
    await env.http().put(`/api/profissionais/${s.profId}/servicos`).set(h).send({
      servicos: [{ servicoId: s.servicoId, precoCentavos: 5000 }, { servicoId: longo.id, precoCentavos: 20000 }],
    }).expect(200);
    const r = await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
      profissionalId: s.profId, servicoId: longo.id, inicio: instante(s.fuso, segunda, '13:00'), nome: 'Ana Lima', whatsapp: whatsappUnico(), consentimento: true,
    }).expect(201);
    expect(r.body).toMatchObject({ duracaoMin: 90, precoCentavos: 20000 });
    const horas = (await horarios()).map((x) => x.hora);
    // 13:00-14:30 está ocupado: 12:30 (30 min, termina 13:00) ainda cabe; 13:00, 13:30 e 14:00 não; 14:30 cabe.
    expect(horas).toEqual(expect.arrayContaining(['12:30', '14:30']));
    expect(horas).not.toEqual(expect.arrayContaining(['13:00']));
    expect(horas).not.toContain('13:30');
    expect(horas).not.toContain('14:00');
  });

  it('recusa horário fora da grade, fora do expediente, no passado e além do horizonte', async () => {
    for (const hhmm of ['10:15', '08:30', '18:00']) {
      await reservar(instante(s.fuso, segunda, hhmm)).expect(409);
    }
    await reservar(instante(s.fuso, diaFuturo(s.fuso, -10, 1), '10:00')).expect(409); // passado
    await reservar(instante(s.fuso, diaFuturo(s.fuso, 62, 1), '10:00')).expect(409); // > 60 dias
  });

  it('valida entrada: WhatsApp inválido, consentimento ausente, nome curto, campos a mais', async () => {
    const inicio = instante(s.fuso, segunda, '11:00');
    expect((await reservar(inicio, { whatsapp: '999999999' }).expect(400)).body.message).toMatch(/WhatsApp/);
    await reservar(inicio, { whatsapp: '123' }).expect(400);
    await reservar(inicio, { whatsapp: '(11) 3333-4444' }).expect(400); // fixo não recebe WhatsApp
    await reservar(inicio, { consentimento: false }).expect(400);
    await reservar(inicio, { nome: 'A' }).expect(400);
    await reservar(inicio, { preco: 1 }).expect(400); // preço nunca vem do cliente
    await reservar('amanha cedo').expect(400);
  });

  it('serviço que o profissional não faz: 404', async () => {
    const h = auth(s.dono.token);
    const outro = (await env.http().post('/api/servicos').set(h).send({ nome: 'Barba', duracaoMin: 30 }).expect(201)).body;
    await reservar(instante(s.fuso, segunda, '11:00'), { servicoId: outro.id }).expect(404);
  });

  it('preço alterado depois não muda o agendamento já gravado', async () => {
    const h = auth(s.dono.token);
    const r = (await reservar(instante(s.fuso, segunda, '15:00')).expect(201)).body;
    const servicos = (await env.http().get(`/api/profissionais/${s.profId}`).set(h).expect(200)).body.servicos
      .map((x: any) => ({ servicoId: x.servicoId, precoCentavos: x.servicoId === s.servicoId ? 9900 : x.precoCentavos }));
    await env.http().put(`/api/profissionais/${s.profId}/servicos`).set(h).send({ servicos }).expect(200);
    const depois = (await env.http().get(`/api/meu-agendamento/${r.token}`).expect(200)).body;
    expect(depois.precoCentavos).toBe(5000);
    const novo = (await reservar(instante(s.fuso, segunda, '15:30')).expect(201)).body;
    expect(novo.precoCentavos).toBe(9900);
  });

  it('o mesmo WhatsApp tem teto de 3 horários futuros por salão; o painel não tem teto', async () => {
    const whatsapp = whatsappUnico();
    const dia = diaFuturo(s.fuso, 4, 2);
    for (const hhmm of ['09:00', '09:30', '10:00']) await reservar(instante(s.fuso, dia, hhmm), { whatsapp }).expect(201);
    const r = await reservar(instante(s.fuso, dia, '10:30'), { whatsapp }).expect(409);
    expect(r.body.message).toMatch(/3 horários/);

    const manual = await env.http().post('/api/agenda/agendamentos').set(auth(s.dono.token)).send({
      profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, dia, '10:30'), nome: 'Maria Cliente', whatsapp,
    });
    expect(manual.status).toBe(201);
  });

  it('antecedência mínima do salão vale para o link, mas não para o painel', async () => {
    const outro = await montarSalao(env);
    const dia = diaFuturo(outro.fuso, 3, 3);
    await env.http().patch('/api/estabelecimento').set(outro.h).send({ antecedenciaMinMin: 30 * 1440 }).expect(200);
    const rota = `profissionalId=${outro.profId}&servicoId=${outro.servicoId}&data=${dia}`;
    expect((await env.http().get(`/api/publico/${outro.slug}/horarios?${rota}`).expect(200)).body).toEqual([]);
    expect((await env.http().get(`/api/agenda/horarios?${rota}`).set(outro.h).expect(200)).body.length).toBeGreaterThan(0);
  });
});

describe('concorrência', () => {
  let env: Ambiente;
  let s: SalaoPronto;
  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
    s = await montarSalao(env);
  });
  afterAll(() => env.fechar());

  it('10 marcações simultâneas no mesmo horário: só uma passa', async () => {
    const inicio = instante(s.fuso, diaFuturo(s.fuso, 3, 1), '10:00');
    const respostas = await Promise.all(
      Array.from({ length: 10 }, () =>
        env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
          profissionalId: s.profId, servicoId: s.servicoId, inicio, nome: 'Corrida Teste', whatsapp: whatsappUnico(), consentimento: true,
        }),
      ),
    );
    const codigos = respostas.map((r) => r.status).sort();
    expect(codigos.filter((c) => c === 201)).toHaveLength(1);
    expect(codigos.filter((c) => c === 409)).toHaveLength(9);
    const gravados = await env.prisma.semTenant.agendamento.count({ where: { profissionalId: s.profId, inicio: new Date(inicio) } });
    expect(gravados).toBe(1);
  });

  it('marcações sobrepostas parcialmente (60 min e 30 min) também não passam juntas', async () => {
    const h = auth(s.dono.token);
    const longo = (await env.http().post('/api/servicos').set(h).send({ nome: 'Escova', duracaoMin: 60 }).expect(201)).body;
    await env.http().put(`/api/profissionais/${s.profId}/servicos`).set(h).send({
      servicos: [{ servicoId: s.servicoId, precoCentavos: 5000 }, { servicoId: longo.id, precoCentavos: 8000 }],
    }).expect(200);
    const dia = diaFuturo(s.fuso, 3, 2);
    const pedido = (servicoId: string, hhmm: string) =>
      env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
        profissionalId: s.profId, servicoId, inicio: instante(s.fuso, dia, hhmm), nome: 'Sobrepõe Teste', whatsapp: whatsappUnico(), consentimento: true,
      });
    const rs = await Promise.all([pedido(longo.id, '10:00'), pedido(s.servicoId, '10:30'), pedido(s.servicoId, '10:00'), pedido(longo.id, '10:30')]);
    expect(rs.filter((r) => r.status === 201).length).toBeGreaterThanOrEqual(1);
    const ativos = await env.prisma.semTenant.agendamento.findMany({ where: { profissionalId: s.profId, inicio: { gte: new Date(instante(s.fuso, dia, '09:00')) }, status: 'AGENDADO' }, orderBy: { inicio: 'asc' } });
    for (let i = 1; i < ativos.length; i++) expect(ativos[i].inicio.getTime()).toBeGreaterThanOrEqual(ativos[i - 1].fim.getTime());
  });

  it('profissionais diferentes no mesmo horário não conflitam', async () => {
    const h = auth(s.dono.token);
    const outro = await novoProfissional(env, h, 'Prof Dois', [{ servicoId: s.servicoId, precoCentavos: 5000 }]);
    const inicio = instante(s.fuso, diaFuturo(s.fuso, 3, 3), '10:00');
    const rs = await Promise.all([s.profId, outro].map((profissionalId) =>
      env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
        profissionalId, servicoId: s.servicoId, inicio, nome: 'Dois Profs', whatsapp: whatsappUnico(), consentimento: true,
      }),
    ));
    expect(rs.map((r) => r.status)).toEqual([201, 201]);
  });
});

describe('fusos horários', () => {
  let env: Ambiente;
  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
  });
  afterAll(() => env.fechar());

  it.each([
    ['America/Sao_Paulo', 3],
    ['America/Manaus', 4],
    ['America/Noronha', 2],
    ['America/Rio_Branco', 5],
  ])('salão em %s: 09:00 local é %i h atrás do UTC, e o mesmo instante vira outro horário em outro salão', async (fuso, deslocamento) => {
    const s = await montarSalao(env, { fuso });
    const dia = diaFuturo(fuso, 3, 1);
    const lista = (await env.http().get(`/api/publico/${s.slug}/horarios?profissionalId=${s.profId}&servicoId=${s.servicoId}&data=${dia}`).expect(200)).body;
    expect(lista[0].hora).toBe('09:00');
    expect(new Date(lista[0].inicio).getUTCHours()).toBe(9 + deslocamento);
    expect((await env.http().get(`/api/publico/${s.slug}`).expect(200)).body.fusoHorario).toBe(fuso);
  });

  it('o dia da agenda é o do salão: 23:30 em Manaus cai na data de Manaus, não na do UTC', async () => {
    const fuso = 'America/Manaus';
    const s = await montarSalao(env, { fuso, inicioMin: 0, fimMin: 1440 });
    const dia = diaFuturo(fuso, 3, 1);
    const r = (await env.http().post('/api/agenda/agendamentos').set(s.h).send({
      profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(fuso, dia, '23:30'), nome: 'Noite Teste', whatsapp: whatsappUnico(),
    }).expect(201)).body;
    expect(r.inicio.slice(0, 10)).not.toBe(dia); // em UTC já é o dia seguinte
    const doDia = (await env.http().get(`/api/agenda?de=${dia}&ate=${dia}`).set(s.h).expect(200)).body.agendamentos;
    expect(doDia.map((a: any) => a.id)).toEqual([r.id]);
  });
});
