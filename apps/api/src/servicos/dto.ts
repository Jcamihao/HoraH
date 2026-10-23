import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

const aparar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CriarServicoDto {
  @Transform(aparar) @IsString() @Length(2, 80)
  nome!: string;

  /** Minutos; de 5 min a 10 h. */
  @IsInt() @Min(5) @Max(600)
  duracaoMin!: number;
}

export class AtualizarServicoDto {
  @IsOptional() @Transform(aparar) @IsString() @Length(2, 80)
  nome?: string;

  @IsOptional() @IsInt() @Min(5) @Max(600)
  duracaoMin?: number;

  @IsOptional() @IsBoolean()
  ativo?: boolean;
}
