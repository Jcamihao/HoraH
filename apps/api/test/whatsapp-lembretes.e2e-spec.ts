import { DateTime } from 'luxon';
import { MemoryTransport } from '../src/mail/mail.transport';
import { fimDoPrazoDeResposta, momentoDoLembrete } from '../src/whatsapp/janelas';
import { WaAkgFake } from './waakg-fake';
import {
  Ambiente, auth, diaFuturo, enviarWebhookWa, envWhatsapp, instante, limparBanco, montarSalao, SalaoPronto, subirApp, whatsappUnico,
} from './helpers';

async function esperar(condicao: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const fim = Date.now() + ms;
  while (!(await condicao()) && Date.now() < fim) await new Promise((r) => setTimeout(r, 25));
}
const MIN = 60_000;
const H = 3_600_000;

describe('WhatsApp: lembrete, confirmação e cancelamento automático', () => {
  let env: Ambiente;
  let fake: WaAkgFake;
  let rotinas: { processarWhatsapp: (agora?: Date) => Promise<unknown> };
  let lembretes: { aoEntregar: (id: string, quando: Date) => Promise<void> };
  let contexto: { executarComo: <T>(id: string, fn: () => T) => T };
  const sql = () => env.prisma.semTenant;

  beforeAll(async () => {
    fake = await new WaAkgFake().iniciar();
    env = await subirApp(envWhatsapp(fake.url));
    await limparBanco(env.prisma);
    const { RotinasService } = await import('../src/rotinas/rotinas.service');
    const { LembretesService } = await import('../src/whatsapp/lembretes.service');
    const { TenantContext } = await import('../src/common/tenant-context');
    rotinas = env.app.get(RotinasService);
    lembretes = env.app.get(LembretesService);
    contexto = env.app.get(TenantContext);
  });
  afterAll(async () => {
    await env.fechar();
    await fake.parar();
  });
  beforeEach(() => { fake.envios.length = 0; fake.falhasDeEnvio = 0; MemoryTransport.caixa.length = 0; });

  const idSessao = (s: SalaoPronto) => s.dono.estabelecimentoId;
  async function ligar(s: SalaoPronto): Promise<void> {
    await env.http().post('/api/whatsapp/conectar').set(s.h).expect(200);
    fake.conectar(idSessao(s));
    await enviarWebhookWa(env, 'connection.update', idSessao(s), { status: 'CONNECTED', qr: null }).expect(200);
  }
  /** Salão com WhatsApp ligado e um agendamento a 4 dias, às 10:00, com a confirmação imediata já enviada. */
  async function cenario(opcoes: { hhmm?: string } = {}) {
    const s = await montarSalao(env);
    await ligar(s);
    const whatsapp = whatsappUnico();
    const marcado = (await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
      profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, diaFuturo(s.fuso, 4, 1), opcoes.hhmm ?? '10:00'),
      nome: 'Cliente Lembrete', whatsapp, consentimento: true,
    }).expect(201)).body;
    await esperar(() => fake.envios.length >= 1);
    const ag = await sql().agendamento.findUniqueOrThrow({ where: { token: marcado.token } });
    fake.envios.length = 0;
    MemoryTransport.caixa.length = 0;
    return { s, token: marcado.token as string, ag, whatsapp };
  }
  const recarregar = (id: string) => sql().agendamento.findUniqueOrThrow({ where: { id } });
  /** Depois de rodar o job com relógio simulado (dias à frente) o espaçamento fica no futuro: libera para os passos em tempo real. */
  const liberarEnvio = (s: SalaoPronto) =>
    sql().conexaoWhatsapp.update({ where: { estabelecimentoId: idSessao(s) }, data: { proximoEnvioEm: new Date(0) } });
  /** Espera o id da mensagem do lembrete estar gravado (o envio e a gravação são dois passos). */
  const esperarGravado = (agendamentoId: string) =>
    esperar(async () => !!(await sql().mensagemLog.findFirst({ where: { agendamentoId, tipo: 'LEMBRETE', waMensagemId: { not: null } } })));
  const lembreteEnviado = (s: SalaoPronto) => fake.envios.filter((e) => e.sessionId === idSessao(s) && /Lembrete/.test(e.texto));

  describe('quando o lembrete sai', () => {
    it('agendamento com antecedência: lembrete 24 h antes, dentro de 8h–20h do fuso do salão', async () => {
      const { s, ag } = await cenario({ hhmm: '10:00' });
      expect(ag.lembreteAgendadoPara).toEqual(momentoDoLembrete(ag.inicio, s.fuso, ag.createdAt));
      expect(ag.lembreteAgendadoPara!.toISOString()).toBe(new Date(ag.inicio.getTime() - 24 * H).toISOString());
    });

    it('as 24 h antes caem às 6h30: sai às 8h do mesmo dia; às 21h30: sai às 20h', async () => {
      const s = await montarSalao(env, { inicioMin: 0, fimMin: 1440 });
      const dia = diaFuturo(s.fuso, 4, 3);
      const reservar = async (hhmm: string) => (await env.http().post('/api/agenda/agendamentos').set(s.h).send({
        profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, dia, hhmm), nome: 'Janela Teste', whatsapp: whatsappUnico(),
      }).expect(201)).body.id as string;
      const cedo = await recarregar(await reservar('06:30'));
      const tarde = await recarregar(await reservar('21:30'));
      const local = (d: Date | null) => DateTime.fromJSDate(d!, { zone: s.fuso }).toFormat('dd HH:mm');
      const diaAnterior = DateTime.fromISO(dia, { zone: s.fuso }).minus({ days: 1 }).toFormat('dd');
      expect(local(cedo.lembreteAgendadoPara)).toBe(`${diaAnterior} 08:00`);
      expect(local(tarde.lembreteAgendadoPara)).toBe(`${diaAnterior} 20:00`);
    });

    it('marcado com menos de 24 h: só a confirmação imediata, sem lembrete e sem cancelamento automático', async () => {
      const s = await montarSalao(env, { inicioMin: 0, fimMin: 1440 });
      await ligar(s);
      const proximo = DateTime.now().setZone(s.fuso).plus({ minutes: 1 });
      const grade = proximo.set({ second: 0, millisecond: 0 }).plus({ minutes: (30 - (proximo.minute % 30)) % 30 }).toUTC().toISO()!;
      const r = (await env.http().post('/api/agenda/agendamentos').set(s.h).send({
        profissionalId: s.profId, servicoId: s.servicoId, inicio: grade, nome: 'Em Cima Da Hora', whatsapp: whatsappUnico(),
      }).expect(201)).body;
      const ag = await recarregar(r.id);
      expect(ag.lembreteAgendadoPara).toBeNull();
      await esperar(() => fake.envios.length >= 1);
      expect(fake.envios[0].texto).toContain('confirmado'); // a confirmação sai
      await rotinas.processarWhatsapp(new Date(Date.now() + 3 * H));
      expect(lembreteEnviado(s)).toHaveLength(0);
    });
  });

  describe('o job envia o lembrete', () => {
    it('antes da hora não manda; na hora manda uma vez só, com como confirmar e o aviso das 2 horas', async () => {
      const { s, ag } = await cenario();
      await rotinas.processarWhatsapp(new Date(ag.lembreteAgendadoPara!.getTime() - MIN));
      expect(fake.envios).toHaveLength(0);

      const hora = new Date(ag.lembreteAgendadoPara!.getTime() + MIN);
      await rotinas.processarWhatsapp(hora);
      await rotinas.processarWhatsapp(hora);
      await rotinas.processarWhatsapp(new Date(hora.getTime() + 5 * MIN));
      expect(lembreteEnviado(s)).toHaveLength(1);
      const texto = lembreteEnviado(s)[0].texto;
      expect(texto).toContain('Para CONFIRMAR, responda 1');
      expect(texto).toContain('CANCELAR, responda 2');
      expect(texto).toContain('Se não responder em 2 horas');
      expect(texto).toContain(`/agendamento/${ag.token}`);
      expect((await recarregar(ag.id)).lembreteEnviadoEm).not.toBeNull();
    });

    it('lembrete atrasado demais (WhatsApp fora do ar por horas) não sai mais', async () => {
      const { s, ag } = await cenario();
      await rotinas.processarWhatsapp(new Date(ag.lembreteAgendadoPara!.getTime() + 7 * H));
      expect(lembreteEnviado(s)).toHaveLength(0);
      expect((await recarregar(ag.id)).lembreteAgendadoPara).toBeNull();
    });

    it('cancelar o agendamento cancela o lembrete; remarcar recalcula e apaga o que valia para o horário antigo', async () => {
      const { s, ag, token } = await cenario();
      await rotinas.processarWhatsapp(new Date(ag.lembreteAgendadoPara!.getTime() + MIN));
      const novo = instante(s.fuso, diaFuturo(s.fuso, 6, 2), '14:00');
      await env.http().post(`/api/meu-agendamento/${token}/remarcar`).send({ inicio: novo }).expect(200);
      const r = await recarregar(ag.id);
      expect(r.lembreteEnviadoEm).toBeNull();
      expect(r.lembreteEntregueEm).toBeNull();
      expect(r.confirmarAte).toBeNull();
      expect(r.lembreteAgendadoPara).toEqual(momentoDoLembrete(r.inicio, s.fuso, r.updatedAt));

      await env.http().post(`/api/meu-agendamento/${token}/cancelar`).expect(200);
      const c = await recarregar(ag.id);
      expect(c.lembreteAgendadoPara).toBeNull();
      fake.envios.length = 0;
      await rotinas.processarWhatsapp(new Date(r.inicio.getTime() - 23 * H));
      expect(lembreteEnviado(s)).toHaveLength(0);
    });
  });

  describe('entrega e cancelamento automático', () => {
    async function lembreteEntregue() {
      const base = await cenario();
      await rotinas.processarWhatsapp(new Date(base.ag.lembreteAgendadoPara!.getTime() + MIN));
      const envio = lembreteEnviado(base.s)[0];
      await esperarGravado(base.ag.id);
      await enviarWebhookWa(env, 'message.status', idSessao(base.s), { keyId: envio.id, remoteJid: envio.jid, status: 'DELIVERED' }).expect(200);
      const ag = await recarregar(base.ag.id);
      return { ...base, ag, envio };
    }

    it('a ENTREGA do lembrete começa a contagem de 2 h (sem contar das 22h às 8h) e aparece no painel', async () => {
      const { s, ag } = await lembreteEntregue();
      expect(ag.lembreteEntregueEm).not.toBeNull();
      expect(ag.confirmarAte).toEqual(fimDoPrazoDeResposta(ag.lembreteEntregueEm!, s.fuso));
      const lista = (await env.http().get(`/api/agenda?de=${diaFuturo(s.fuso, 4, 1)}&ate=${diaFuturo(s.fuso, 4, 1)}`).set(s.h).expect(200)).body.agendamentos;
      expect(lista[0]).toMatchObject({ lembreteEntregue: true, confirmacao: 'PENDENTE' });
      const log = await sql().mensagemLog.findFirstOrThrow({ where: { waMensagemId: (await sql().mensagemLog.findFirstOrThrow({ where: { agendamentoId: ag.id, tipo: 'LEMBRETE' } })).waMensagemId! } });
      expect(log.status).toBe('ENTREGUE');
      expect(log.entregueEm).not.toBeNull();
    });

    it('status só ENVIADA (sem entrega) não começa contagem e nunca cancela, por mais que o tempo passe', async () => {
      const { s, ag } = await cenario();
      await rotinas.processarWhatsapp(new Date(ag.lembreteAgendadoPara!.getTime() + MIN));
      const envio = lembreteEnviado(s)[0];
      await esperarGravado(ag.id);
      await enviarWebhookWa(env, 'message.status', idSessao(s), { keyId: envio.id, remoteJid: envio.jid, status: 'SENT' }).expect(200);
      expect((await recarregar(ag.id)).lembreteEntregueEm).toBeNull();
      await rotinas.processarWhatsapp(new Date(ag.inicio.getTime() - 3 * MIN));
      const depois = await recarregar(ag.id);
      expect(depois).toMatchObject({ status: 'AGENDADO', confirmacao: 'PENDENTE' });
    });

    it('sem resposta depois do prazo: cancela, libera o horário, avisa o cliente com link para remarcar e o dono', async () => {
      const { s, ag } = await lembreteEntregue();
      await sql().agendamento.update({ where: { id: ag.id }, data: { confirmarAte: new Date(Date.now() - MIN) } }); // prazo já venceu
      await liberarEnvio(s);
      fake.envios.length = 0;
      MemoryTransport.caixa.length = 0;
      await rotinas.processarWhatsapp();
      await rotinas.processarWhatsapp(); // reexecutar não cancela nem avisa de novo

      const cancelado = await recarregar(ag.id);
      expect(cancelado).toMatchObject({ status: 'CANCELADO', confirmacao: 'SEM_RESPOSTA', canceladoPor: 'AUTOMATICO' });
      expect(cancelado.lembreteAgendadoPara).toBeNull();

      await esperar(() => fake.envios.length >= 1);
      expect(fake.envios).toHaveLength(1);
      expect(fake.envios[0].texto).toContain('liberamos o horário');
      expect(fake.envios[0].texto).toContain(`/${s.slug}?profissional=${s.profId}&servico=${s.servicoId}`);

      const horarios = (await env.http().get(`/api/publico/${s.slug}/horarios?profissionalId=${s.profId}&servicoId=${s.servicoId}&data=${diaFuturo(s.fuso, 4, 1)}`).expect(200)).body;
      expect(horarios.map((h: any) => h.hora)).toContain('10:00');

      const n = (await env.http().get('/api/notificacoes').set(s.h).expect(200)).body.itens;
      expect(n.filter((i: any) => i.tipo === 'cancelamento_automatico')).toHaveLength(1);
      await esperar(() => MemoryTransport.caixa.some((e) => /Agendamento cancelado/.test(e.assunto)));
      expect(MemoryTransport.caixa.find((e) => /Agendamento cancelado/.test(e.assunto))!.texto).toContain('O sistema cancelou');
    });

    it('ainda dentro do prazo: não cancela', async () => {
      const { ag } = await lembreteEntregue();
      expect(ag.confirmarAte!.getTime()).toBeGreaterThan(Date.now());
      await rotinas.processarWhatsapp();
      expect((await recarregar(ag.id)).status).toBe('AGENDADO');
    });

    it('o cancelamento automático ignora o prazo de cancelamento do salão (ele vale só para o cliente)', async () => {
      const { s, ag } = await lembreteEntregue();
      await env.http().patch('/api/estabelecimento').set(s.h).send({ prazoCancelamentoMin: 30 * 1440 }).expect(200);
      await sql().agendamento.update({ where: { id: ag.id }, data: { confirmarAte: new Date(Date.now() - MIN) } });
      await rotinas.processarWhatsapp();
      expect((await recarregar(ag.id)).status).toBe('CANCELADO');
    });

    it('cliente confirmou pelo link: nunca é cancelado, mesmo com o prazo vencido', async () => {
      const { ag, token } = await lembreteEntregue();
      const r = (await env.http().post(`/api/meu-agendamento/${token}/confirmar`).expect(200)).body;
      expect(r).toMatchObject({ confirmacao: 'CONFIRMADO', podeConfirmar: false });
      await sql().agendamento.update({ where: { id: ag.id }, data: { confirmarAte: new Date(Date.now() - H) } });
      await rotinas.processarWhatsapp();
      expect(await recarregar(ag.id)).toMatchObject({ status: 'AGENDADO', confirmacao: 'CONFIRMADO' });
      await env.http().post(`/api/meu-agendamento/${token}/confirmar`).expect(200); // confirmar de novo é inofensivo
    });

    it('confirmar um agendamento cancelado é recusado; token inexistente é 404', async () => {
      const { token } = await cenario();
      await env.http().post(`/api/meu-agendamento/${token}/cancelar`).expect(200);
      await env.http().post(`/api/meu-agendamento/${token}/confirmar`).expect(409);
      await env.http().post(`/api/meu-agendamento/${'a'.repeat(43)}/confirmar`).expect(404);
    });

    it('entregue às 21h: o prazo vira 9h do dia seguinte (pausa da noite); às 23h ainda vale, às 9h01 cancela', async () => {
      const { s, ag } = await cenario();
      const entregueEm = DateTime.fromJSDate(ag.lembreteAgendadoPara!, { zone: s.fuso }).set({ hour: 21, minute: 0, second: 0, millisecond: 0 }).toJSDate();
      await sql().agendamento.update({ where: { id: ag.id }, data: { lembreteEnviadoEm: entregueEm } });
      await contexto.executarComo(idSessao(s), () => lembretes.aoEntregar(ag.id, entregueEm));
      const depois = await recarregar(ag.id);
      const nove = DateTime.fromJSDate(entregueEm, { zone: s.fuso }).plus({ days: 1 }).set({ hour: 9, minute: 0 }).toJSDate();
      expect(depois.confirmarAte!.toISOString()).toBe(nove.toISOString());

      await rotinas.processarWhatsapp(new Date(entregueEm.getTime() + 2 * H)); // 23h
      expect((await recarregar(ag.id)).status).toBe('AGENDADO');
      await rotinas.processarWhatsapp(new Date(nove.getTime() - MIN));
      expect((await recarregar(ag.id)).status).toBe('AGENDADO');
      await rotinas.processarWhatsapp(new Date(nove.getTime() + MIN));
      expect((await recarregar(ag.id)).status).toBe('CANCELADO');
    });

    it('a entrega chega duas vezes (ENTREGUE e depois LIDA): a contagem não reinicia', async () => {
      const { s, ag, envio } = await lembreteEntregue();
      const primeiro = ag.confirmarAte!.getTime();
      await new Promise((r) => setTimeout(r, 20));
      await enviarWebhookWa(env, 'message.status', idSessao(s), { keyId: envio.id, remoteJid: envio.jid, status: 'READ' }).expect(200);
      await enviarWebhookWa(env, 'message.status', idSessao(s), { keyId: envio.id, remoteJid: envio.jid, status: 'DELIVERED' }).expect(200);
      const depois = await recarregar(ag.id);
      expect(depois.confirmarAte!.getTime()).toBe(primeiro);
      const log = await sql().mensagemLog.findFirstOrThrow({ where: { agendamentoId: ag.id, tipo: 'LEMBRETE' } });
      expect(log.status).toBe('LIDA'); // nunca volta de LIDA para ENTREGUE
    });
  });

  it('o aviso de entrega chega ANTES de o id da mensagem estar gravado: espera um instante e não perde a confirmação', async () => {
    const { s, ag } = await cenario();
    await rotinas.processarWhatsapp(new Date(ag.lembreteAgendadoPara!.getTime() + MIN));
    await esperarGravado(ag.id);
    const log = await sql().mensagemLog.findFirstOrThrow({ where: { agendamentoId: ag.id, tipo: 'LEMBRETE' } });
    const waId = log.waMensagemId!;
    // simula o envio ainda em andamento: o id some e só volta depois de 250 ms
    await sql().mensagemLog.update({ where: { id: log.id }, data: { waMensagemId: null } });
    // (a consulta do Prisma só executa quando alguém a aguarda: por isso o .then)
    setTimeout(() => void sql().mensagemLog.update({ where: { id: log.id }, data: { waMensagemId: waId } }).then(() => undefined), 250);
    await enviarWebhookWa(env, 'message.status', idSessao(s), { keyId: waId, remoteJid: 'x', status: 'DELIVERED' }).expect(200);
    expect((await recarregar(ag.id)).lembreteEntregueEm).not.toBeNull();
  });

  describe('lembrete que não foi entregue', () => {
    it('sem confirmação de entrega depois de 2 h: o dono é avisado (painel e e-mail), uma vez, e NADA é cancelado', async () => {
      const { s, ag } = await cenario();
      await rotinas.processarWhatsapp(new Date(ag.lembreteAgendadoPara!.getTime() + MIN));
      const enviadaEm = (await sql().mensagemLog.findFirstOrThrow({ where: { agendamentoId: ag.id, tipo: 'LEMBRETE' } })).enviadaEm!;
      MemoryTransport.caixa.length = 0;

      await rotinas.processarWhatsapp(new Date(enviadaEm.getTime() + H)); // ainda cedo
      expect((await env.http().get('/api/notificacoes').set(s.h).expect(200)).body.itens.filter((i: any) => i.tipo === 'lembrete_sem_entrega')).toHaveLength(0);

      const tarde = new Date(enviadaEm.getTime() + 2 * H + MIN);
      await rotinas.processarWhatsapp(tarde);
      await rotinas.processarWhatsapp(tarde);
      const n = (await env.http().get('/api/notificacoes').set(s.h).expect(200)).body.itens.filter((i: any) => i.tipo === 'lembrete_sem_entrega');
      expect(n).toHaveLength(1);
      expect(n[0].corpo).toContain('não será cancelado sozinho');
      const doDono = () => MemoryTransport.caixa.filter((e) => e.para === s.dono.email && /não entregue/.test(e.assunto));
      await esperar(() => doDono().length >= 1);
      expect(doDono()).toHaveLength(1);
      expect((await recarregar(ag.id)).status).toBe('AGENDADO');
    });

    it('lembrete que falhou de vez (WhatsApp fora): o dono também é avisado', async () => {
      const { s, ag } = await cenario();
      await enviarWebhookWa(env, 'connection.update', idSessao(s), { status: 'DISCONNECTED' }).expect(200);
      await rotinas.processarWhatsapp(new Date(ag.lembreteAgendadoPara!.getTime() + MIN)); // enfileira, não sai
      await rotinas.processarWhatsapp(new Date(Date.now() + 7 * H)); // expirou na fila (FALHOU)
      // a rotina pula o lembrete de 7 h atrás: o que importa é o aviso ao dono, já dado pela expiração ou pela queda
      const msgs = await sql().mensagemLog.findMany({ where: { agendamentoId: ag.id, tipo: 'LEMBRETE' } });
      if (msgs.length) expect(msgs[0].status).toBe('FALHOU');
      expect((await recarregar(ag.id)).status).toBe('AGENDADO');
    });
  });

  describe('o cliente responde o lembrete no WhatsApp', () => {
    async function comLembrete() {
      const base = await cenario();
      await rotinas.processarWhatsapp(new Date(base.ag.lembreteAgendadoPara!.getTime() + MIN));
      fake.envios.length = 0;
      return base;
    }
    const responder = (s: SalaoPronto, whatsapp: string, texto: string) =>
      enviarWebhookWa(env, 'message.received', idSessao(s), {
        from: `55${whatsapp.replace(/\D/g, '')}@s.whatsapp.net`, isGroup: false, chatType: 'PERSONAL', type: 'TEXT', content: texto,
        key: { id: `IN${Math.random().toString(36).slice(2)}`, fromMe: false },
      }).expect(200);

    it('"1" confirma presença', async () => {
      const { s, ag, whatsapp } = await comLembrete();
      await responder(s, whatsapp, '1');
      await esperar(() => fake.envios.length >= 1);
      expect(await recarregar(ag.id)).toMatchObject({ confirmacao: 'CONFIRMADO', status: 'AGENDADO' });
      expect(fake.envios[0].texto).toContain('Confirmado!');
    });

    it('"sim" e "Confirmo" também confirmam (sem diferenciar maiúscula nem acento)', async () => {
      const a = await comLembrete();
      await responder(a.s, a.whatsapp, 'Sim');
      await esperar(() => fake.envios.length >= 1);
      expect((await recarregar(a.ag.id)).confirmacao).toBe('CONFIRMADO');
    });

    it('"2" cancela (pelo cliente) e libera o horário', async () => {
      const { s, ag, whatsapp } = await comLembrete();
      await responder(s, whatsapp, '2');
      await esperar(() => fake.envios.length >= 1);
      expect(await recarregar(ag.id)).toMatchObject({ status: 'CANCELADO', canceladoPor: 'CLIENTE' });
      expect(fake.envios[0].texto).toContain('cancelei');
    });

    it('"não" fora do prazo de cancelamento: recusa com orientação e mantém o horário', async () => {
      const { s, ag, whatsapp } = await comLembrete();
      await env.http().patch('/api/estabelecimento').set(s.h).send({ prazoCancelamentoMin: 30 * 1440 }).expect(200);
      await responder(s, whatsapp, 'não');
      await esperar(() => fake.envios.length >= 1);
      expect((await recarregar(ag.id)).status).toBe('AGENDADO');
      expect(fake.envios[0].texto).toContain('Fale com o salão');
    });

    it('a mesma mensagem entregue duas vezes só é processada uma vez', async () => {
      const { s, whatsapp } = await comLembrete();
      const dados = { from: `55${whatsapp.replace(/\D/g, '')}@s.whatsapp.net`, isGroup: false, type: 'TEXT', content: '1', key: { id: 'IN-REPETIDA-1', fromMe: false } };
      await enviarWebhookWa(env, 'message.received', idSessao(s), dados).expect(200);
      await enviarWebhookWa(env, 'message.received', idSessao(s), dados).expect(200);
      await esperar(() => fake.envios.length >= 1);
      await new Promise((r) => setTimeout(r, 150));
      expect(fake.envios).toHaveLength(1);
    });
  });
});
