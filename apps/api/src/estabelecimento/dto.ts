import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { SLUG_MAX, SLUG_MIN, SLUG_REGEX } from '@hora-h/shared';

export class AtualizarEstabelecimentoDto {
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @Length(2, 80)
  nome?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString() @Length(SLUG_MIN, SLUG_MAX) @Matches(SLUG_REGEX, { message: 'Use só letras minúsculas, números e hífen.' })
  slug?: string;

  @IsOptional() @IsString() @Length(3, 64)
  fusoHorario?: string;

  /** Até 30 dias. */
  @IsOptional() @IsInt() @Min(0) @Max(43_200)
  antecedenciaMinMin?: number;

  @IsOptional() @IsInt() @Min(0) @Max(43_200)
  prazoCancelamentoMin?: number;

  @IsOptional() @IsBoolean()
  emailAgendamentos?: boolean;
}
