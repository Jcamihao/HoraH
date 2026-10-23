import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { SLUG_MAX, SLUG_MIN, SLUG_REGEX } from '@hora-h/shared';

const aparar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emailMinusculo = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CadastroDto {
  @Transform(aparar) @IsString() @Length(2, 80)
  nome!: string;

  @Transform(emailMinusculo) @IsEmail() @MaxLength(254)
  email!: string;

  /** Máximo de 128: senha enorme vira custo de CPU no hash. */
  @IsString() @MinLength(8, { message: 'A senha precisa ter pelo menos 8 caracteres.' }) @MaxLength(128)
  senha!: string;

  @Transform(aparar) @IsString() @Length(2, 80)
  nomeEstabelecimento!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString() @Length(SLUG_MIN, SLUG_MAX) @Matches(SLUG_REGEX, { message: 'Use só letras minúsculas, números e hífen.' })
  slug!: string;
}

export class LoginDto {
  @Transform(emailMinusculo) @IsEmail() @MaxLength(254)
  email!: string;

  @IsString() @MinLength(1) @MaxLength(128)
  senha!: string;
}

export class AceitarConviteDto {
  @Transform(emailMinusculo) @IsEmail() @MaxLength(254)
  email!: string;

  @IsString() @MinLength(8, { message: 'A senha precisa ter pelo menos 8 caracteres.' }) @MaxLength(128)
  senha!: string;
}
