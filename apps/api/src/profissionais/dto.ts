import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested,
} from 'class-validator';

const aparar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CriarProfissionalDto {
  @Transform(aparar) @IsString() @Length(2, 80)
  nome!: string;

  /** O dono também atende: liga este profissional à conta dele (agenda própria). */
  @IsOptional() @IsBoolean()
  vincularAoDono?: boolean;
}

export class AtualizarProfissionalDto {
  @IsOptional() @Transform(aparar) @IsString() @Length(2, 80)
  nome?: string;

  @IsOptional() @IsBoolean()
  ativo?: boolean;
}

export class ServicoDoProfissionalDto {
  @IsUUID()
  servicoId!: string;

  /** Em centavos. Teto de R$ 100 mil por atendimento, só para barrar erro de digitação. */
  @IsInt() @Min(0) @Max(10_000_000)
  precoCentavos!: number;
}

export class DefinirServicosDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ServicoDoProfissionalDto)
  servicos!: ServicoDoProfissionalDto[];
}
