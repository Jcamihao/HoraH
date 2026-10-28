import { BadGatewayException, BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length } from 'class-validator';
import { normalizarWhatsapp, Papel, type ConexaoWhatsappDto, type QrWhatsappDto } from '@hora-h/shared';
import { Papeis, PermiteRestrito } from '../common/decorators';
import { WhatsappErro } from './whatsapp.provider';
import { WhatsappService } from './whatsapp.service';

class PareamentoDto {
  /** Número do WhatsApp que vai ser conectado (qualquer formato comum). */
  @IsString() @Length(8, 25)
  telefone!: string;
}

/** Erro do serviço de WhatsApp vira resposta que o dono entende. */
async function comWhatsapp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof WhatsappErro)) throw e;
    if (e.statusHttp && e.statusHttp >= 400 && e.statusHttp < 500 && e.statusHttp !== 404) throw new BadRequestException(e.message);
    throw new BadGatewayException('Não conseguimos falar com o WhatsApp agora. Tente de novo em instantes.');
  }
}

/** Conexão do WhatsApp do salão (só o dono). Continua funcionando no modo restrito: lembretes de quem já marcou dependem dela. */
@Papeis(Papel.DONO)
@PermiteRestrito()
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly service: WhatsappService) {}

  @Get()
  obter(): Promise<ConexaoWhatsappDto> {
    return this.service.obter();
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('conectar')
  conectar(): Promise<ConexaoWhatsappDto> {
    return comWhatsapp(() => this.service.conectar());
  }

  /** A tela chama de tempos em tempos enquanto espera a leitura do QR. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('qr')
  qr(): Promise<QrWhatsappDto> {
    return comWhatsapp(() => this.service.qr());
  }

  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('parear')
  parear(@Body() dto: PareamentoDto): Promise<{ codigo: string }> {
    const telefone = normalizarWhatsapp(dto.telefone);
    if (!telefone) throw new BadRequestException('Informe o WhatsApp com DDD. Exemplo: (11) 99999-8888.');
    return comWhatsapp(() => this.service.parear(telefone));
  }

  @HttpCode(200)
  @Post('desconectar')
  desconectar(): Promise<ConexaoWhatsappDto> {
    return comWhatsapp(() => this.service.desconectar());
  }
}
