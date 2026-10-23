import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrigemAgendamento, Papel, type AgendamentoDto, type AgendaDto, type BloqueioCriadoDto, type BloqueioDto, type SlotDto,
} from '@hora-h/shared';
import { Papeis, UsuarioAtual, UsuarioAutenticado } from '../common/decorators';
import type { Env } from '../config/env';
import { AgendaService, paraAgendamentoDto } from './agenda.service';
import { BloqueiosService } from './bloqueios.service';
import {
  AgendamentoManualDto, AlterarStatusDto, ConsultaAgendaDto, ConsultaBloqueiosDto, ConsultaHorariosDto, CriarBloqueioDto,
} from './dto';
import { escopoDoProfissional } from './escopo';

/** Painel: o dono vê todos os profissionais; o profissional, só a própria agenda. */
@Papeis(Papel.DONO, Papel.PROFISSIONAL)
@Controller('agenda')
export class AgendaController {
  constructor(
    private readonly agenda: AgendaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  listar(@UsuarioAtual() u: UsuarioAutenticado, @Query() q: ConsultaAgendaDto): Promise<AgendaDto> {
    return this.agenda.agenda(q.de, q.ate, escopoDoProfissional(u, q.profissionalId));
  }

  /** Horários livres para um agendamento manual (sem a antecedência mínima do link). */
  @Get('horarios')
  async horarios(@UsuarioAtual() u: UsuarioAutenticado, @Query() q: ConsultaHorariosDto): Promise<SlotDto[]> {
    escopoDoProfissional(u, q.profissionalId);
    const [salao, servico] = await Promise.all([
      this.agenda.salao(),
      this.agenda.servicoDoProfissional(q.profissionalId, q.servicoId),
    ]);
    return this.agenda.horarios(salao, { profissionalId: q.profissionalId, duracaoMin: servico.duracaoMin, regime: 'MANUAL' }, q.data);
  }

  @Post('agendamentos')
  async criar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: AgendamentoManualDto): Promise<AgendamentoDto> {
    escopoDoProfissional(u, dto.profissionalId);
    const criado = await this.agenda.reservar({ ...dto, inicio: new Date(dto.inicio), origem: OrigemAgendamento.MANUAL });
    return paraAgendamentoDto(criado);
  }

  @Get('agendamentos/:id')
  async obter(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<AgendamentoDto> {
    return paraAgendamentoDto(await this.agenda.obterAgendamento(id, escopoDoProfissional(u)));
  }

  @Patch('agendamentos/:id/status')
  async status(
    @UsuarioAtual() u: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AlterarStatusDto,
  ): Promise<AgendamentoDto> {
    return paraAgendamentoDto(await this.agenda.alterarStatus(id, dto.status, escopoDoProfissional(u)));
  }

  /** Link único do cliente, para o salão reenviar quando o cliente perde a mensagem. */
  @Get('agendamentos/:id/link')
  async link(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<{ link: string }> {
    const a = await this.agenda.obterAgendamento(id, escopoDoProfissional(u));
    return { link: `${this.config.get('APP_BASE_URL', { infer: true })}/agendamento/${a.token}` };
  }
}

@Papeis(Papel.DONO, Papel.PROFISSIONAL)
@Controller('bloqueios')
export class BloqueiosController {
  constructor(private readonly bloqueios: BloqueiosService) {}

  @Get()
  listar(@UsuarioAtual() u: UsuarioAutenticado, @Query() q: ConsultaBloqueiosDto): Promise<BloqueioDto[]> {
    return this.bloqueios.listar(u, q);
  }

  @Post()
  criar(@UsuarioAtual() u: UsuarioAutenticado, @Body() dto: CriarBloqueioDto): Promise<BloqueioCriadoDto> {
    return this.bloqueios.criar(u, dto);
  }

  @HttpCode(204)
  @Delete(':id')
  remover(@UsuarioAtual() u: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.bloqueios.remover(u, id);
  }
}
