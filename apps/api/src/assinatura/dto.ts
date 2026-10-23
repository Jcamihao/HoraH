import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class AssinarDto {
  /** CPF ou CNPJ de quem paga. Vai só para o Asaas; o Hora H não guarda. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(11, 18)
  cpfCnpj!: string;
}
