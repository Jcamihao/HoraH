import { ForbiddenException, HttpException, Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { OrigemAgendamento } from '@hora-h/shared';
import { AgendaService, type Salao } from '../agenda/agenda.service';
import { hojeNoFuso } from '../agenda/tempo';
import { TenantContext } from '../common/tenant-context';
import { comTenant, PrismaService } from '../prisma/prisma.service';
import { quandoPorExtenso } from './mensagens';
import { WhatsappService } from './whatsapp.service';

/** Depois de tanto tempo sem mensagem a conversa volta ao menu. */
export const EXPIRA_CONVERSA_MS = 30 * 60_000;
const MAX_HORARIOS = 20;
const MAX_DIAS = 7;
const MAX_MEUS = 5;

type Estado = 'MENU' | 'PROF' | 'SERV' | 'DIA' | 'HORA' | 'NOME' | 'CONFIRMAR' | 'MEUS' | 'ACAO' | 'REM_DIA' | 'REM_HORA' | 'REM_CONFIRMAR';

interface Dados {
  /** O que cada número da lista atual significa (id, data ou instante). */
  opcoes?: string[];
  profissionalId?: string;
  servicoId?: string;
  duracaoMin?: number;
  data?: string;
  inicio?: string;
  nome?: string;
  agendamentoId?: string;
}

interface Resposta {
  texto: string;
  estado: Estado;
  dados: Dados;
}

const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const SIM = new Set(['1', 'sim', 's', 'confirmo', 'confirmar', 'ok']);
const NAO = new Set(['2', 'nao', 'n', 'cancelar', 'cancela']);

const reais = (c: number) => (c % 100 === 0 ? `R$ ${c / 100}` : `R$ ${(c / 100).toFixed(2).replace('.', ',')}`);

/**
 * Menu guiado, sem IA (spec 7.2): "1) Agendar, 2) Meus agendamentos". Usa as MESMAS regras do link público
 * (disponibilidade, antecedência, prazo, limite por WhatsApp), porque chama a mesma agenda. O estado de cada
 * conversa fica no banco e expira por inatividade.
 */
@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly agenda: AgendaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /** Uma mensagem recebida de `telefone` (forma canônica). Roda no contexto do salão. */
  async receber(telefone: string, textoBruto: string, agora = new Date()): Promise<void> {
    const texto = sem(textoBruto);
    const conversa = await this.prisma.db.conversaBot.findFirst({ where: { telefone } });
    const viva = conversa && agora.getTime() - conversa.atualizadaEm.getTime() < EXPIRA_CONVERSA_MS;
    let estado = (viva ? (conversa.estado as Estado) : 'MENU') as Estado;
    const dados = (viva ? (conversa.dados as Dados) : {}) as Dados;

    let resposta: Resposta;
    try {
      resposta = await this.decidir(telefone, texto, textoBruto, estado, dados, agora);
    } catch (e) {
      this.logger.error(`Bot falhou para ${telefone}: ${(e as Error).message}`);
      resposta = { texto: 'Tive um problema aqui. Tente de novo em instantes ou fale direto com o salão.', estado: 'MENU', dados: {} };
    }
    await this.prisma.db.conversaBot.upsert({
      where: { estabelecimentoId_telefone: { estabelecimentoId: this.tenant.atual()!, telefone } },
      create: comTenant({ telefone, estado: resposta.estado, dados: resposta.dados as object, atualizadaEm: agora }),
      update: { estado: resposta.estado, dados: resposta.dados as object, atualizadaEm: agora },
    });
    if (resposta.texto) await this.whatsapp.responder(telefone, resposta.texto);
  }

  private async decidir(telefone: string, texto: string, bruto: string, estado: Estado, dados: Dados, agora: Date): Promise<Resposta> {
    const salao = await this.agenda.salao();
    const menu = (prefixo = ''): Resposta => ({
      texto: `${prefixo}Olá! Sou o assistente de agendamento de ${salao.nome}. Responda com o número da opção:\n\n1) Agendar\n2) Meus agendamentos`,
      estado: 'MENU', dados: {},
    });

    if (['menu', 'inicio', 'comecar', 'recomecar'].includes(texto)) return menu();

    // Resposta ao lembrete ("1" confirma, "2" cancela) vale antes do menu, mas nunca no meio de um agendamento.
    if (estado === 'MENU' && (SIM.has(texto) || NAO.has(texto))) {
      const lembrado = await this.agendamentoComLembrete(telefone, agora);
      if (lembrado) return this.responderLembrete(lembrado.id, SIM.has(texto), salao);
    }

    if (estado === 'MENU') {
      if (texto === '1') return this.comecarAgendamento(salao, agora);
      if (texto === '2') return this.listarMeus(telefone, agora);
      return menu();
    }
    if (texto === '0' || texto === 'voltar') return menu();
    return this.passo(telefone, texto, bruto, estado, dados, salao, agora);
  }

  // ---------------------------------------------------------------- responder o lembrete

  private agendamentoComLembrete(telefone: string, agora: Date) {
    return this.prisma.db.agendamento.findFirst({
      where: { cliente: { whatsapp: telefone }, status: 'AGENDADO', confirmacao: 'PENDENTE', lembreteEnviadoEm: { not: null }, inicio: { gt: agora } },
      orderBy: { lembreteEnviadoEm: 'desc' },
      select: { id: true },
    });
  }

  private async responderLembrete(id: string, confirma: boolean, salao: Salao): Promise<Resposta> {
    try {
      if (confirma) {
        const a = await this.agenda.confirmarPresenca(id);
        return { texto: `Confirmado! Esperamos você ${quandoPorExtenso(a.inicio, salao.fusoHorario)}. Para outras opções, digite menu.`, estado: 'MENU', dados: {} };
      }
      await this.agenda.cancelarPeloCliente(id);
      return { texto: 'Pronto, cancelei o seu horário. Quando quiser marcar de novo, digite menu.', estado: 'MENU', dados: {} };
    } catch (e) {
      return { texto: this.mensagemDe(e), estado: 'MENU', dados: {} };
    }
  }

  // ---------------------------------------------------------------- agendar

  private async comecarAgendamento(salao: Salao, agora: Date): Promise<Resposta> {
    try {
      await this.agenda.exigirAgendaAberta('BOT');
    } catch (e) {
      return { texto: this.mensagemDe(e), estado: 'MENU', dados: {} };
    }
    const catalogo = await this.agenda.catalogo();
    if (!catalogo.length) return { texto: 'Ainda não tem horários abertos para marcar por aqui. Fale direto com o salão.', estado: 'MENU', dados: {} };
    if (catalogo.length === 1) return this.perguntarServico(catalogo[0].id, salao, agora);
    return {
      texto: `Com quem você quer marcar?\n\n${catalogo.map((p, i) => `${i + 1}) ${p.nome}`).join('\n')}\n\n0) Voltar`,
      estado: 'PROF', dados: { opcoes: catalogo.map((p) => p.id) },
    };
  }

  private async perguntarServico(profissionalId: string, _salao: Salao, _agora: Date): Promise<Resposta> {
    const prof = (await this.agenda.catalogo()).find((p) => p.id === profissionalId);
    if (!prof) return { texto: 'Esse profissional não está mais disponível. Digite menu para recomeçar.', estado: 'MENU', dados: {} };
    const servicos = [...prof.servicos].sort((a, b) => a.servico.nome.localeCompare(b.servico.nome, 'pt-BR'));
    return {
      texto: `O que você vai fazer com ${prof.nome}?\n\n${servicos.map((s, i) => `${i + 1}) ${s.servico.nome} (${s.servico.duracaoMin} min, ${reais(s.precoCentavos)})`).join('\n')}\n\n0) Voltar`,
      estado: 'SERV', dados: { profissionalId, opcoes: servicos.map((s) => s.servicoId) },
    };
  }

  private async perguntarDia(profissionalId: string, duracaoMin: number, salao: Salao, estado: 'DIA' | 'REM_DIA', base: Dados): Promise<Resposta> {
    const dias = (await this.agenda.diasDisponiveis(salao, {
      profissionalId, duracaoMin, regime: 'PUBLICO', ignorarAgendamentoId: estado === 'REM_DIA' ? base.agendamentoId : undefined,
    })).filter((d) => d.livre).slice(0, MAX_DIAS);
    if (!dias.length) return { texto: 'Não encontrei dias livres nos próximos meses. Fale direto com o salão.', estado: 'MENU', dados: {} };
    const hoje = hojeNoFuso(salao.fusoHorario);
    const rotulo = (d: string) => (d === hoje ? 'hoje' : DateTime.fromISO(d).setLocale('pt-BR').toFormat('ccc dd/MM'));
    return {
      texto: `Qual dia?\n\n${dias.map((d, i) => `${i + 1}) ${rotulo(d.data)}`).join('\n')}\n\n0) Voltar`,
      estado, dados: { ...base, opcoes: dias.map((d) => d.data) },
    };
  }

  private async perguntarHorario(salao: Salao, data: string, estado: 'HORA' | 'REM_HORA', base: Dados): Promise<Resposta> {
    const horarios = (await this.agenda.horarios(salao, {
      profissionalId: base.profissionalId!, duracaoMin: base.duracaoMin!, regime: 'PUBLICO',
      ignorarAgendamentoId: estado === 'REM_HORA' ? base.agendamentoId : undefined,
    }, data)).slice(0, MAX_HORARIOS);
    if (!horarios.length) return { texto: 'Esse dia acabou de lotar. Digite menu para escolher outro.', estado: 'MENU', dados: {} };
    return {
      texto: `Qual horário?\n\n${horarios.map((h, i) => `${i + 1}) ${h.hora}`).join('\n')}\n\n0) Voltar`,
      estado, dados: { ...base, data, opcoes: horarios.map((h) => h.inicio) },
    };
  }

  private escolha(texto: string, dados: Dados): string | null {
    const n = Number(texto);
    return Number.isInteger(n) && n >= 1 ? (dados.opcoes?.[n - 1] ?? null) : null;
  }

  private async passo(telefone: string, texto: string, bruto: string, estado: Estado, dados: Dados, salao: Salao, agora: Date): Promise<Resposta> {
    const repetir = (prefixo = 'Não entendi. '): Promise<Resposta> => this.reapresentar(telefone, estado, dados, salao, agora, prefixo);
    switch (estado) {
      case 'PROF': {
        const id = this.escolha(texto, dados);
        return id ? this.perguntarServico(id, salao, agora) : repetir();
      }
      case 'SERV': {
        const servicoId = this.escolha(texto, dados);
        if (!servicoId) return repetir();
        const prof = (await this.agenda.catalogo()).find((p) => p.id === dados.profissionalId);
        const duracaoMin = prof?.servicos.find((s) => s.servicoId === servicoId)?.servico.duracaoMin;
        if (!prof || !duracaoMin) return repetir('Esse serviço mudou. ');
        return this.perguntarDia(prof.id, duracaoMin, salao, 'DIA', { profissionalId: prof.id, servicoId, duracaoMin });
      }
      case 'DIA': {
        const data = this.escolha(texto, dados);
        return data ? this.perguntarHorario(salao, data, 'HORA', { ...dados, opcoes: undefined }) : repetir();
      }
      case 'HORA': {
        const inicio = this.escolha(texto, dados);
        if (!inicio) return repetir();
        const cliente = await this.prisma.db.cliente.findFirst({ where: { whatsapp: telefone } });
        const proximo: Dados = { ...dados, inicio, opcoes: undefined, nome: cliente?.nome };
        return cliente ? this.resumo(proximo, salao) : { texto: 'Para finalizar, qual é o seu nome?', estado: 'NOME', dados: proximo };
      }
      case 'NOME': {
        if (bruto.trim().length < 2) return { texto: 'Qual é o seu nome?', estado: 'NOME', dados };
        return this.resumo({ ...dados, nome: this.nomeBonito(bruto) }, salao);
      }
      case 'CONFIRMAR': {
        if (NAO.has(texto)) return { texto: 'Tudo bem, não marquei nada. Digite menu para recomeçar.', estado: 'MENU', dados: {} };
        if (!SIM.has(texto)) return repetir();
        try {
          await this.agenda.reservar({
            profissionalId: dados.profissionalId!, servicoId: dados.servicoId!, inicio: new Date(dados.inicio!),
            nome: dados.nome!, whatsapp: telefone, origem: OrigemAgendamento.BOT,
          });
          // A confirmação (com o link) sai pela fila logo em seguida: é a resposta a esta conversa.
          return { texto: '', estado: 'MENU', dados: {} };
        } catch (e) {
          const msg = this.mensagemDe(e);
          if (e instanceof HttpException && e.getStatus() === 409) {
            const voltar = await this.perguntarHorario(salao, dados.data!, 'HORA', { ...dados, opcoes: undefined });
            return { ...voltar, texto: `${msg}\n\n${voltar.texto}` };
          }
          return { texto: `${msg} Digite menu para recomeçar.`, estado: 'MENU', dados: {} };
        }
      }
      case 'MEUS': {
        const id = this.escolha(texto, dados);
        if (!id) return repetir();
        return { texto: '1) Remarcar\n2) Cancelar\n3) Voltar ao menu', estado: 'ACAO', dados: { agendamentoId: id } };
      }
      case 'ACAO': {
        if (texto === '3') return { texto: 'Digite menu para ver as opções.', estado: 'MENU', dados: {} };
        if (texto === '2') {
          try {
            await this.agenda.cancelarPeloCliente(dados.agendamentoId!);
            return { texto: 'Pronto, cancelei o seu horário. Para marcar outro, digite menu.', estado: 'MENU', dados: {} };
          } catch (e) {
            return { texto: `${this.mensagemDe(e)} Digite menu para outras opções.`, estado: 'MENU', dados: {} };
          }
        }
        if (texto === '1') {
          const a = await this.agenda.obterAgendamento(dados.agendamentoId!);
          try {
            this.agenda.exigirPodeAlterar(a, salao, agora);
          } catch (e) {
            return { texto: `${this.mensagemDe(e)} Digite menu para outras opções.`, estado: 'MENU', dados: {} };
          }
          return this.perguntarDia(a.profissionalId, a.duracaoMin, salao, 'REM_DIA', { agendamentoId: a.id, profissionalId: a.profissionalId, duracaoMin: a.duracaoMin });
        }
        return repetir();
      }
      case 'REM_DIA': {
        const data = this.escolha(texto, dados);
        return data ? this.perguntarHorario(salao, data, 'REM_HORA', { ...dados, opcoes: undefined }) : repetir();
      }
      case 'REM_HORA': {
        const inicio = this.escolha(texto, dados);
        if (!inicio) return repetir();
        return {
          texto: `Remarcar para ${quandoPorExtenso(new Date(inicio), salao.fusoHorario)}?\n\n1) Confirmar\n2) Cancelar`,
          estado: 'REM_CONFIRMAR', dados: { ...dados, inicio, opcoes: undefined },
        };
      }
      case 'REM_CONFIRMAR': {
        if (NAO.has(texto)) return { texto: 'Tudo bem, mantive o horário como estava. Digite menu para outras opções.', estado: 'MENU', dados: {} };
        if (!SIM.has(texto)) return repetir();
        try {
          await this.agenda.remarcarPeloCliente(dados.agendamentoId!, new Date(dados.inicio!));
          return { texto: '', estado: 'MENU', dados: {} }; // a confirmação do novo horário sai pela fila
        } catch (e) {
          return { texto: `${this.mensagemDe(e)} Digite menu para recomeçar.`, estado: 'MENU', dados: {} };
        }
      }
      default:
        return repetir();
    }
  }

  private async resumo(d: Dados, salao: Salao): Promise<Resposta> {
    const prof = (await this.agenda.catalogo()).find((p) => p.id === d.profissionalId);
    const sv = prof?.servicos.find((s) => s.servicoId === d.servicoId);
    return {
      texto: [
        'Confira:',
        `${sv?.servico.nome} com ${prof?.nome} (${reais(sv?.precoCentavos ?? 0)})`,
        quandoPorExtenso(new Date(d.inicio!), salao.fusoHorario),
        `Para ${d.nome}`,
        '',
        'Ao confirmar, você concorda em usar seu nome e WhatsApp para este agendamento e para receber avisos sobre ele.',
        '',
        '1) Confirmar',
        '2) Cancelar',
      ].join('\n'),
      estado: 'CONFIRMAR', dados: { ...d, opcoes: undefined },
    };
  }

  private nomeBonito(nome: string): string {
    const particulas = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
    return nome.trim().split(/\s+/)
      .map((p, i) => (i > 0 && particulas.has(p.toLowerCase()) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
      .join(' ').slice(0, 80);
  }

  /** Apresenta de novo o passo atual quando a resposta não bateu com nenhuma opção. */
  private async reapresentar(telefone: string, estado: Estado, dados: Dados, salao: Salao, agora: Date, prefixo: string): Promise<Resposta> {
    let r: Resposta;
    switch (estado) {
      case 'PROF': r = await this.comecarAgendamento(salao, agora); break;
      case 'SERV': r = await this.perguntarServico(dados.profissionalId!, salao, agora); break;
      case 'DIA': r = await this.perguntarDia(dados.profissionalId!, dados.duracaoMin!, salao, 'DIA', { profissionalId: dados.profissionalId, servicoId: dados.servicoId, duracaoMin: dados.duracaoMin }); break;
      case 'HORA': r = await this.perguntarHorario(salao, dados.data!, 'HORA', { ...dados, opcoes: undefined }); break;
      case 'MEUS': r = await this.listarMeus(telefone, agora); break;
      case 'ACAO': return { texto: `${prefixo}1) Remarcar\n2) Cancelar\n3) Voltar ao menu`, estado, dados };
      case 'CONFIRMAR': case 'REM_CONFIRMAR': return { texto: `${prefixo}Responda 1 para confirmar ou 2 para cancelar.`, estado, dados };
      case 'REM_DIA': r = await this.perguntarDia(dados.profissionalId!, dados.duracaoMin!, salao, 'REM_DIA', { agendamentoId: dados.agendamentoId, profissionalId: dados.profissionalId, duracaoMin: dados.duracaoMin }); break;
      case 'REM_HORA': r = await this.perguntarHorario(salao, dados.data!, 'REM_HORA', { ...dados, opcoes: undefined }); break;
      default: return { texto: 'Digite menu para ver as opções.', estado: 'MENU', dados: {} };
    }
    return { ...r, texto: `${prefixo}${r.texto}` };
  }

  // ---------------------------------------------------------------- meus agendamentos

  private async listarMeus(telefone: string, agora: Date): Promise<Resposta> {
    const lista = await this.prisma.db.agendamento.findMany({
      where: { cliente: { whatsapp: telefone }, status: 'AGENDADO', inicio: { gt: agora } },
      orderBy: { inicio: 'asc' }, take: MAX_MEUS,
      include: { servico: { select: { nome: true } }, profissional: { select: { nome: true } } },
    });
    if (!lista.length) return { texto: 'Você não tem horários marcados. Para marcar um, digite menu e escolha 1.', estado: 'MENU', dados: {} };
    const { fusoHorario } = await this.agenda.salao();
    return {
      texto: `Seus horários:\n\n${lista.map((a, i) => `${i + 1}) ${quandoPorExtenso(a.inicio, fusoHorario)}, ${a.servico.nome} com ${a.profissional.nome}`).join('\n')}\n\nResponda com o número para remarcar ou cancelar.\n0) Voltar`,
      estado: 'MEUS', dados: { opcoes: lista.map((a) => a.id) },
    };
  }

  private mensagemDe(e: unknown): string {
    if (e instanceof ForbiddenException || e instanceof HttpException) {
      const r = e.getResponse();
      const msg = typeof r === 'string' ? r : (r as { message?: string | string[] }).message;
      return Array.isArray(msg) ? msg[0] : (msg ?? 'Não foi possível.');
    }
    return 'Não foi possível agora. Tente de novo em instantes.';
  }
}
