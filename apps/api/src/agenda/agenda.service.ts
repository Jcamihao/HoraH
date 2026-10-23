import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CanceladoPor, HORIZONTE_MANUAL_DIAS, HORIZONTE_PUBLICO_DIAS, MAX_AGENDAMENTOS_FUTUROS_POR_WHATSAPP,
  normalizarWhatsapp, OrigemAgendamento, StatusAgendamento,
  type AgendamentoDto, type AgendaDto, type BloqueioDto, type DiaDisponivelDto, type MeuAgendamentoDto, type SlotDto,
} from '@hora-h/shared';
import { AssinaturaService } from '../assinatura/assinatura.service';
import { novoTokenOpaco } from '../auth/sessao.service';
import { TenantContext } from '../common/tenant-context';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { comTenant, PrismaService } from '../prisma/prisma.service';
import { slotsDoDia, type Slot } from './disponibilidade';
import { dataLocal, dataValida, diaDaSemana, diasEntre, hojeNoFuso, limitesDoDia, somarDias } from './tempo';

const MS_MIN = 60_000;
const INDISPONIVEL = 'Esse horário não está mais disponível. Escolha outro.';
const MUDOU = 'Este agendamento mudou. Atualize a tela e tente de novo.';
/** Janela máxima de uma consulta de agenda (a tela mostra no máximo uma semana; folga para mês). */
const MAX_DIAS_CONSULTA = 62;

const INCLUIR = {
  profissional: { select: { id: true, nome: true } },
  servico: { select: { id: true, nome: true } },
  cliente: { select: { id: true, nome: true, whatsapp: true } },
} satisfies Prisma.AgendamentoInclude;

export type AgendamentoCompleto = Prisma.AgendamentoGetPayload<{ include: typeof INCLUIR }>;

export interface Salao {
  id: string;
  nome: string;
  slug: string;
  fusoHorario: string;
  antecedenciaMinMin: number;
  prazoCancelamentoMin: number;
}

/**
 * Quem está marcando muda as regras: o cliente na página pública respeita antecedência mínima e
 * horizonte curto; o dono/profissional no painel marca "de última hora" (cliente que acabou de
 * chegar) e com mais folga de data.
 */
export type Regime = 'PUBLICO' | 'MANUAL';

export interface ConsultaSlots {
  profissionalId: string;
  duracaoMin: number;
  regime: Regime;
  /** Remarcação: o próprio agendamento não pode atrapalhar o novo horário dele. */
  ignorarAgendamentoId?: string;
  agora?: Date;
}

/** Violação da constraint de exclusão do Postgres (23P01): outro agendamento ocupou o horário. */
export function ehConflitoDeHorario(e: unknown): boolean {
  const texto = e instanceof Error ? e.message : '';
  return /agendamentos_sem_sobreposicao_excl|exclusion constraint|\b23P01\b/i.test(texto);
}

export function paraAgendamentoDto(a: AgendamentoCompleto): AgendamentoDto {
  return {
    id: a.id,
    inicio: a.inicio.toISOString(),
    fim: a.fim.toISOString(),
    status: a.status,
    confirmacao: a.confirmacao,
    origem: a.origem,
    precoCentavos: a.precoCentavos,
    duracaoMin: a.duracaoMin,
    profissional: a.profissional,
    servico: a.servico,
    cliente: a.cliente,
  };
}

export function paraMeuAgendamentoDto(a: AgendamentoCompleto, salao: Salao, agora: Date): MeuAgendamentoDto {
  const limite = new Date(a.inicio.getTime() - salao.prazoCancelamentoMin * MS_MIN);
  return {
    inicio: a.inicio.toISOString(),
    fim: a.fim.toISOString(),
    status: a.status,
    precoCentavos: a.precoCentavos,
    duracaoMin: a.duracaoMin,
    clienteNome: a.cliente.nome,
    salao: { nome: salao.nome, slug: salao.slug, fusoHorario: salao.fusoHorario },
    profissional: a.profissional,
    servico: a.servico,
    limiteAlteracao: limite.toISOString(),
    podeAlterar: a.status === StatusAgendamento.AGENDADO && agora <= limite && a.inicio > agora,
  };
}

/** O que cada status pode virar (o painel confirma antes; "desfazer" um toque errado é permitido). */
const TRANSICOES: Record<StatusAgendamento, StatusAgendamento[]> = {
  AGENDADO: ['CONCLUIDO', 'FALTOU', 'CANCELADO'],
  CONCLUIDO: ['AGENDADO', 'FALTOU'],
  FALTOU: ['AGENDADO', 'CONCLUIDO'],
  CANCELADO: ['AGENDADO'],
};

@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly assinatura: AssinaturaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /** Assinatura bloqueada: nenhum agendamento novo, venha de onde vier (link, bot ou painel). */
  async exigirAgendaAberta(origem: 'LINK' | 'BOT' | 'MANUAL' = 'LINK'): Promise<void> {
    if ((await this.assinatura.acesso()).acesso === 'LIBERADO') return;
    throw new ForbiddenException(
      origem === 'MANUAL'
        ? 'A assinatura do salão está pendente. Regularize o pagamento para voltar a marcar horários.'
        : 'Este salão não está recebendo agendamentos online no momento. Fale direto com o salão.',
    );
  }

  async agendaAberta(): Promise<boolean> {
    return (await this.assinatura.acesso()).acesso === 'LIBERADO';
  }

  async salao(): Promise<Salao> {
    const id = this.tenant.atual();
    if (!id) throw new Error('Sem tenant no contexto.');
    const e = await this.prisma.db.estabelecimento.findUnique({
      where: { id },
      select: { id: true, nome: true, slug: true, fusoHorario: true, antecedenciaMinMin: true, prazoCancelamentoMin: true },
    });
    if (!e) throw new NotFoundException('Estabelecimento não encontrado.');
    return e;
  }

  // ---------------------------------------------------------------- disponibilidade

  private horizonte(regime: Regime): number {
    return regime === 'PUBLICO' ? HORIZONTE_PUBLICO_DIAS : HORIZONTE_MANUAL_DIAS;
  }

  private inicioMinimo(salao: Salao, c: ConsultaSlots, agora: Date): Date {
    return c.regime === 'PUBLICO'
      ? new Date(agora.getTime() + salao.antecedenciaMinMin * MS_MIN)
      : new Date(agora.getTime() - c.duracaoMin * MS_MIN + 1); // ainda não terminou: serve para quem já chegou
  }

  /** Faixas de trabalho (por dia da semana) e o que já ocupa a agenda do profissional na janela [de, ate]. */
  private async carregar(salao: Salao, c: ConsultaSlots, de: string, ate: string) {
    const janela = { inicio: limitesDoDia(salao.fusoHorario, de).inicio, fim: limitesDoDia(salao.fusoHorario, ate).fim };
    const [horarios, agendamentos, bloqueios] = await Promise.all([
      this.prisma.db.horarioTrabalho.findMany({ where: { profissionalId: c.profissionalId } }),
      this.prisma.db.agendamento.findMany({
        where: {
          profissionalId: c.profissionalId,
          status: { not: StatusAgendamento.CANCELADO },
          inicio: { lt: janela.fim },
          fim: { gt: janela.inicio },
          ...(c.ignorarAgendamentoId ? { id: { not: c.ignorarAgendamentoId } } : {}),
        },
        select: { inicio: true, fim: true },
      }),
      this.prisma.db.bloqueio.findMany({
        where: { profissionalId: c.profissionalId, inicio: { lt: janela.fim }, fim: { gt: janela.inicio } },
        select: { inicio: true, fim: true },
      }),
    ]);
    return { horarios, ocupados: [...agendamentos, ...bloqueios] };
  }

  async slotsDoDia(salao: Salao, c: ConsultaSlots, data: string): Promise<Slot[]> {
    if (!dataValida(data)) throw new BadRequestException('Data inválida.');
    const agora = c.agora ?? new Date();
    const hoje = hojeNoFuso(salao.fusoHorario, agora);
    if (data < hoje || diasEntre(hoje, data) > this.horizonte(c.regime)) return [];
    const { horarios, ocupados } = await this.carregar(salao, c, data, data);
    const dia = diaDaSemana(data);
    return slotsDoDia({
      fuso: salao.fusoHorario,
      data,
      faixas: horarios.filter((h) => h.diaSemana === dia),
      ocupados,
      duracaoMin: c.duracaoMin,
      inicioMinimo: this.inicioMinimo(salao, c, agora),
    });
  }

  async horarios(salao: Salao, c: ConsultaSlots, data: string): Promise<SlotDto[]> {
    const slots = await this.slotsDoDia(salao, c, data);
    return slots.map((s) => ({ inicio: s.inicio.toISOString(), hora: s.hora }));
  }

  /** Do dia de hoje até o fim do horizonte: quais dias têm pelo menos um horário livre. */
  async diasDisponiveis(salao: Salao, c: ConsultaSlots): Promise<DiaDisponivelDto[]> {
    const agora = c.agora ?? new Date();
    const hoje = hojeNoFuso(salao.fusoHorario, agora);
    const ultimo = somarDias(hoje, this.horizonte(c.regime));
    const { horarios, ocupados } = await this.carregar(salao, c, hoje, ultimo);
    const inicioMinimo = this.inicioMinimo(salao, c, agora);

    const dias: DiaDisponivelDto[] = [];
    for (let data = hoje; data <= ultimo; data = somarDias(data, 1)) {
      const dia = diaDaSemana(data);
      const livre = slotsDoDia({
        fuso: salao.fusoHorario,
        data,
        faixas: horarios.filter((h) => h.diaSemana === dia),
        ocupados,
        duracaoMin: c.duracaoMin,
        inicioMinimo,
      }).length > 0;
      dias.push({ data, livre });
    }
    return dias;
  }

  // ---------------------------------------------------------------- marcar

  /** Profissional ativo, serviço ativo e o vínculo entre eles (com o preço daquele profissional). */
  async servicoDoProfissional(profissionalId: string, servicoId: string) {
    const vinculo = await this.prisma.db.profissionalServico.findFirst({
      where: { profissionalId, servicoId, profissional: { ativo: true }, servico: { ativo: true } },
      include: { servico: { select: { duracaoMin: true } } },
    });
    if (!vinculo) throw new NotFoundException('Este profissional não faz este serviço.');
    return { precoCentavos: vinculo.precoCentavos, duracaoMin: vinculo.servico.duracaoMin };
  }

  private async obterCliente(nome: string, whatsapp: string) {
    const upsert = () =>
      this.prisma.db.cliente.upsert({
        where: { estabelecimentoId_whatsapp: { estabelecimentoId: this.tenant.atual()!, whatsapp } },
        create: comTenant({ nome, whatsapp }),
        update: { nome },
      });
    try {
      return await upsert();
    } catch (e) {
      // Dois toques seguidos no "confirmar" criam o mesmo cliente ao mesmo tempo: a perdedora relê.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return upsert();
      throw e;
    }
  }

  async reservar(p: {
    profissionalId: string;
    servicoId: string;
    inicio: Date;
    nome: string;
    whatsapp: string;
    origem: typeof OrigemAgendamento.LINK | typeof OrigemAgendamento.MANUAL;
  }): Promise<AgendamentoCompleto> {
    const whatsapp = normalizarWhatsapp(p.whatsapp);
    if (!whatsapp) throw new BadRequestException('Informe o WhatsApp com DDD. Exemplo: (11) 99999-8888.');

    await this.exigirAgendaAberta(p.origem);
    const salao = await this.salao();
    const { precoCentavos, duracaoMin } = await this.servicoDoProfissional(p.profissionalId, p.servicoId);
    const regime: Regime = p.origem === OrigemAgendamento.LINK ? 'PUBLICO' : 'MANUAL';

    // Uma única regra de "pode marcar aqui?": o horário tem que ser um dos que a própria lista oferece.
    const livres = await this.slotsDoDia(
      salao,
      { profissionalId: p.profissionalId, duracaoMin, regime },
      dataLocal(salao.fusoHorario, p.inicio),
    );
    if (!livres.some((s) => s.inicio.getTime() === p.inicio.getTime())) throw new ConflictException(INDISPONIVEL);

    const cliente = await this.obterCliente(p.nome, whatsapp);
    const agora = new Date();
    if (p.origem === OrigemAgendamento.LINK) {
      // Limite brando contra spam (a página pública não verifica o WhatsApp). O dono, no painel, não tem teto.
      const futuros = await this.prisma.db.agendamento.count({
        where: { clienteId: cliente.id, status: StatusAgendamento.AGENDADO, inicio: { gt: agora } },
      });
      if (futuros >= MAX_AGENDAMENTOS_FUTUROS_POR_WHATSAPP) {
        throw new ConflictException(
          `Você já tem ${MAX_AGENDAMENTOS_FUTUROS_POR_WHATSAPP} horários marcados neste salão. Cancele um para marcar outro.`,
        );
      }
    }

    try {
      const criado = await this.prisma.db.agendamento.create({
        data: comTenant({
          profissionalId: p.profissionalId,
          servicoId: p.servicoId,
          clienteId: cliente.id,
          inicio: p.inicio,
          fim: new Date(p.inicio.getTime() + duracaoMin * MS_MIN),
          precoCentavos,
          duracaoMin,
          origem: p.origem,
          token: novoTokenOpaco(),
          consentimentoEm: p.origem === OrigemAgendamento.LINK ? agora : null,
        }),
        include: INCLUIR,
      });
      // Quem lançou no painel já sabe; o dono só é avisado do que veio de fora (link, bot).
      if (p.origem !== OrigemAgendamento.MANUAL) this.notificacoes.agendamentoCriado(criado);
      return criado;
    } catch (e) {
      // Duas marcações no mesmo instante passam pela checagem acima; quem decide é o banco.
      if (ehConflitoDeHorario(e)) throw new ConflictException(INDISPONIVEL);
      throw e;
    }
  }

  // ---------------------------------------------------------------- consultar

  async obterAgendamento(id: string, profissionalId: string | null = null): Promise<AgendamentoCompleto> {
    const a = await this.prisma.db.agendamento.findFirst({
      where: { id, ...(profissionalId ? { profissionalId } : {}) },
      include: INCLUIR,
    });
    // Agendamento de outro profissional (ou de outro salão) é "não encontrado", não "proibido".
    if (!a) throw new NotFoundException('Agendamento não encontrado.');
    return a;
  }

  /** Datas "YYYY-MM-DD" do fuso do salão -> intervalo de instantes [início do 1º dia, fim do último). */
  janelaDeDatas(salao: Salao, de: string, ate: string): { inicio: Date; fim: Date } {
    if (!dataValida(de) || !dataValida(ate)) throw new BadRequestException('Data inválida.');
    if (ate < de) throw new BadRequestException('A data final deve ser depois da inicial.');
    if (diasEntre(de, ate) >= MAX_DIAS_CONSULTA) throw new BadRequestException(`Consulte no máximo ${MAX_DIAS_CONSULTA} dias por vez.`);
    return { inicio: limitesDoDia(salao.fusoHorario, de).inicio, fim: limitesDoDia(salao.fusoHorario, ate).fim };
  }

  async agenda(de: string, ate: string, profissionalId: string | null): Promise<AgendaDto> {
    const salao = await this.salao();
    const janela = this.janelaDeDatas(salao, de, ate);
    const doProfissional = profissionalId ? { profissionalId } : {};
    const [agendamentos, bloqueios] = await Promise.all([
      this.prisma.db.agendamento.findMany({
        where: { ...doProfissional, inicio: { gte: janela.inicio, lt: janela.fim } },
        include: INCLUIR,
        orderBy: { inicio: 'asc' },
      }),
      this.prisma.db.bloqueio.findMany({
        where: { ...doProfissional, inicio: { lt: janela.fim }, fim: { gt: janela.inicio } },
        orderBy: { inicio: 'asc' },
      }),
    ]);
    return { agendamentos: agendamentos.map(paraAgendamentoDto), bloqueios: bloqueios.map(paraBloqueioDto) };
  }

  // ---------------------------------------------------------------- mudar

  /** Painel (dono ou profissional): concluído, faltou, cancelado, ou desfazer um toque errado. */
  async alterarStatus(id: string, novo: StatusAgendamento, profissionalId: string | null): Promise<AgendamentoCompleto> {
    const atual = await this.obterAgendamento(id, profissionalId);
    if (atual.status === novo) return atual;
    if (!TRANSICOES[atual.status].includes(novo)) {
      throw new ConflictException('Esta mudança de situação não é permitida. Reabra o agendamento primeiro.');
    }
    const agora = new Date();
    if ((novo === StatusAgendamento.CONCLUIDO || novo === StatusAgendamento.FALTOU) && atual.inicio > agora) {
      throw new BadRequestException('Só dá para marcar como concluído ou faltou depois que o horário começa.');
    }
    if (atual.status === StatusAgendamento.CANCELADO && novo === StatusAgendamento.AGENDADO && atual.inicio <= agora) {
      throw new BadRequestException('O horário já passou. Faça um novo agendamento.');
    }
    return this.gravarStatus(atual, novo, novo === StatusAgendamento.CANCELADO ? CanceladoPor.PAINEL : null, agora);
  }

  private async gravarStatus(
    atual: AgendamentoCompleto,
    novo: StatusAgendamento,
    por: CanceladoPor | null,
    agora: Date,
    extra: Prisma.AgendamentoUpdateInput = {},
  ): Promise<AgendamentoCompleto> {
    const cancelando = novo === StatusAgendamento.CANCELADO;
    try {
      // `status` no where: se alguém mudou o agendamento no meio do caminho, não sobrescrevemos às cegas.
      return await this.prisma.db.agendamento.update({
        where: { id: atual.id, status: atual.status },
        data: { status: novo, canceladoEm: cancelando ? agora : null, canceladoPor: cancelando ? por : null, ...extra },
        include: INCLUIR,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new ConflictException(MUDOU);
      // Reabrir um cancelado cujo horário foi ocupado nesse meio tempo.
      if (ehConflitoDeHorario(e)) throw new ConflictException('Esse horário já foi ocupado por outro agendamento.');
      throw e;
    }
  }

  /** Cliente pelo link único: só respeita o prazo de cancelamento do salão. */
  async cancelarPeloCliente(id: string): Promise<AgendamentoCompleto> {
    const [salao, atual] = await Promise.all([this.salao(), this.obterAgendamento(id)]);
    const agora = new Date();
    this.exigirPodeAlterar(atual, salao, agora);
    const cancelado = await this.gravarStatus(atual, StatusAgendamento.CANCELADO, CanceladoPor.CLIENTE, agora);
    this.notificacoes.agendamentoCancelado(cancelado, CanceladoPor.CLIENTE);
    return cancelado;
  }

  /** Cliente pelo link único: muda só o dia e a hora (mesmo profissional e serviço), dentro do prazo. */
  async remarcarPeloCliente(id: string, novoInicio: Date): Promise<AgendamentoCompleto> {
    const [salao, atual] = await Promise.all([this.salao(), this.obterAgendamento(id)]);
    const agora = new Date();
    this.exigirPodeAlterar(atual, salao, agora);
    if (novoInicio.getTime() === atual.inicio.getTime()) return atual;

    const livres = await this.slotsDoDia(
      salao,
      { profissionalId: atual.profissionalId, duracaoMin: atual.duracaoMin, regime: 'PUBLICO', ignorarAgendamentoId: atual.id, agora },
      dataLocal(salao.fusoHorario, novoInicio),
    );
    if (!livres.some((s) => s.inicio.getTime() === novoInicio.getTime())) throw new ConflictException(INDISPONIVEL);

    try {
      return await this.prisma.db.agendamento.update({
        where: { id: atual.id, status: StatusAgendamento.AGENDADO },
        // Mudou o horário: a confirmação anterior não vale mais para o novo.
        data: { inicio: novoInicio, fim: new Date(novoInicio.getTime() + atual.duracaoMin * MS_MIN), confirmacao: 'PENDENTE' },
        include: INCLUIR,
      });
    } catch (e) {
      if (ehConflitoDeHorario(e)) throw new ConflictException(INDISPONIVEL);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new ConflictException(MUDOU);
      throw e;
    }
  }

  exigirPodeAlterar(a: AgendamentoCompleto, salao: Salao, agora: Date): void {
    if (a.status !== StatusAgendamento.AGENDADO || a.inicio <= agora) {
      throw new ConflictException('Este agendamento não pode mais ser alterado.');
    }
    const limite = a.inicio.getTime() - salao.prazoCancelamentoMin * MS_MIN;
    if (agora.getTime() > limite) {
      throw new ConflictException('O prazo para alterar sozinho já passou. Fale com o salão.');
    }
  }
}

export function paraBloqueioDto(b: { id: string; profissionalId: string; inicio: Date; fim: Date; motivo: string | null }): BloqueioDto {
  return {
    id: b.id,
    profissionalId: b.profissionalId,
    inicio: b.inicio.toISOString(),
    fim: b.fim.toISOString(),
    motivo: b.motivo,
  };
}
