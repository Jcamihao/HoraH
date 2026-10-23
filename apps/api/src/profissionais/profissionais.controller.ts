import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { Papel } from '@hora-h/shared';
import { Papeis, UsuarioAtual, UsuarioAutenticado } from '../common/decorators';
import { DefinirHorariosDto } from '../common/horario.dto';
import { AtualizarProfissionalDto, CriarProfissionalDto, DefinirServicosDto } from './dto';
import { ProfissionaisService } from './profissionais.service';

@Controller('profissionais')
export class ProfissionaisController {
  constructor(private readonly service: ProfissionaisService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  /** Declarada antes de `:id` para "eu" não ser lido como identificador. */
  @Papeis(Papel.PROFISSIONAL)
  @Get('eu')
  eu(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.eu(u);
  }

  @Post()
  criar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: CriarProfissionalDto) {
    return this.service.criar(u, dto);
  }

  @Get(':id')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(id);
  }

  @Patch(':id')
  atualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AtualizarProfissionalDto) {
    return this.service.atualizar(id, dto);
  }

  @Put(':id/horarios')
  horarios(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DefinirHorariosDto) {
    return this.service.definirHorarios(id, dto.faixas);
  }

  @Put(':id/servicos')
  servicos(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DefinirServicosDto) {
    return this.service.definirServicos(id, dto.servicos);
  }

  @HttpCode(201)
  @Post(':id/convite')
  convite(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.criarConvite(id);
  }
}
