import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import {
  AVISO_FIM_TESTE_DIAS, CODIGO_FAIXA_MUDA, faixaDe, Papel, planoDaFaixa, StatusAssinatura, StatusCobranca, tipoCpfCnpj, somenteDigitos,
  type AssinaturaDetalheDto, type CobrancaDto, type FaixaMudaDto,
} from '@hora-h/shared';
import { TenantContext } from '../common/tenant-context';
import { AvisosService } from '../mail/avisos.service';
import { emails } from '../mail/templates';
import { comTenant, PrismaService } from '../prisma/prisma.service';
import {
  calcularAcesso, fimDaToleranciaPorTeste, fimDaToleranciaPorVencimento, type EstadoAcesso,
} from './acesso';
import { AsaasClient, type AsaasPagamento } from './asaas.client';

const DIA_MS = 86_400_000;
/** O Asaas conta datas no horário de Brasília, seja qual for o fuso do salão. */
const FUSO_ASAAS = 'America/Sao_Paulo';

const dataIso = (d: Date) => d.toISOString().slice(0, 10);

/** Situação do Asaas -> a nossa. Estados que não conhecemos ficam como pendente (nunca liberam acesso). */
export function statusDaCobranca(statusAsaas: string): StatusCobranca {
  switch (statusAsaas) {
    case 'RECEIVED': case 'CONFIRMED': case 'RECEIVED_IN_CASH': return StatusCobranca.PAGA;
    case 'OVERDUE': return StatusCobranca.VENCIDA;
    case 'REFUNDED': case 'REFUND_REQUESTED': case 'REFUND_IN_PROGRESS':
    case 'CHARGEBACK_REQUESTED': case 'CHARGEBACK_DISPUTE': case 'AWAITING_CHARGEBACK_REVERSAL': return StatusCobranca.ESTORNADA;
    case 'DELETED': return StatusCobranca.CANCELADA;
    default: return StatusCobranca.PENDENTE;
  }
}

@Injectable()
export class AssinaturaService {
  private readonly logger = new Logger(AssinaturaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly asaas: AsaasClient,
    private readonly avisos: AvisosService,
  ) {}

  private get tenantId(): string {
    const id = this.tenant.atual();
    if (!id) throw new Error('Sem tenant no contexto.');
    return id;
  }

  private async carregar() {
    const a = await this.prisma.db.assinatura.findFirst();
    if (!a) throw new NotFoundException('Assinatura não encontrada.');
    return a;
  }

  private async salao() {
    const e = await this.prisma.db.estabelecimento.findFirstOrThrow({ select: { nome: true, fusoHorario: true } });
    return e;
  }

  private profissionaisAtivos(): Promise<number> {
    return this.prisma.db.profissional.count({ where: { ativo: true } });
  }

  private async donoEmail(): Promise<string | null> {
    const dono = await this.prisma.db.usuario.findFirst({ where: { papel: Papel.DONO, ativo: true }, orderBy: { createdAt: 'asc' }, select: { email: true } });
    return dono?.email ?? null;
  }

  private linkAssinatura(): string {
    return this.avisos.link('/painel/assinatura');
  }

  // ---------------------------------------------------------------- acesso

  /** Usado pelo guard do painel e pela página pública: um salão em dia (ou na tolerância) está LIBERADO. */
  async acesso(agora = new Date()): Promise<EstadoAcesso> {
    return calcularAcesso(await this.carregar(), agora);
  }

  // ---------------------------------------------------------------- tela

  async obter(agora = new Date()): Promise<AssinaturaDetalheDto> {
    const [a, ativos, cobrancas] = await Promise.all([
      this.carregar(),
      this.profissionaisAtivos(),
      this.prisma.db.cobranca.findMany({ orderBy: { vencimento: 'desc' }, take: 12 }),
    ]);
    const estado = calcularAcesso(a, agora);
    const plano = faixaDe(ativos);
    const contratada = !!a.asaasSubscriptionId && !a.cancelaEm;
    // Cobrança para pagar agora: a vencida mais antiga, senão a pendente mais próxima.
    const emAberto = [...cobrancas]
      .filter((c) => c.status === StatusCobranca.VENCIDA || c.status === StatusCobranca.PENDENTE)
      .sort((x, y) => Number(y.status === StatusCobranca.VENCIDA) - Number(x.status === StatusCobranca.VENCIDA) || x.vencimento.getTime() - y.vencimento.getTime());
    return {
      status: estado.status,
      acesso: estado.acesso,
      testeFimEm: a.testeFimEm?.toISOString() ?? null,
      toleranciaFimEm: estado.toleranciaFimEm?.toISOString() ?? null,
      profissionaisAtivos: ativos,
      faixa: plano.faixa,
      valorCentavos: plano.valorCentavos,
      contratada,
      faixaContratada: contratada ? a.faixaContratada : null,
      valorContratadoCentavos: contratada && a.faixaContratada ? planoDaFaixa(a.faixaContratada).valorCentavos : null,
      proximaCobrancaEm: contratada && a.proximaCobrancaEm ? dataIso(a.proximaCobrancaEm) : null,
      cancelaEm: a.cancelaEm?.toISOString() ?? null,
      pagamentoUrl: emAberto[0]?.url ?? null,
      cobrancas: cobrancas.map((c): CobrancaDto => ({
        id: c.id, valorCentavos: c.valorCentavos, vencimento: dataIso(c.vencimento), status: c.status as StatusCobranca,
        pagaEm: c.pagaEm?.toISOString() ?? null, url: c.url,
      })),
      cobrancaConfigurada: this.asaas.configurado(),
    };
  }

  // ---------------------------------------------------------------- assinar e cancelar

  async assinar(cpfCnpjBruto: string, agora = new Date()): Promise<AssinaturaDetalheDto> {
    const a = await this.carregar();
    if (a.asaasSubscriptionId && !a.cancelaEm) throw new ConflictException('Você já tem uma assinatura ativa.');
    if (!this.asaas.configurado()) throw new BadRequestException('A cobrança ainda não está configurada neste ambiente.');
    const tipo = tipoCpfCnpj(cpfCnpjBruto);
    if (!tipo) throw new BadRequestException('Informe um CPF ou CNPJ válido.');
    const cpfCnpj = somenteDigitos(cpfCnpjBruto);

    const [salao, dono, ativos] = await Promise.all([
      this.salao(),
      this.prisma.db.usuario.findFirstOrThrow({ where: { papel: Papel.DONO, ativo: true }, orderBy: { createdAt: 'asc' }, select: { nome: true, email: true } }),
      this.profissionaisAtivos(),
    ]);
    const plano = faixaDe(ativos);

    let clienteId = a.asaasCustomerId;
    if (!clienteId) {
      clienteId = (await this.asaas.criarCliente({
        nome: tipo === 'cnpj' ? salao.nome : dono.nome, email: dono.email, cpfCnpj, referencia: this.tenantId,
      })).id;
      await this.prisma.db.assinatura.update({ where: { estabelecimentoId: this.tenantId }, data: { asaasCustomerId: clienteId } });
    }

    // Durante o teste a primeira cobrança só vence no fim dele; com o teste vencido, vence hoje.
    const hojeAsaas = DateTime.fromJSDate(agora, { zone: FUSO_ASAAS }).toISODate()!;
    const fimTeste = a.testeFimEm ? DateTime.fromJSDate(a.testeFimEm, { zone: FUSO_ASAAS }).toISODate()! : hojeAsaas;
    const emTeste = a.status === StatusAssinatura.TESTE && !!a.testeFimEm && agora <= a.testeFimEm;
    const primeiroVencimento = emTeste && fimTeste > hojeAsaas ? fimTeste : hojeAsaas;

    // Se uma tentativa anterior criou a assinatura no Asaas mas não conseguiu gravar aqui, adota em vez de duplicar.
    const existente = await this.asaas.buscarAssinaturaPorReferencia(this.tenantId);
    const criada = existente ?? (await this.asaas.criarAssinatura({
      clienteId, valorCentavos: plano.valorCentavos, primeiroVencimento, descricao: `Hora H: ${plano.rotulo}`, referencia: this.tenantId,
    }));

    await this.prisma.db.assinatura.update({
      where: { estabelecimentoId: this.tenantId },
      data: {
        asaasSubscriptionId: criada.id, faixaContratada: plano.faixa, faixaSincronizada: existente ? null : plano.faixa,
        proximaCobrancaEm: new Date(`${criada.nextDueDate}T00:00:00Z`), cancelaEm: null,
      },
    });
    await this.reconciliar(agora);
    return this.obter(agora);
  }

  /** Cancela a cobrança futura. O que já foi pago continua valendo até o fim do período. */
  async cancelar(agora = new Date()): Promise<AssinaturaDetalheDto> {
    const a = await this.carregar();
    if (!a.asaasSubscriptionId || a.cancelaEm) throw new BadRequestException('Você não tem uma assinatura ativa para cancelar.');
    await this.asaas.cancelarAssinatura(a.asaasSubscriptionId);
    const salao = await this.salao();
    const estado = calcularAcesso(a, agora);
    let fim = agora;
    if (estado.acesso === 'LIBERADO') {
      if (a.status === StatusAssinatura.ATIVA && a.proximaCobrancaEm) {
        fim = DateTime.fromISO(dataIso(a.proximaCobrancaEm), { zone: salao.fusoHorario }).toJSDate();
      } else if (a.status === StatusAssinatura.TESTE && a.testeFimEm) {
        fim = a.testeFimEm;
      }
    }
    await this.prisma.db.assinatura.update({ where: { estabelecimentoId: this.tenantId }, data: { cancelaEm: fim < agora ? agora : fim } });
    return this.obter(agora);
  }

  // ---------------------------------------------------------------- pagamentos (webhook e conferência)

  /**
   * Aplica um pagamento do Asaas ao salão do contexto. Chamada por webhook e por reconciliação: as duas
   * produzem o mesmo resultado e repetir não muda nada (idempotente).
   */
  async aplicarPagamento(p: AsaasPagamento, agora = new Date()): Promise<void> {
    const novo = statusDaCobranca(p.status);
    const existente = await this.prisma.db.cobranca.findUnique({ where: { asaasPaymentId: p.id } });
    // Evento atrasado não desfaz um pagamento: PAGA só anda para estorno.
    const status = existente?.status === StatusCobranca.PAGA && (novo === StatusCobranca.PENDENTE || novo === StatusCobranca.VENCIDA)
      ? StatusCobranca.PAGA
      : novo;
    const pagaEm = status === StatusCobranca.PAGA
      ? existente?.pagaEm ?? (p.paymentDate ? new Date(`${p.paymentDate}T12:00:00Z`) : agora)
      : existente?.pagaEm ?? null;
    const dados = { valorCentavos: Math.round(p.value * 100), vencimento: new Date(`${p.dueDate}T00:00:00Z`), status, pagaEm, url: p.invoiceUrl };
    await this.prisma.db.cobranca.upsert({
      where: { asaasPaymentId: p.id },
      create: comTenant({ asaasPaymentId: p.id, ...dados }),
      update: dados,
    });
    await this.recalcularStatus(agora);
    if (status === StatusCobranca.PAGA && existente?.status !== StatusCobranca.PAGA) {
      const para = await this.donoEmail();
      if (para) {
        const a = await this.carregar();
        await this.avisos.enviarUmaVez(this.tenantId, `paga:${p.id}`, 'pagamento-confirmado', emails.pagamentoConfirmado({
          para, link: this.linkAssinatura(), proxima: a.proximaCobrancaEm ? this.formatarData(dataIso(a.proximaCobrancaEm)) : null,
        }));
      }
    }
  }

  /** Deduz a situação do salão das cobranças que ele tem. */
  private async recalcularStatus(agora: Date): Promise<void> {
    const [a, salao, cobrancas] = await Promise.all([
      this.carregar(),
      this.salao(),
      this.prisma.db.cobranca.findMany({ orderBy: { vencimento: 'asc' } }),
    ]);
    const vencidas = cobrancas.filter((c) => c.status === StatusCobranca.VENCIDA);
    const pagas = cobrancas.filter((c) => c.status === StatusCobranca.PAGA);
    let status = a.status as StatusAssinatura;
    let tolerancia = a.toleranciaFimEm;
    if (vencidas.length) {
      tolerancia = fimDaToleranciaPorVencimento(dataIso(vencidas[0].vencimento), salao.fusoHorario);
      status = agora <= tolerancia ? StatusAssinatura.TOLERANCIA : StatusAssinatura.BLOQUEADA;
    } else if (pagas.length) {
      status = StatusAssinatura.ATIVA;
      tolerancia = null;
    }
    // Próxima cobrança: um mês depois da última paga, se for mais adiante do que já sabemos.
    let proxima = a.proximaCobrancaEm;
    const ultimaPaga = pagas.at(-1);
    if (ultimaPaga) {
      const candidata = DateTime.fromISO(dataIso(ultimaPaga.vencimento), { zone: 'utc' }).plus({ months: 1 }).toJSDate();
      if (!proxima || candidata > proxima) proxima = candidata;
    }
    if (status === a.status && tolerancia?.getTime() === a.toleranciaFimEm?.getTime() && proxima?.getTime() === a.proximaCobrancaEm?.getTime()) return;
    await this.prisma.db.assinatura.update({
      where: { estabelecimentoId: this.tenantId },
      data: { status, toleranciaFimEm: tolerancia, proximaCobrancaEm: proxima },
    });
    await this.avisarMudancaDeStatus(a.status as StatusAssinatura, status, vencidas[0]?.valorCentavos ?? 0, vencidas[0] ? dataIso(vencidas[0].vencimento) : null, vencidas[0]?.asaasPaymentId, tolerancia, salao.fusoHorario);
  }

  private async avisarMudancaDeStatus(
    antes: StatusAssinatura, depois: StatusAssinatura, valorCentavos: number, vencimento: string | null,
    pagamentoId: string | undefined, tolerancia: Date | null, fuso: string,
  ): Promise<void> {
    const para = await this.donoEmail();
    if (!para) return;
    const link = this.linkAssinatura();
    const ate = tolerancia ? this.ultimoDiaLiberado(tolerancia, fuso) : '';
    if (depois === StatusAssinatura.TOLERANCIA && antes !== StatusAssinatura.TOLERANCIA && vencimento) {
      await this.avisos.enviarUmaVez(this.tenantId, `vencida:${pagamentoId}`, 'cobranca-vencida', emails.cobrancaVencida({
        para, link, vencimento: this.formatarData(vencimento), valorCentavos, ate,
      }));
    }
    if (depois === StatusAssinatura.BLOQUEADA && antes !== StatusAssinatura.BLOQUEADA) {
      await this.avisos.enviarUmaVez(this.tenantId, `bloqueada:${tolerancia?.toISOString() ?? 'sem-data'}`, 'bloqueado', emails.bloqueado({ para, link }));
    }
  }

  /** "2026-11-10" -> "10/11/2026". */
  private formatarData(iso: string): string {
    return DateTime.fromISO(iso, { zone: 'utc' }).toFormat('dd/MM/yyyy');
  }

  /** Último dia liberado: o fim da tolerância é o início do dia seguinte, então o dia certo é um segundo antes. */
  private ultimoDiaLiberado(fim: Date, fuso: string): string {
    return DateTime.fromJSDate(new Date(fim.getTime() - 1000), { zone: fuso }).toFormat('dd/MM/yyyy');
  }

  /** Confere tudo com o Asaas (recupera webhook perdido). Seguro de repetir. */
  async reconciliar(agora = new Date()): Promise<void> {
    const a = await this.carregar();
    if (!a.asaasSubscriptionId || !this.asaas.configurado()) return;
    const remota = await this.asaas.obterAssinatura(a.asaasSubscriptionId);
    const pagamentos = await this.asaas.listarPagamentos(a.asaasSubscriptionId);
    for (const p of [...pagamentos].sort((x, y) => x.dueDate.localeCompare(y.dueDate))) await this.aplicarPagamento(p, agora);
    const dados: Prisma.AssinaturaUpdateInput = { ultimaReconciliacaoEm: agora };
    if (!remota.deleted) dados.proximaCobrancaEm = new Date(`${remota.nextDueDate}T00:00:00Z`);
    await this.prisma.db.assinatura.update({ where: { estabelecimentoId: this.tenantId }, data: dados });
    if (remota.deleted && !a.cancelaEm) await this.marcarCancelamentoNoAsaas(agora);
  }

  /** O dono (ou o suporte) encerrou a assinatura direto no Asaas: o que foi pago segue valendo até o fim do período. */
  async marcarCancelamentoNoAsaas(agora = new Date()): Promise<void> {
    const a = await this.carregar();
    if (a.cancelaEm) return;
    const salao = await this.salao();
    const estado = calcularAcesso(a, agora);
    const fim = estado.acesso === 'LIBERADO' && a.status === StatusAssinatura.ATIVA && a.proximaCobrancaEm
      ? DateTime.fromISO(dataIso(a.proximaCobrancaEm), { zone: salao.fusoHorario }).toJSDate()
      : agora;
    await this.prisma.db.assinatura.update({ where: { estabelecimentoId: this.tenantId }, data: { cancelaEm: fim < agora ? agora : fim } });
  }

  // ---------------------------------------------------------------- faixa (número de profissionais)

  /**
   * Antes de adicionar ou reativar profissionais: se isso passa de faixa numa assinatura ativa, o dono precisa
   * confirmar o novo valor (que vale na próxima cobrança). No teste não há cobrança, então não pergunta.
   */
  async exigirConfirmacaoDeFaixa(profissionaisAtivosDepois: number, confirmou: boolean): Promise<void> {
    const a = await this.carregar();
    if (!a.asaasSubscriptionId || a.cancelaEm || !a.faixaContratada) return;
    const para = faixaDe(profissionaisAtivosDepois);
    if (para.faixa <= a.faixaContratada || confirmou) return;
    const de = planoDaFaixa(a.faixaContratada);
    const corpo: FaixaMudaDto = {
      code: CODIGO_FAIXA_MUDA,
      message: `Com este profissional o plano passa de ${de.rotulo} para ${para.rotulo}: de ${reais(de.valorCentavos)} para ${reais(para.valorCentavos)} por mês, a partir da próxima cobrança. Confirmar?`,
      de: { faixa: de.faixa, valorCentavos: de.valorCentavos },
      para: { faixa: para.faixa, valorCentavos: para.valorCentavos },
    };
    throw new ConflictException(corpo);
  }

  /** Depois de qualquer mudança no número de profissionais ativos: acerta a faixa e avisa o Asaas. */
  async aoMudarProfissionais(): Promise<void> {
    const a = await this.carregar();
    if (!a.asaasSubscriptionId || a.cancelaEm) return;
    const nova = faixaDe(await this.profissionaisAtivos());
    if (nova.faixa === a.faixaContratada) return;
    const antes = a.faixaContratada ? planoDaFaixa(a.faixaContratada) : null;
    await this.prisma.db.assinatura.update({ where: { estabelecimentoId: this.tenantId }, data: { faixaContratada: nova.faixa } });
    await this.enviarFaixaAoAsaas();
    const para = await this.donoEmail();
    if (para && antes) {
      await this.avisos.enviar(emails.faixaMudou({ para, link: this.linkAssinatura(), de: antes.valorCentavos, para_: nova.valorCentavos, valorCentavos: nova.valorCentavos }));
    }
  }

  /** Empurra a faixa desejada ao Asaas. Se falhar, fica marcada como pendente e o job tenta de novo. */
  async enviarFaixaAoAsaas(): Promise<void> {
    const a = await this.carregar();
    if (!a.asaasSubscriptionId || !a.faixaContratada || a.faixaContratada === a.faixaSincronizada || !this.asaas.configurado()) return;
    try {
      await this.asaas.atualizarValor(a.asaasSubscriptionId, planoDaFaixa(a.faixaContratada).valorCentavos);
      await this.prisma.db.assinatura.update({ where: { estabelecimentoId: this.tenantId }, data: { faixaSincronizada: a.faixaContratada } });
    } catch (e) {
      this.logger.error(`Não consegui atualizar o valor da assinatura no Asaas (salão ${this.tenantId}): ${(e as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- job

  /** Passagens de tempo e avisos. Idempotente: pode rodar a qualquer hora, quantas vezes for. */
  async rotina(agora = new Date()): Promise<void> {
    const a = await this.carregar();
    const salao = await this.salao();
    const para = await this.donoEmail();
    const link = this.linkAssinatura();

    // 1. Webhook perdido: confere com o Asaas quem está devendo ou não foi conferido hoje.
    if (a.asaasSubscriptionId && !a.cancelaEm && this.asaas.configurado()) {
      const precisa = a.status === StatusAssinatura.TOLERANCIA || a.status === StatusAssinatura.BLOQUEADA
        || !a.ultimaReconciliacaoEm || agora.getTime() - a.ultimaReconciliacaoEm.getTime() > DIA_MS;
      if (precisa) {
        try { await this.reconciliar(agora); } catch (e) { this.logger.error(`Reconciliação falhou (salão ${this.tenantId}): ${(e as Error).message}`); }
      }
    }
    await this.enviarFaixaAoAsaas();

    // 2. Tempo passando.
    const atual = await this.carregar();
    const estado = calcularAcesso(atual, agora);
    const virouTolerancia = atual.status === StatusAssinatura.TESTE && estado.status === StatusAssinatura.TOLERANCIA;
    const virouBloqueada = (atual.status === StatusAssinatura.TESTE || atual.status === StatusAssinatura.TOLERANCIA) && estado.status === StatusAssinatura.BLOQUEADA;
    if (estado.status !== atual.status && estado.status !== StatusAssinatura.CANCELADA) {
      await this.prisma.db.assinatura.update({
        where: { estabelecimentoId: this.tenantId },
        data: { status: estado.status, toleranciaFimEm: estado.toleranciaFimEm },
      });
    } else if (estado.status === StatusAssinatura.CANCELADA && atual.status !== StatusAssinatura.CANCELADA) {
      await this.prisma.db.assinatura.update({ where: { estabelecimentoId: this.tenantId }, data: { status: StatusAssinatura.CANCELADA } });
    }

    // 3. Avisos (cada um sai uma vez só).
    if (!para) return;
    if (atual.status === StatusAssinatura.TESTE && atual.testeFimEm && !atual.asaasSubscriptionId) {
      const falta = atual.testeFimEm.getTime() - agora.getTime();
      if (falta > 0 && falta <= AVISO_FIM_TESTE_DIAS * DIA_MS) {
        await this.avisos.enviarUmaVez(this.tenantId, 'teste-acabando', 'teste-acabando', emails.testeAcabando({
          para, link, dias: Math.max(1, Math.ceil(falta / DIA_MS)), fimEm: DateTime.fromJSDate(atual.testeFimEm, { zone: salao.fusoHorario }).toFormat('dd/MM/yyyy'),
        }));
      }
    }
    if (virouTolerancia && estado.toleranciaFimEm && !atual.asaasSubscriptionId) {
      await this.avisos.enviarUmaVez(this.tenantId, 'teste-acabou', 'teste-acabou', emails.testeAcabou({
        para, link, ate: this.ultimoDiaLiberado(estado.toleranciaFimEm, salao.fusoHorario),
      }));
    }
    if (estado.status === StatusAssinatura.TOLERANCIA && estado.toleranciaFimEm) {
      const falta = estado.toleranciaFimEm.getTime() - agora.getTime();
      if (falta > 0 && falta <= DIA_MS) {
        await this.avisos.enviarUmaVez(this.tenantId, `tolerancia-ultimo-dia:${estado.toleranciaFimEm.toISOString()}`, 'tolerancia-ultimo-dia', emails.toleranciaUltimoDia({
          para, link, ate: this.ultimoDiaLiberado(estado.toleranciaFimEm, salao.fusoHorario),
        }));
      }
    }
    if (virouBloqueada) {
      await this.avisos.enviarUmaVez(this.tenantId, `bloqueada:${estado.toleranciaFimEm?.toISOString() ?? 'sem-data'}`, 'bloqueado', emails.bloqueado({ para, link }));
    }
  }
}

const reais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;
