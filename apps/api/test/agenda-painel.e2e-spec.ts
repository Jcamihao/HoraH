import { randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import {
  Ambiente, agendamentoDireto, auth, diaFuturo, instante, limparBanco, logarProfissional, montarSalao, novoProfissional,
  SalaoPronto, subirApp, whatsappUnico,
} from './helpers';

describe('link único do cliente: ver, cancelar e remarcar', () => {
  let env: Ambiente;
  let s: SalaoPronto;
  let dia: string;
  const marcar = async (hhmm: string, dia_ = dia) =>
    (await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
      profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, dia_, hhmm), nome: 'Cliente Link', whatsapp: whatsappUnico(), consentimento: true,
    }).expect(201)).body as { token: string; inicio: string };
  const livres = async (data = dia) =>
    (await env.http().get(`/api/publico/${s.slug}/horarios?profissionalId=${s.profId}&servicoId=${s.servicoId}&data=${data}`).expect(200)).body.map((x: any) => x.hora) as string[];

  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
    s = await montarSalao(env);
    dia = diaFuturo(s.fuso, 4, 1);
  });
  afterAll(() => env.fechar());

  it('mostra o agendamento sem expor dados internos', async () => {
    const { token } = await marcar('09:00');
    const r = (await env.http().get(`/api/meu-agendamento/${token}`).expect(200)).body;
    expect(r).toMatchObject({ status: 'AGENDADO', podeAlterar: true, clienteNome: 'Cliente Link', servico: { nome: 'Corte' } });
    expect(Object.keys(r).sort()).toEqual([
      'clienteNome', 'duracaoMin', 'fim', 'inicio', 'limiteAlteracao', 'podeAlterar', 'precoCentavos', 'profissional', 'salao', 'servico', 'status',
    ]);
    // limite = início - prazo de cancelamento do salão (padrão 2 h)
    expect(new Date(r.inicio).getTime() - new Date(r.limiteAlteracao).getTime()).toBe(2 * 3_600_000);
  });

  it('token desconhecido, malformado ou de outro formato: sempre o mesmo 404', async () => {
    const aleatorio = randomBytes(32).toString('base64url');
    const respostas = await Promise.all(
      [aleatorio, 'curto', 'x'.repeat(43) + 'y', '../../etc/passwd', "' OR 1=1 --"].map((t) =>
        env.http().get(`/api/meu-agendamento/${encodeURIComponent(t)}`).expect(404),
      ),
    );
    expect(new Set(respostas.map((r) => r.body.message)).size).toBe(1);
    await env.http().post(`/api/meu-agendamento/${aleatorio}/cancelar`).expect(404);
    await env.http().post(`/api/meu-agendamento/${aleatorio}/remarcar`).send({ inicio: instante(s.fuso, dia, '10:00') }).expect(404);
  });

  it('a resposta do link não vai para cache compartilhado', async () => {
    const { token } = await marcar('09:30');
    const res = await env.http().get(`/api/meu-agendamento/${token}`).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('cancelar libera o horário; cancelar de novo é recusado', async () => {
    const { token } = await marcar('10:00');
    expect(await livres()).not.toContain('10:00');
    const r = (await env.http().post(`/api/meu-agendamento/${token}/cancelar`).expect(200)).body;
    expect(r).toMatchObject({ status: 'CANCELADO', podeAlterar: false });
    expect(await livres()).toContain('10:00');
    await env.http().post(`/api/meu-agendamento/${token}/cancelar`).expect(409);
    const no = await env.prisma.semTenant.agendamento.findUniqueOrThrow({ where: { token } });
    expect(no.canceladoPor).toBe('CLIENTE');
    expect(no.canceladoEm).toBeInstanceOf(Date);
    // o horário liberado pode ser marcado por outra pessoa
    await marcar('10:00');
  });

  it('remarcar muda só o horário (mesmo profissional e serviço), libera o antigo e volta a "pendente"', async () => {
    const { token, inicio } = await marcar('11:00');
    await env.prisma.semTenant.agendamento.update({ where: { token }, data: { confirmacao: 'CONFIRMADO' } });
    const novo = instante(s.fuso, dia, '14:00');
    const r = (await env.http().post(`/api/meu-agendamento/${token}/remarcar`).send({ inicio: novo }).expect(200)).body;
    expect(r).toMatchObject({ status: 'AGENDADO', inicio: novo, precoCentavos: 5000 });
    const lista = await livres();
    expect(lista).toContain('11:00');
    expect(lista).not.toContain('14:00');
    expect((await env.prisma.semTenant.agendamento.findUniqueOrThrow({ where: { token } })).confirmacao).toBe('PENDENTE');
    expect(inicio).not.toBe(novo);
  });

  it('remarcar para um horário ocupado ou inexistente é recusado e o agendamento original fica', async () => {
    const a = await marcar('15:00');
    const b = await marcar('15:30');
    await env.http().post(`/api/meu-agendamento/${a.token}/remarcar`).send({ inicio: b.inicio }).expect(409);
    await env.http().post(`/api/meu-agendamento/${a.token}/remarcar`).send({ inicio: instante(s.fuso, dia, '03:00') }).expect(409);
    const depois = (await env.http().get(`/api/meu-agendamento/${a.token}`).expect(200)).body;
    expect(depois.inicio).toBe(a.inicio);
  });

  it('remarcar para um horário que se sobrepõe ao próprio é permitido (o antigo não atrapalha)', async () => {
    const h = auth(s.dono.token);
    const longo = (await env.http().post('/api/servicos').set(h).send({ nome: 'Escova', duracaoMin: 60 }).expect(201)).body;
    await env.http().put(`/api/profissionais/${s.profId}/servicos`).set(h).send({
      servicos: [{ servicoId: s.servicoId, precoCentavos: 5000 }, { servicoId: longo.id, precoCentavos: 8000 }],
    }).expect(200);
    const outroDia = diaFuturo(s.fuso, 4, 2);
    const r = (await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
      profissionalId: s.profId, servicoId: longo.id, inicio: instante(s.fuso, outroDia, '10:00'), nome: 'Longa Teste', whatsapp: whatsappUnico(), consentimento: true,
    }).expect(201)).body;
    const novo = instante(s.fuso, outroDia, '10:30'); // 10:30-11:30 invade o próprio 10:00-11:00
    await env.http().post(`/api/meu-agendamento/${r.token}/remarcar`).send({ inicio: novo }).expect(200);
  });

  it('o link mostra só horários livres para remarcar e respeita a duração gravada', async () => {
    const { token } = await marcar('16:00');
    const dias = (await env.http().get(`/api/meu-agendamento/${token}/dias`).expect(200)).body;
    expect(dias).toHaveLength(61);
    const h = (await env.http().get(`/api/meu-agendamento/${token}/horarios?data=${dia}`).expect(200)).body.map((x: any) => x.hora);
    expect(h).toContain('16:00'); // o próprio horário aparece como livre para ele mesmo
    expect(h).not.toContain('09:00'); // ocupado por outro
  });

  describe('prazo de cancelamento', () => {
    it('fora do prazo: nem cancelar nem remarcar, com orientação para falar com o salão', async () => {
      const outro = await montarSalao(env);
      await env.http().patch('/api/estabelecimento').set(outro.h).send({ prazoCancelamentoMin: 30 * 1440 }).expect(200);
      const diaOutro = diaFuturo(outro.fuso, 4, 1);
      const r = (await env.http().post(`/api/publico/${outro.slug}/agendamentos`).send({
        profissionalId: outro.profId, servicoId: outro.servicoId, inicio: instante(outro.fuso, diaOutro, '10:00'),
        nome: 'Fora Do Prazo', whatsapp: whatsappUnico(), consentimento: true,
      }).expect(201)).body;
      expect(r.podeAlterar).toBe(false);
      const cancelar = await env.http().post(`/api/meu-agendamento/${r.token}/cancelar`).expect(409);
      expect(cancelar.body.message).toMatch(/Fale com o salão/);
      await env.http().post(`/api/meu-agendamento/${r.token}/remarcar`).send({ inicio: instante(outro.fuso, diaOutro, '11:00') }).expect(409);
      await env.http().get(`/api/meu-agendamento/${r.token}/dias`).expect(409);
      expect((await env.http().get(`/api/meu-agendamento/${r.token}`).expect(200)).body.status).toBe('AGENDADO');
    });

    it('o dono, pelo painel, cancela mesmo fora do prazo (o prazo é só do cliente)', async () => {
      const outro = await montarSalao(env);
      await env.http().patch('/api/estabelecimento').set(outro.h).send({ prazoCancelamentoMin: 30 * 1440 }).expect(200);
      const ag = (await env.http().post('/api/agenda/agendamentos').set(outro.h).send({
        profissionalId: outro.profId, servicoId: outro.servicoId, inicio: instante(outro.fuso, diaFuturo(outro.fuso, 4, 1), '10:00'), nome: 'Prazo Painel', whatsapp: whatsappUnico(),
      }).expect(201)).body;
      const r = (await env.http().patch(`/api/agenda/agendamentos/${ag.id}/status`).set(outro.h).send({ status: 'CANCELADO' }).expect(200)).body;
      expect(r.status).toBe('CANCELADO');
    });
  });
});

describe('painel: agendamento manual, situação, link e listagem', () => {
  let env: Ambiente;
  let s: SalaoPronto;
  let outroProf: string;
  let profToken: string;
  let dia: string;
  const manual = (token: string, parcial: object = {}) =>
    env.http().post('/api/agenda/agendamentos').set(auth(token)).send({
      profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, dia, '09:00'), nome: 'Cliente Balcão', whatsapp: whatsappUnico(), ...parcial,
    });

  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
    s = await montarSalao(env);
    outroProf = await novoProfissional(env, s.h, 'Prof Dois', [{ servicoId: s.servicoId, precoCentavos: 7000 }]);
    profToken = await logarProfissional(env, s.h, s.profId);
    dia = diaFuturo(s.fuso, 4, 3);
  });
  afterAll(() => env.fechar());

  it('dono marca para qualquer profissional; origem MANUAL, WhatsApp normalizado, sem consentimento do link', async () => {
    const r = (await manual(s.dono.token, { profissionalId: outroProf, whatsapp: '(11) 98888-7777', inicio: instante(s.fuso, dia, '10:00') }).expect(201)).body;
    expect(r).toMatchObject({
      origem: 'MANUAL', status: 'AGENDADO', confirmacao: 'PENDENTE', precoCentavos: 7000,
      profissional: { id: outroProf }, cliente: { nome: 'Cliente Balcão', whatsapp: '5511988887777' },
    });
    const no = await env.prisma.semTenant.agendamento.findUniqueOrThrow({ where: { id: r.id } });
    expect(no.consentimentoEm).toBeNull();
  });

  it('reaproveita o cliente do mesmo WhatsApp (mesmo cadastro, nome mais recente)', async () => {
    const whatsapp = '(11) 97777-6666';
    const a = (await manual(s.dono.token, { whatsapp, nome: 'Joana', inicio: instante(s.fuso, dia, '11:00') }).expect(201)).body;
    const b = (await manual(s.dono.token, { whatsapp, nome: 'Joana Silva', inicio: instante(s.fuso, dia, '11:30') }).expect(201)).body;
    expect(b.cliente.id).toBe(a.cliente.id);
    expect(b.cliente.nome).toBe('Joana Silva');
  });

  it('recusa horário ocupado, número inválido e profissional que não faz o serviço', async () => {
    await manual(s.dono.token, { inicio: instante(s.fuso, dia, '10:00'), profissionalId: outroProf }).expect(409);
    await manual(s.dono.token, { whatsapp: 'abc' }).expect(400);
    await manual(s.dono.token, { servicoId: '00000000-0000-4000-8000-000000000000' }).expect(404);
  });

  it('profissional marca só na própria agenda; na de outro é 403', async () => {
    await manual(profToken, { inicio: instante(s.fuso, dia, '14:00') }).expect(201);
    await manual(profToken, { profissionalId: outroProf, inicio: instante(s.fuso, dia, '14:00') }).expect(403);
  });

  it('listagem: dono vê todos e filtra; profissional vê só os dele e não consegue pedir os de outro', async () => {
    const todos = (await env.http().get(`/api/agenda?de=${dia}&ate=${dia}`).set(s.h).expect(200)).body.agendamentos;
    expect(new Set(todos.map((a: any) => a.profissional.id))).toEqual(new Set([s.profId, outroProf]));
    const filtrado = (await env.http().get(`/api/agenda?de=${dia}&ate=${dia}&profissionalId=${outroProf}`).set(s.h).expect(200)).body.agendamentos;
    expect(filtrado.every((a: any) => a.profissional.id === outroProf)).toBe(true);

    const meus = (await env.http().get(`/api/agenda?de=${dia}&ate=${dia}`).set(auth(profToken)).expect(200)).body.agendamentos;
    expect(meus.length).toBeGreaterThan(0);
    expect(meus.every((a: any) => a.profissional.id === s.profId)).toBe(true);
    await env.http().get(`/api/agenda?de=${dia}&ate=${dia}&profissionalId=${outroProf}`).set(auth(profToken)).expect(403);
  });

  it('listagem: valida datas e limita a janela', async () => {
    await env.http().get('/api/agenda?de=2026-13-01&ate=2026-13-02').set(s.h).expect(400);
    await env.http().get(`/api/agenda?de=${dia}&ate=2000-01-01`).set(s.h).expect(400);
    await env.http().get('/api/agenda?de=2026-01-01&ate=2026-12-31').set(s.h).expect(400);
    await env.http().get('/api/agenda').set(s.h).expect(400);
  });

  it('profissional não vê nem altera agendamento de outro (404, como se não existisse)', async () => {
    const dele = (await manual(s.dono.token, { profissionalId: outroProf, inicio: instante(s.fuso, dia, '16:00') }).expect(201)).body;
    await env.http().get(`/api/agenda/agendamentos/${dele.id}`).set(auth(profToken)).expect(404);
    expect((await env.http().get(`/api/agenda/agendamentos/${dele.id}`).set(s.h).expect(200)).body.id).toBe(dele.id);
    await env.http().patch(`/api/agenda/agendamentos/${dele.id}/status`).set(auth(profToken)).send({ status: 'CANCELADO' }).expect(404);
    await env.http().get(`/api/agenda/agendamentos/${dele.id}/link`).set(auth(profToken)).expect(404);
  });

  it('link do cliente: o painel reenvia o mesmo link que o cliente usa', async () => {
    const a = (await manual(s.dono.token, { inicio: instante(s.fuso, dia, '15:00') }).expect(201)).body;
    const { link } = (await env.http().get(`/api/agenda/agendamentos/${a.id}/link`).set(s.h).expect(200)).body;
    expect(link).toMatch(/\/agendamento\/[A-Za-z0-9_-]{43}$/);
    const token = link.split('/agendamento/')[1];
    expect((await env.http().get(`/api/meu-agendamento/${token}`).expect(200)).body.status).toBe('AGENDADO');
  });

  describe('situação do atendimento', () => {
    it('concluído/faltou só depois que o horário começou', async () => {
      const futuro = (await manual(s.dono.token, { inicio: instante(s.fuso, dia, '17:00') }).expect(201)).body;
      await env.http().patch(`/api/agenda/agendamentos/${futuro.id}/status`).set(s.h).send({ status: 'CONCLUIDO' }).expect(400);
      await env.http().patch(`/api/agenda/agendamentos/${futuro.id}/status`).set(s.h).send({ status: 'FALTOU' }).expect(400);
    });

    it('concluir, marcar falta, desfazer e cancelar um atendimento que já passou', async () => {
      const ag = await agendamentoDireto(env, s, new Date(Date.now() - 3 * 3_600_000));
      const muda = (status: string) => env.http().patch(`/api/agenda/agendamentos/${ag.id}/status`).set(s.h).send({ status });
      expect((await muda('CONCLUIDO').expect(200)).body.status).toBe('CONCLUIDO');
      expect((await muda('FALTOU').expect(200)).body.status).toBe('FALTOU');
      expect((await muda('AGENDADO').expect(200)).body.status).toBe('AGENDADO');
      const cancelado = (await muda('CANCELADO').expect(200)).body;
      expect(cancelado.status).toBe('CANCELADO');
      const no = await env.prisma.semTenant.agendamento.findUniqueOrThrow({ where: { id: ag.id } });
      expect(no.canceladoPor).toBe('PAINEL');
      await muda('CONCLUIDO').expect(409); // cancelado só pode ser reaberto, não concluído direto
      await muda('AGENDADO').expect(400); // o horário já passou: marcar de novo
    });

    it('cancelar libera o horário; reabrir falha se alguém já ocupou', async () => {
      const a = (await manual(s.dono.token, { inicio: instante(s.fuso, dia, '13:00') }).expect(201)).body;
      await env.http().patch(`/api/agenda/agendamentos/${a.id}/status`).set(s.h).send({ status: 'CANCELADO' }).expect(200);
      const b = (await manual(s.dono.token, { inicio: instante(s.fuso, dia, '13:00') }).expect(201)).body;
      const r = await env.http().patch(`/api/agenda/agendamentos/${a.id}/status`).set(s.h).send({ status: 'AGENDADO' }).expect(409);
      expect(r.body.message).toMatch(/ocupado/);
      await env.http().patch(`/api/agenda/agendamentos/${b.id}/status`).set(s.h).send({ status: 'CANCELADO' }).expect(200);
      const reaberto = (await env.http().patch(`/api/agenda/agendamentos/${a.id}/status`).set(s.h).send({ status: 'AGENDADO' }).expect(200)).body;
      expect(reaberto.status).toBe('AGENDADO');
      const no = await env.prisma.semTenant.agendamento.findUniqueOrThrow({ where: { id: a.id } });
      expect(no.canceladoEm).toBeNull();
      expect(no.canceladoPor).toBeNull();
    });

    it('status inválido é recusado', async () => {
      const a = (await manual(s.dono.token, { inicio: instante(s.fuso, dia, '17:30') }).expect(201)).body;
      await env.http().patch(`/api/agenda/agendamentos/${a.id}/status`).set(s.h).send({ status: 'APAGADO' }).expect(400);
    });
  });

  it('manual aceita quem acabou de chegar (dentro da antecedência mínima); o link recusa', async () => {
    // Salão aberto 24 h, para sempre haver um horário na grade nos próximos minutos.
    const aberto = await montarSalao(env, { inicioMin: 0, fimMin: 1440 });
    const proximo = DateTime.now().setZone(aberto.fuso).plus({ minutes: 1 });
    const grade = proximo.set({ second: 0, millisecond: 0 }).plus({ minutes: (30 - (proximo.minute % 30)) % 30 });
    const inicio = grade.toUTC().toISO()!;
    const corpo = { profissionalId: aberto.profId, servicoId: aberto.servicoId, inicio, nome: 'Acabou De Chegar', whatsapp: whatsappUnico() };

    await env.http().post(`/api/publico/${aberto.slug}/agendamentos`).send({ ...corpo, consentimento: true }).expect(409); // antecedência de 1 h
    await env.http().post('/api/agenda/agendamentos').set(aberto.h).send(corpo).expect(201);
  });
});

describe('folgas e bloqueios', () => {
  let env: Ambiente;
  let s: SalaoPronto;
  let outroProf: string;
  let profToken: string;
  let dia: string;
  const livres = async (profId = s.profId) =>
    (await env.http().get(`/api/publico/${s.slug}/horarios?profissionalId=${profId}&servicoId=${s.servicoId}&data=${dia}`).expect(200)).body.map((x: any) => x.hora) as string[];
  const bloquear = (token: string, parcial: object = {}) =>
    env.http().post('/api/bloqueios').set(auth(token)).send({
      profissionalId: s.profId, inicio: `${dia}T12:00`, fim: `${dia}T13:00`, motivo: 'Almoço extra', ...parcial,
    });

  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
    s = await montarSalao(env);
    outroProf = await novoProfissional(env, s.h, 'Prof Dois', [{ servicoId: s.servicoId, precoCentavos: 7000 }]);
    profToken = await logarProfissional(env, s.h, s.profId);
    dia = diaFuturo(s.fuso, 4, 4);
  });
  afterAll(() => env.fechar());

  it('bloqueio tira os horários do intervalo (só do profissional bloqueado) e remover devolve', async () => {
    expect(await livres()).toEqual(expect.arrayContaining(['12:00', '12:30']));
    const b = (await bloquear(s.dono.token).expect(201)).body;
    expect(b).toMatchObject({ profissionalId: s.profId, motivo: 'Almoço extra', agendamentosAfetados: 0 });
    const durante = await livres();
    expect(durante).not.toContain('12:00');
    expect(durante).not.toContain('12:30');
    expect(durante).toContain('11:30'); // termina às 12:00, encosta mas não invade
    expect(durante).toContain('13:00');
    expect(await livres(outroProf)).toContain('12:00');
    await env.http().delete(`/api/bloqueios/${b.id}`).set(s.h).expect(204);
    expect(await livres()).toContain('12:00');
  });

  it('dia inteiro e vários dias', async () => {
    const b = (await bloquear(s.dono.token, { inicio: `${dia}T00:00`, fim: `${dia}T23:59` }).expect(201)).body;
    expect(await livres()).toEqual([]);
    await env.http().delete(`/api/bloqueios/${b.id}`).set(s.h).expect(204);
  });

  it('avisa quantos agendamentos já marcados caem no bloqueio e não cancela nenhum', async () => {
    const ag = (await env.http().post('/api/agenda/agendamentos').set(s.h).send({
      profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, dia, '14:00'), nome: 'Já Marcada', whatsapp: whatsappUnico(),
    }).expect(201)).body;
    const b = (await bloquear(s.dono.token, { inicio: `${dia}T13:30`, fim: `${dia}T14:30` }).expect(201)).body;
    expect(b.agendamentosAfetados).toBe(1);
    expect((await env.prisma.semTenant.agendamento.findUniqueOrThrow({ where: { id: ag.id } })).status).toBe('AGENDADO');
    await env.http().delete(`/api/bloqueios/${b.id}`).set(s.h).expect(204);
  });

  it('valida: fim depois do início, formato de data, profissional existente', async () => {
    await bloquear(s.dono.token, { inicio: `${dia}T13:00`, fim: `${dia}T12:00` }).expect(400);
    await bloquear(s.dono.token, { inicio: `${dia}T13:00`, fim: `${dia}T13:00` }).expect(400);
    await bloquear(s.dono.token, { inicio: `${dia} 12:00` }).expect(400);
    await bloquear(s.dono.token, { inicio: '2026-02-30T12:00' }).expect(400);
    await bloquear(s.dono.token, { profissionalId: '00000000-0000-4000-8000-000000000000' }).expect(404);
  });

  it('profissional bloqueia só a própria agenda e só remove os próprios bloqueios', async () => {
    const meu = (await bloquear(profToken).expect(201)).body;
    await bloquear(profToken, { profissionalId: outroProf }).expect(403);
    const dele = (await bloquear(s.dono.token, { profissionalId: outroProf }).expect(201)).body;
    await env.http().delete(`/api/bloqueios/${dele.id}`).set(auth(profToken)).expect(404);
    const lista = (await env.http().get(`/api/bloqueios?de=${dia}&ate=${dia}`).set(auth(profToken)).expect(200)).body;
    expect(lista.map((x: any) => x.id)).toEqual([meu.id]);
    await env.http().get(`/api/bloqueios?de=${dia}&ate=${dia}&profissionalId=${outroProf}`).set(auth(profToken)).expect(403);
    const todos = (await env.http().get(`/api/bloqueios?de=${dia}&ate=${dia}`).set(s.h).expect(200)).body;
    expect(todos.map((x: any) => x.id).sort()).toEqual([meu.id, dele.id].sort());
    await env.http().delete(`/api/bloqueios/${meu.id}`).set(auth(profToken)).expect(204);
    await env.http().delete(`/api/bloqueios/${dele.id}`).set(s.h).expect(204);
  });

  it('o bloqueio aparece na agenda do painel junto com os agendamentos', async () => {
    const b = (await bloquear(s.dono.token).expect(201)).body;
    const agenda = (await env.http().get(`/api/agenda?de=${dia}&ate=${dia}`).set(s.h).expect(200)).body;
    expect(agenda.bloqueios.map((x: any) => x.id)).toContain(b.id);
    await env.http().delete(`/api/bloqueios/${b.id}`).set(s.h).expect(204);
  });
});

describe('isolamento entre salões na agenda', () => {
  let env: Ambiente;
  let a: SalaoPronto;
  let b: SalaoPronto;
  let agB: { id: string; token?: string };
  let tokenB: string;
  let dia: string;

  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
    a = await montarSalao(env);
    b = await montarSalao(env);
    dia = diaFuturo(a.fuso, 4, 1);
    agB = (await env.http().post('/api/agenda/agendamentos').set(b.h).send({
      profissionalId: b.profId, servicoId: b.servicoId, inicio: instante(b.fuso, dia, '10:00'), nome: 'Cliente de B', whatsapp: whatsappUnico(),
    }).expect(201)).body;
    const { link } = (await env.http().get(`/api/agenda/agendamentos/${agB.id}/link`).set(b.h).expect(200)).body;
    tokenB = link.split('/agendamento/')[1];
  });
  afterAll(() => env.fechar());

  it('A não lista, não vê o link, nem altera agendamento de B', async () => {
    const lista = (await env.http().get(`/api/agenda?de=${dia}&ate=${dia}`).set(a.h).expect(200)).body.agendamentos;
    expect(lista).toEqual([]);
    await env.http().get(`/api/agenda/agendamentos/${agB.id}/link`).set(a.h).expect(404);
    await env.http().patch(`/api/agenda/agendamentos/${agB.id}/status`).set(a.h).send({ status: 'CANCELADO' }).expect(404);
  });

  it('A não marca com o profissional ou serviço de B (pelo painel nem pela página pública)', async () => {
    const corpo = { servicoId: a.servicoId, inicio: instante(a.fuso, dia, '11:00'), nome: 'Intruso Teste', whatsapp: whatsappUnico() };
    await env.http().post('/api/agenda/agendamentos').set(a.h).send({ ...corpo, profissionalId: b.profId }).expect(404);
    await env.http().post('/api/agenda/agendamentos').set(a.h).send({ ...corpo, profissionalId: a.profId, servicoId: b.servicoId }).expect(404);
    await env.http().post(`/api/publico/${a.slug}/agendamentos`).send({ ...corpo, profissionalId: b.profId, consentimento: true }).expect(404);
    await env.http().get(`/api/publico/${a.slug}/horarios?profissionalId=${b.profId}&servicoId=${a.servicoId}&data=${dia}`).expect(404);
  });

  it('A não bloqueia nem apaga bloqueio de B', async () => {
    await env.http().post('/api/bloqueios').set(a.h).send({ profissionalId: b.profId, inicio: `${dia}T12:00`, fim: `${dia}T13:00` }).expect(404);
    const bl = (await env.http().post('/api/bloqueios').set(b.h).send({ profissionalId: b.profId, inicio: `${dia}T12:00`, fim: `${dia}T13:00` }).expect(201)).body;
    await env.http().delete(`/api/bloqueios/${bl.id}`).set(a.h).expect(404);
    expect((await env.http().get(`/api/bloqueios?de=${dia}&ate=${dia}`).set(a.h).expect(200)).body).toEqual([]);
  });

  it('o link de B só mexe em B: o salão certo é deduzido do token, não do que o cliente diz', async () => {
    const r = (await env.http().get(`/api/meu-agendamento/${tokenB}`).expect(200)).body;
    expect(r.salao.slug).toBe(b.slug);
    await env.http().post(`/api/meu-agendamento/${tokenB}/cancelar`).expect(200);
    expect((await env.prisma.semTenant.agendamento.findUniqueOrThrow({ where: { id: agB.id } })).estabelecimentoId).toBe(b.dono.estabelecimentoId);
  });

  it('sem login, as rotas do painel dão 401', async () => {
    for (const rota of ['/api/agenda?de=2026-01-01&ate=2026-01-02', '/api/bloqueios?de=2026-01-01&ate=2026-01-02']) {
      await env.http().get(rota).expect(401);
    }
    await env.http().post('/api/agenda/agendamentos').send({}).expect(401);
  });
});
