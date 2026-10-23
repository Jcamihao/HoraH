import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, Max, Min, ValidateNested } from 'class-validator';

export class FaixaHorarioDto {
  @IsInt() @Min(0) @Max(6)
  diaSemana!: number;

  @IsInt() @Min(0) @Max(1439)
  inicioMin!: number;

  @IsInt() @Min(1) @Max(1440)
  fimMin!: number;
}

export class DefinirHorariosDto {
  @IsArray() @ArrayMaxSize(70) @ValidateNested({ each: true }) @Type(() => FaixaHorarioDto)
  faixas!: FaixaHorarioDto[];
}
