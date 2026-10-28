import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Papel, type NotificacoesDto } from '@hora-h/shared';
import { Papeis, PermiteRestrito } from '../common/decorators';
import { NotificacoesService } from './notificacoes.service';

/** Só o dono vê as notificações do salão. Marcar como lida é só organização e vale até no modo restrito. */
@Papeis(Papel.DONO)
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly service: NotificacoesService) {}

  @Get()
  listar(): Promise<NotificacoesDto> {
    return this.service.listar();
  }

  @PermiteRestrito()
  @HttpCode(204)
  @Post('lidas')
  marcarTodas(): Promise<void> {
    return this.service.marcarTodasLidas();
  }

  @PermiteRestrito()
  @HttpCode(204)
  @Post(':id/lida')
  marcar(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.marcarLida(id);
  }
}
