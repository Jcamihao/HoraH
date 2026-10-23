import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AtualizarServicoDto, CriarServicoDto } from './dto';
import { ServicosService } from './servicos.service';

@Controller('servicos')
export class ServicosController {
  constructor(private readonly service: ServicosService) {}

  @Get()
  listar(@Query('incluirInativos') incluirInativos?: string) {
    return this.service.listar(incluirInativos === 'true');
  }

  @Post()
  criar(@Body() dto: CriarServicoDto) {
    return this.service.criar(dto);
  }

  @Patch(':id')
  atualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AtualizarServicoDto) {
    return this.service.atualizar(id, dto);
  }
}
