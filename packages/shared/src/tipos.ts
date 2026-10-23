import type { FaixaHorario } from './horario';
import type { ConfirmacaoAgendamento, OrigemAgendamento, StatusAgendamento } from './agenda';
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
  assinatura: { status: StatusAssinatura; testeFimEm: string | null } | null;
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
