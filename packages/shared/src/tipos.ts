import type { FaixaHorario } from './horario';
import type { ConfirmacaoAgendamento, OrigemAgendamento, StatusAgendamento } from './agenda';
import { CODIGO_FAIXA_MUDA, type StatusCobranca } from './assinatura';
import type { Papel, StatusAssinatura } from './papel';

export interface UsuarioLogado {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  estabelecimentoId: string;
  profissionalId: string | null;
}

export interface SessaoResposta {
  accessToken: string;
  /** Segundos até o access token expirar. */
  expiraEmSeg: number;
  usuario: UsuarioLogado;
}

export interface EstabelecimentoDto {
  id: string;
  nome: string;
  slug: string;
  fusoHorario: string;
  antecedenciaMinMin: number;
  prazoCancelamentoMin: number;
  onboardingConcluido: boolean;
  /** Nulo para profissional: assinatura é assunto do dono. */
  assinatura: { status: StatusAssinatura; acesso: 'LIBERADO' | 'RESTRITO'; testeFimEm: string | null; toleranciaFimEm: string | null } | null;
  /** Recebe e-mail quando alguém marca ou cancela um horário. */
  emailAgendamentos: boolean;
}

export interface ProfissionalDto {
  id: string;
  nome: string;
  ativo: boolean;
  temUsuario: boolean;
  servicos: { servicoId: string; nome: string; duracaoMin: number; precoCentavos: number; ativo: boolean }[];
  horarios: FaixaHorario[];
}

export interface ServicoDto {
  id: string;
  nome: string;
  duracaoMin: number;
  ativo: boolean;
}

export interface ConviteCriadoDto {
  token: string;
  /** Link completo para o dono enviar ao profissional (mostrado só nesta resposta). */
  link: string;
  expiraEm: string;
}

export interface ConvitePreviaDto {
  estabelecimento: string;
  profissional: string;
}

export interface ErroApi {
  statusCode: number;
  message: string | string[];
  error?: string;
}

/** Um horário livre: `inicio` é o instante em UTC (ISO), `hora` já vem no fuso do salão ("14:30"). */
export interface SlotDto {
  inicio: string;
  hora: string;
}

export interface DiaDisponivelDto {
  /** Data no fuso do salão, "YYYY-MM-DD". */
  data: string;
  livre: boolean;
}

export interface AgendamentoDto {
  id: string;
  inicio: string;
  fim: string;
  status: StatusAgendamento;
  confirmacao: ConfirmacaoAgendamento;
  origem: OrigemAgendamento;
  precoCentavos: number;
  duracaoMin: number;
  profissional: { id: string; nome: string };
  servico: { id: string; nome: string };
  cliente: { id: string; nome: string; whatsapp: string };
}

export interface BloqueioDto {
  id: string;
  profissionalId: string;
  inicio: string;
  fim: string;
  motivo: string | null;
}

export interface BloqueioCriadoDto extends BloqueioDto {
  /** Quantos agendamentos já marcados caem dentro do bloqueio (continuam marcados; o dono decide). */
  agendamentosAfetados: number;
}

export interface AgendaDto {
  agendamentos: AgendamentoDto[];
  bloqueios: BloqueioDto[];
}

export interface ProfissionalPublicoDto {
  id: string;
  nome: string;
  servicos: { servicoId: string; nome: string; duracaoMin: number; precoCentavos: number }[];
}

export interface SalaoPublicoDto {
  nome: string;
  slug: string;
  fusoHorario: string;
  horizonteDias: number;
  /** Falso quando a assinatura do salão está bloqueada: a página mostra que a agenda está fechada. */
  aceitaAgendamentos: boolean;
  profissionais: ProfissionalPublicoDto[];
}

/** O que o cliente final vê do próprio agendamento (página com link único). */
export interface MeuAgendamentoDto {
  inicio: string;
  fim: string;
  status: StatusAgendamento;
  precoCentavos: number;
  duracaoMin: number;
  clienteNome: string;
  salao: { nome: string; slug: string; fusoHorario: string };
  profissional: { id: string; nome: string };
  servico: { id: string; nome: string };
  /** Último instante em que o cliente ainda pode cancelar/remarcar sozinho. */
  limiteAlteracao: string;
  /** Agendado, no futuro e dentro do prazo: pode cancelar e remarcar. */
  podeAlterar: boolean;
}

export interface AgendamentoCriadoPublicoDto extends MeuAgendamentoDto {
  /** Token do link único; o front monta /agendamento/{token}. */
  token: string;
}

export interface CobrancaDto {
  id: string;
  valorCentavos: number;
  /** "YYYY-MM-DD" */
  vencimento: string;
  status: StatusCobranca;
  pagaEm: string | null;
  /** Página do Asaas onde o dono paga (Pix, cartão ou boleto). */
  url: string | null;
}

/** Tela de assinatura do dono. `acesso` já considera o relógio: não depende de o job ter rodado. */
export interface AssinaturaDetalheDto {
  status: StatusAssinatura;
  /** RESTRITO = novos agendamentos bloqueados e painel só para consulta. */
  acesso: 'LIBERADO' | 'RESTRITO';
  testeFimEm: string | null;
  toleranciaFimEm: string | null;
  profissionaisAtivos: number;
  /** Faixa e valor pelo número de profissionais ativos agora. */
  faixa: number;
  valorCentavos: number;
  /** Já existe assinatura criada no Asaas. */
  contratada: boolean;
  /** Faixa e valor da assinatura no Asaas (valem a partir da próxima cobrança). */
  faixaContratada: number | null;
  valorContratadoCentavos: number | null;
  proximaCobrancaEm: string | null;
  cancelaEm: string | null;
  pagamentoUrl: string | null;
  cobrancas: CobrancaDto[];
  /** Falso quando a chave do Asaas não está configurada neste ambiente. */
  cobrancaConfigurada: boolean;
}

export interface FaixaMudaDto {
  code: typeof CODIGO_FAIXA_MUDA;
  message: string;
  de: { faixa: number; valorCentavos: number };
  para: { faixa: number; valorCentavos: number };
}
