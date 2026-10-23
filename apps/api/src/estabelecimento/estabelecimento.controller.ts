import { Body, Controller, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import { Papel } from '@hora-h/shared';
import { Papeis, UsuarioAtual, UsuarioAutenticado } from '../common/decorators';
import { DefinirHorariosDto } from '../common/horario.dto';
import { AtualizarEstabelecimentoDto } from './dto';
import { EstabelecimentoService } from './estabelecimento.service';

@Controller('estabelecimento')
export class EstabelecimentoController {
  constructor(private readonly service: EstabelecimentoService) {}

  @Papeis(Papel.DONO, Papel.PROFISSIONAL)
  @Get()
  obter(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.obter(u);
  }

  @Patch()
  atualizar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: AtualizarEstabelecimentoDto) {
    return this.service.atualizar(u, dto);
  }

  @Get('horarios')
  horarios() {
    return this.service.horarios();
  }

  @Put('horarios')
  definirHorarios(@Body() dto: DefinirHorariosDto) {
    return this.service.definirHorarios(dto.faixas);
  }

  @HttpCode(200)
  @Post('onboarding/concluir')
  concluir(@UsuarioAtual() u: UsuarioAutenticado) {
    return this.service.concluirOnboarding(u);
  }
}
