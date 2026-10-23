import { BadGatewayException, BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Papel, type AssinaturaDetalheDto } from '@hora-h/shared';
import { Papeis, PermiteRestrito } from '../common/decorators';
import { AsaasErro } from './asaas.client';
import { AssinaturaService } from './assinatura.service';
import { AssinarDto } from './dto';

/** Erro do Asaas vira resposta que o dono entende: dado recusado (400) ou serviço fora do ar (502). */
async function comAsaas<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof AsaasErro)) throw e;
    if (e.statusHttp && e.statusHttp >= 400 && e.statusHttp < 500) throw new BadRequestException(e.message);
    throw new BadGatewayException('Não conseguimos falar com o serviço de cobrança agora. Tente de novo em instantes.');
  }
}

/** Só o dono mexe na assinatura; e funciona mesmo com o painel em modo restrito (é por aqui que ele regulariza). */
@Papeis(Papel.DONO)
@PermiteRestrito()
@Controller('assinatura')
export class AssinaturaController {
  constructor(private readonly service: AssinaturaService) {}

  @Get()
  obter(): Promise<AssinaturaDetalheDto> {
    return this.service.obter();
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('assinar')
  assinar(@Body() dto: AssinarDto): Promise<AssinaturaDetalheDto> {
    return comAsaas(() => this.service.assinar(dto.cpfCnpj));
  }

  /** "Já paguei e não mudou": confere com o Asaas na hora. */
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('sincronizar')
  async sincronizar(): Promise<AssinaturaDetalheDto> {
    await comAsaas(() => this.service.reconciliar());
    return this.service.obter();
  }

  @HttpCode(200)
  @Post('cancelar')
  cancelar(): Promise<AssinaturaDetalheDto> {
    return comAsaas(() => this.service.cancelar());
  }
}
