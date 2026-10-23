import { IsUUID, Matches } from 'class-validator';
import { DATA_REGEX } from '../agenda/dto';

export class ConsultaDiasDto {
  @IsUUID()
  profissionalId!: string;

  @IsUUID()
  servicoId!: string;
}

export class ConsultaHorariosPublicosDto extends ConsultaDiasDto {
  @Matches(DATA_REGEX, { message: 'Data inválida.' })
  data!: string;
}

export class ConsultaHorariosTokenDto {
  @Matches(DATA_REGEX, { message: 'Data inválida.' })
  data!: string;
}
