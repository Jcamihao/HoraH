import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { StatusAgendamento } from '@hora-h/shared';

const aparar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** "YYYY-MM-DD" no fuso do salão. A existência da data no calendário é conferida no serviço. */
export const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
/** "YYYY-MM-DDTHH:mm" no fuso do salão (sem deslocamento): é o que o dono digita num bloqueio. */
export const DATA_HORA_LOCAL_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export class ConsultaAgendaDto {
  @Matches(DATA_REGEX, { message: 'Data inicial inválida.' })
  de!: string;

  @Matches(DATA_REGEX, { message: 'Data final inválida.' })
  ate!: string;

  @IsOptional() @IsUUID()
  profissionalId?: string;
}

export class ConsultaHorariosDto {
  @IsUUID()
  profissionalId!: string;

  @IsUUID()
  servicoId!: string;

  @Matches(DATA_REGEX, { message: 'Data inválida.' })
  data!: string;
}

export class AgendamentoManualDto {
  @IsUUID()
  profissionalId!: string;

  @IsUUID()
  servicoId!: string;

  /** Instante em UTC, exatamente como veio da lista de horários livres. */
  @IsISO8601({ strict: true })
  inicio!: string;

  @Transform(aparar) @IsString() @Length(2, 80)
  nome!: string;

  /** Qualquer formato comum; o serviço normaliza para 55 + DDD + número. */
  @Transform(aparar) @IsString() @Length(8, 25)
  whatsapp!: string;
}

export class AlterarStatusDto {
  @IsIn(Object.values(StatusAgendamento))
  status!: StatusAgendamento;
}

export class ConsultaBloqueiosDto {
  @Matches(DATA_REGEX, { message: 'Data inicial inválida.' })
  de!: string;

  @Matches(DATA_REGEX, { message: 'Data final inválida.' })
  ate!: string;

  @IsOptional() @IsUUID()
  profissionalId?: string;
}

export class CriarBloqueioDto {
  @IsUUID()
  profissionalId!: string;

  @Matches(DATA_HORA_LOCAL_REGEX, { message: 'Início inválido.' })
  inicio!: string;

  @Matches(DATA_HORA_LOCAL_REGEX, { message: 'Fim inválido.' })
  fim!: string;

  @IsOptional() @Transform(aparar) @IsString() @Length(1, 120)
  motivo?: string;
}

export class ReservaPublicaDto extends AgendamentoManualDto {
  /** Aviso de uso dos dados (agendamento e lembretes). Sem o aceite, não reserva. */
  @IsBoolean() @Equals(true, { message: 'É preciso concordar com o uso dos dados para agendar.' })
  consentimento!: boolean;
}

export class RemarcarDto {
  @IsISO8601({ strict: true })
  inicio!: string;
}
