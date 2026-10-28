import { DateTime } from 'luxon';
import { MemoryTransport } from '../src/mail/mail.transport';
import { EXPIRA_CONVERSA_MS } from '../src/whatsapp/bot.service';
import { WaAkgFake } from './waakg-fake';
import {
  Ambiente, auth, diaFuturo, enviarWebhookWa, envWhatsapp, instante, limparBanco, montarSalao, novoProfissional, SalaoPronto, subirApp,
} from './helpers';

async function esperar(condicao: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const fim = Date.now() + ms;
  while (!(await condicao()) && Date.now() < fim) await new Promise((r) => setTimeout(r, 25));
}

describe('WhatsApp: bot de agendamento (menu guiado)', () => {
  let env: Ambiente;
  let fake: WaAkgFake;
  const sql = () => env.prisma.semTenant;
  let celular = 5_000_0000;

  beforeAll(async () => {
    fake = await new WaAkgFake().iniciar();
    env = await subirApp(envWhatsapp(fake.url));
    await limparBanco(env.prisma);
  });
  afterAll(async () => {
    await env.fechar();
    await fake.parar();
  });
  beforeEach(() => { fake.envios.length = 0; MemoryTransport.caixa.length = 0; });

  const idSessao = (s: SalaoPronto) => s.dono.estabelecimentoId;
  /** Número canônico novo a cada chamada (um "cliente" diferente por teste). */
  const novoCliente = () => `55119${String(++celular).padStart(8, '0')}`;
  async function salaoLigado(opcoes: Parameters<typeof montarSalao>[1] = {}, comSegundoProf = false) {
    const s = await montarSalao(env, opcoes);
    if (comSegundoProf) await novoProfissional(env, s.h, 'Prof Dois', [{ servicoId: s.servicoId, precoCentavos: 7000 }]);
    await env.http().post('/api/whatsapp/conectar').set(s.h).expect(200);
    fake.conectar(idSessao(s));
    await enviarWebhookWa(env, 'connection.update', idSessao(s), { status: 'CONNECTED' }).expect(200);
    return s;
  }
  let seqMsg = 0;
  /** O cliente manda `texto`; devolve a resposta do bot (a última mensagem enviada para ele). */
  async function dizer(s: SalaoPronto, telefone: string, texto: string, extra: Record<string, unknown> = {}): Promise<string> {
    const antes = fake.envios.length;
    await enviarWebhookWa(env, 'message.received', idSessao(s), {
      from: `${telefone}@s.whatsapp.net`, isGroup: false, chatType: 'PERSONAL', type: 'TEXT', content: texto,
      key: { id: `BOT${++seqMsg}`, fromMe: false }, ...extra,
    }).expect(200);
    const jid = `${telefone}@s.whatsapp.net`;
    const paraEle = () => fake.envios.slice(antes).filter((e) => e.jid === jid && e.sessionId === idSessao(s));
    await esperar(() => paraEle().length > 0);
    return paraEle().at(-1)?.texto ?? ''; // só o que foi para este cliente (outras confirmações podem sair ao mesmo tempo)
  }
  /** Número que a lista mostra para a opção cujo texto contém `rotulo`. */
  const opcao = (lista: string, rotulo: string): string => {
    const linha = lista.split('\n').find((l) => /^\d+\)/.test(l) && l.toLowerCase().includes(rotulo.toLowerCase()));
    if (!linha) throw new Error(`Opção "${rotulo}" não está em:\n${lista}`);
    return linha.split(')')[0];
  };

  /** Faz o fluxo inteiro "agendar" até o resumo. Devolve a mensagem do resumo. */
  async function atéOResumo(s: SalaoPronto, tel: string, nome?: string, hhmm = '10:00') {
    let r = await dizer(s, tel, '1');
    if (r.includes('Com quem')) r = await dizer(s, tel, opcao(r, 'Prof Um'));
    r = await dizer(s, tel, opcao(r, 'Corte'));
    const dia = diaFuturo(s.fuso, 4, 1);
    const rotuloDia = DateTime.fromISO(dia).setLocale('pt-BR').toFormat('ccc dd/MM');
    r = await dizer(s, tel, opcao(r, rotuloDia));
    r = await dizer(s, tel, opcao(r, hhmm));
    if (r.includes('qual é o seu nome')) r = await dizer(s, tel, nome ?? 'joão da silva');
    return { resumo: r, dia };
  }

  describe('menu', () => {
    it('qualquer mensagem apresenta o menu com o nome do salão', async () => {
      const s = await salaoLigado();
      const r = await dizer(s, novoCliente(), 'oi');
      expect(r).toContain(s.slug.length ? 'Salão Teste' : '');
      expect(r).toContain('1) Agendar');
      expect(r).toContain('2) Meus agendamentos');
    });

    it('mensagem não entendida no menu: reenvia o menu', async () => {
      const s = await salaoLigado();
      const tel = novoCliente();
      await dizer(s, tel, 'oi');
      const r = await dizer(s, tel, 'quero um corte amanhã por favor');
      expect(r).toContain('1) Agendar');
    });

    it('"menu" volta ao menu de qualquer ponto; "0" volta durante um agendamento', async () => {
      const s = await salaoLigado();
      const tel = novoCliente();
      await dizer(s, tel, '1'); // já no passo de serviço (1 profissional só)
      expect(await dizer(s, tel, 'menu')).toContain('1) Agendar');
      await dizer(s, tel, '1');
      expect(await dizer(s, tel, '0')).toContain('2) Meus agendamentos');
    });

    it('meio de um agendamento com resposta fora das opções: repete o passo (não perde o que já escolheu)', async () => {
      const s = await salaoLigado();
      const tel = novoCliente();
      const lista = await dizer(s, tel, '1');
      expect(lista).toContain('O que você vai fazer');
      const r = await dizer(s, tel, 'sei lá');
      expect(r).toContain('Não entendi');
      expect(r).toContain('Corte');
    });

    it('conversa parada por mais de 30 min recomeça do menu (o "2" não escolhe serviço de uma conversa velha)', async () => {
      const s = await salaoLigado();
      const tel = novoCliente();
      await dizer(s, tel, '1'); // no passo de serviço
      await sql().conversaBot.updateMany({ where: { telefone: tel }, data: { atualizadaEm: new Date(Date.now() - EXPIRA_CONVERSA_MS - 60_000) } });
      const r = await dizer(s, tel, '2');
      expect(r).toContain('não tem horários marcados'); // foi "Meus agendamentos", não "serviço número 2"
    });
  });

  describe('agendar pelo WhatsApp', () => {
    it('fluxo completo: profissional, serviço, dia, horário, nome, confirmação; cria o agendamento (origem BOT) e manda a confirmação com o link', async () => {
      const s = await salaoLigado({}, true);
      const tel = novoCliente();
      const lista = await dizer(s, novoCliente(), '1'); // outro cliente só para ver a lista
      expect(lista).toContain('Com quem você quer marcar?');
      expect(lista).toContain('Prof Um');
      expect(lista).toContain('Prof Dois');

      const { resumo, dia } = await atéOResumo(s, tel, 'joão da silva');
      expect(resumo).toContain('Confira:');
      expect(resumo).toContain('Corte com Prof Um');
      expect(resumo).toContain('10:00');
      expect(resumo).toContain('Para João da Silva');
      expect(resumo).toContain('concorda em usar seu nome e WhatsApp');

      await dizer(s, tel, '1'); // confirmar
      await esperar(() => fake.envios.some((e) => e.texto.includes('Seu horário está confirmado')));
      const ag = await sql().agendamento.findFirstOrThrow({ where: { estabelecimentoId: idSessao(s) }, include: { cliente: true } });
      expect(ag).toMatchObject({ origem: 'BOT', status: 'AGENDADO', precoCentavos: 5000, inicio: new Date(instante(s.fuso, dia, '10:00')) });
      expect(ag.consentimentoEm).toBeInstanceOf(Date);
      expect(ag.cliente).toMatchObject({ nome: 'João da Silva', whatsapp: tel });
      const confirmacao = fake.envios.find((e) => e.texto.includes('Seu horário está confirmado'))!;
      expect(confirmacao.texto).toContain(`/agendamento/${ag.token}`);
      expect(confirmacao.jid).toBe(`${tel}@s.whatsapp.net`);
    });

    it('com um profissional só, pula a escolha de profissional', async () => {
      const s = await salaoLigado();
      const r = await dizer(s, novoCliente(), '1');
      expect(r).toContain('O que você vai fazer com Prof Um?');
      expect(r).toContain('Corte (30 min, R$ 50)');
    });

    it('cliente que já existe não precisa dizer o nome de novo', async () => {
      const s = await salaoLigado();
      const tel = novoCliente();
      await env.http().post('/api/agenda/agendamentos').set(s.h).send({
        profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, diaFuturo(s.fuso, 5, 2), '09:00'), nome: 'Ana Antiga', whatsapp: tel,
      }).expect(201);
      const { resumo } = await atéOResumo(s, tel);
      expect(resumo).toContain('Confira:');
      expect(resumo).toContain('Para Ana Antiga');
    });

    it('cancelar no resumo não marca nada', async () => {
      const s = await salaoLigado();
      const tel = novoCliente();
      await atéOResumo(s, tel, 'maria');
      expect(await dizer(s, tel, '2')).toContain('não marquei nada');
      expect(await sql().agendamento.count({ where: { estabelecimentoId: idSessao(s) } })).toBe(0);
    });

    it('o horário foi ocupado enquanto o cliente decidia: avisa e mostra os horários de novo', async () => {
      const s = await salaoLigado();
      const tel = novoCliente();
      const { dia } = await atéOResumo(s, tel, 'maria');
      await env.http().post('/api/agenda/agendamentos').set(s.h).send({
        profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, dia, '10:00'), nome: 'Furou A Fila', whatsapp: novoCliente(),
      }).expect(201);
      const r = await dizer(s, tel, '1');
      expect(r).toContain('não está mais disponível');
      expect(r).toContain('Qual horário?');
      expect(r).not.toMatch(/\d\) 10:00/);
    });

    it('as mesmas regras do link: teto de 3 horários futuros por WhatsApp', async () => {
      const s = await salaoLigado();
      const tel = novoCliente();
      for (const hhmm of ['09:00', '09:30', '10:00']) {
        await env.http().post(`/api/publico/${s.slug}/agendamentos`).send({
          profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, diaFuturo(s.fuso, 4, 1), hhmm), nome: 'Teto Teste', whatsapp: tel, consentimento: true,
        }).expect(201);
      }
      await atéOResumo(s, tel, undefined, '11:00');
      const r = await dizer(s, tel, '1');
      expect(r).toContain('3 horários marcados');
    });

    it('assinatura bloqueada: o bot não agenda e explica', async () => {
      const s = await salaoLigado();
      await sql().assinatura.update({ where: { estabelecimentoId: idSessao(s) }, data: { status: 'BLOQUEADA' } });
      const r = await dizer(s, novoCliente(), '1');
      expect(r).toContain('não está recebendo agendamentos');
    });
  });

  describe('meus agendamentos', () => {
    async function comAgendamento() {
      const s = await salaoLigado();
      const tel = novoCliente();
      const dia = diaFuturo(s.fuso, 4, 1);
      const ag = (await env.http().post('/api/agenda/agendamentos').set(s.h).send({
        profissionalId: s.profId, servicoId: s.servicoId, inicio: instante(s.fuso, dia, '10:00'), nome: 'Cliente Bot', whatsapp: tel,
      }).expect(201)).body;
      await esperar(() => fake.envios.length >= 1);
      fake.envios.length = 0;
      return { s, tel, ag, dia };
    }

    it('lista os horários futuros do número e permite cancelar', async () => {
      const { s, tel, ag } = await comAgendamento();
      const lista = await dizer(s, tel, '2');
      expect(lista).toContain('Seus horários:');
      expect(lista).toContain('10:00');
      expect(lista).toContain('Corte com Prof Um');
      expect(await dizer(s, tel, '1')).toContain('1) Remarcar');
      expect(await dizer(s, tel, '2')).toContain('cancelei o seu horário');
      expect(await sql().agendamento.findUniqueOrThrow({ where: { id: ag.id } })).toMatchObject({ status: 'CANCELADO', canceladoPor: 'CLIENTE' });
    });

    it('quem não tem horário marcado recebe a orientação para marcar', async () => {
      const s = await salaoLigado();
      expect(await dizer(s, novoCliente(), '2')).toContain('Você não tem horários marcados');
    });

    it('remarca: escolhe outro dia e horário, confirma, e recebe a confirmação do novo horário', async () => {
      const { s, tel, ag } = await comAgendamento();
      await dizer(s, tel, '2');
      await dizer(s, tel, '1');
      let r = await dizer(s, tel, '1'); // 1) Remarcar
      expect(r).toContain('Qual dia?');
      const outroDia = diaFuturo(s.fuso, 5, 2);
      r = await dizer(s, tel, opcao(r, DateTime.fromISO(outroDia).setLocale('pt-BR').toFormat('ccc dd/MM')));
      r = await dizer(s, tel, opcao(r, '14:00'));
      expect(r).toContain('Remarcar para');
      await dizer(s, tel, '1');
      await esperar(() => fake.envios.some((e) => e.texto.includes('remarcado')));
      const depois = await sql().agendamento.findUniqueOrThrow({ where: { id: ag.id } });
      expect(depois.inicio.toISOString()).toBe(instante(s.fuso, outroDia, '14:00'));
      expect(depois.status).toBe('AGENDADO');
    });

    it('fora do prazo de cancelamento do salão: o bot recusa e manda falar com o salão', async () => {
      const { s, tel } = await comAgendamento();
      await env.http().patch('/api/estabelecimento').set(s.h).send({ prazoCancelamentoMin: 30 * 1440 }).expect(200);
      await dizer(s, tel, '2');
      await dizer(s, tel, '1');
      expect(await dizer(s, tel, '2')).toContain('Fale com o salão');
    });

    it('só mostra os horários do próprio número (outro cliente não vê nem mexe)', async () => {
      const { s } = await comAgendamento();
      expect(await dizer(s, novoCliente(), '2')).toContain('Você não tem horários marcados');
    });
  });

  describe('o que o bot ignora', () => {
    const semResposta = async (s: SalaoPronto, dados: Record<string, unknown>) => {
      await enviarWebhookWa(env, 'message.received', idSessao(s), dados).expect(200);
      await new Promise((r) => setTimeout(r, 150));
      expect(fake.envios).toHaveLength(0);
    };

    it('mensagem de grupo, de mim mesmo, sem texto, de mídia e de endereço sem telefone (@lid)', async () => {
      const s = await salaoLigado();
      const tel = novoCliente();
      await semResposta(s, { from: '1203630000-1@g.us', isGroup: true, type: 'TEXT', content: 'oi' });
      await semResposta(s, { from: `${tel}@s.whatsapp.net`, type: 'TEXT', content: 'oi', key: { id: 'EU1', fromMe: true } });
      await semResposta(s, { from: `${tel}@s.whatsapp.net`, type: 'TEXT', content: '   ' });
      await semResposta(s, { from: `${tel}@s.whatsapp.net`, type: 'IMAGE', content: 'foto', caption: 'foto' });
      await semResposta(s, { from: '123456789012345@lid', type: 'TEXT', content: 'oi' });
    });

    it('a mesma mensagem entregue duas vezes é respondida uma vez só', async () => {
      const s = await salaoLigado();
      const tel = novoCliente();
      const dados = { from: `${tel}@s.whatsapp.net`, type: 'TEXT', content: 'oi', key: { id: 'DUP-1', fromMe: false } };
      await enviarWebhookWa(env, 'message.received', idSessao(s), dados).expect(200);
      await enviarWebhookWa(env, 'message.received', idSessao(s), dados).expect(200);
      await esperar(() => fake.envios.length >= 1);
      await new Promise((r) => setTimeout(r, 150));
      expect(fake.envios).toHaveLength(1);
    });

    it('salão sem WhatsApp conectado não responde nada', async () => {
      const s = await montarSalao(env);
      await enviarWebhookWa(env, 'message.received', idSessao(s), { from: `${novoCliente()}@s.whatsapp.net`, type: 'TEXT', content: 'oi' }).expect(200);
      await new Promise((r) => setTimeout(r, 100));
      expect(fake.envios).toHaveLength(0);
    });
  });

  describe('isolamento entre salões', () => {
    it('o mesmo cliente conversando com dois salões: conversas e horários separados', async () => {
      const a = await salaoLigado();
      const b = await salaoLigado();
      const tel = novoCliente();
      await atéOResumo(a, tel, 'maria');
      await dizer(a, tel, '1');
      await esperar(() => fake.envios.some((e) => e.texto.includes('confirmado')));
      expect(await dizer(b, tel, '2')).toContain('Você não tem horários marcados'); // no salão B ele não tem nada
      expect(await dizer(a, tel, '2')).toContain('Seus horários:');
      expect(fake.envios.filter((e) => e.sessionId === idSessao(b)).every((e) => !e.texto.includes('Seus horários'))).toBe(true);
    });
  });
});
