import { Body, Controller, createParamDecorator, ExecutionContext, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AgendamentoCriadoPublicoDto, DiaDisponivelDto, MeuAgendamentoDto, SalaoPublicoDto, SlotDto,
} from '@hora-h/shared';
import { Publico } from '../common/decorators';
import { RemarcarDto, ReservaPublicaDto } from '../agenda/dto';
import { ConsultaDiasDto, ConsultaHorariosPublicosDto, ConsultaHorariosTokenDto } from './dto';
import { PublicoService } from './publico.service';
import { TenantPorSlugGuard, TenantPorTokenGuard } from './tenant-publico.guards';

const UM_MINUTO = 60_000;

/** Página pública de agendamento: `/api/publico/{slug}/...`. Sem login; o salão vem do slug. */
@Publico()
@UseGuards(TenantPorSlugGuard)
@Controller('publico/:slug')
export class PublicoController {
  constructor(private readonly service: PublicoService) {}

  @Get()
  salao(): Promise<SalaoPublicoDto> {
    return this.service.salao();
  }

  @Get('dias')
  dias(@Query() q: ConsultaDiasDto): Promise<DiaDisponivelDto[]> {
    return this.service.dias(q.profissionalId, q.servicoId);
  }

  @Get('horarios')
  horarios(@Query() q: ConsultaHorariosPublicosDto): Promise<SlotDto[]> {
    return this.service.horarios(q.profissionalId, q.servicoId, q.data);
  }

  /** Marcar horário: o limite por IP segura quem tenta lotar a agenda de um salão. */
  @Throttle({ default: { limit: 10, ttl: UM_MINUTO } })
  @Post('agendamentos')
  reservar(@Body() dto: ReservaPublicaDto): Promise<AgendamentoCriadoPublicoDto> {
    return this.service.reservar(dto);
  }
}

/** O guard põe o id do agendamento da URL no request; handlers nunca recebem id do cliente. */
const AgendamentoDoToken = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().agendamentoId;
});

/** Página do link único do cliente: `/api/meu-agendamento/{token}/...`. */
@Publico()
@UseGuards(TenantPorTokenGuard)
@Throttle({ default: { limit: 30, ttl: UM_MINUTO } })
@Controller('meu-agendamento/:token')
export class MeuAgendamentoController {
  constructor(private readonly service: PublicoService) {}

  @Get()
  ver(@AgendamentoDoToken() id: string): Promise<MeuAgendamentoDto> {
    return this.service.meuAgendamento(id);
  }

  @HttpCode(200)
  @Post('cancelar')
  cancelar(@AgendamentoDoToken() id: string): Promise<MeuAgendamentoDto> {
    return this.service.cancelar(id);
  }

  /** "Confirmo que vou": para a contagem do cancelamento automático. */
  @HttpCode(200)
  @Post('confirmar')
  confirmar(@AgendamentoDoToken() id: string): Promise<MeuAgendamentoDto> {
    return this.service.confirmar(id);
  }

  @Get('dias')
  dias(@AgendamentoDoToken() id: string): Promise<DiaDisponivelDto[]> {
    return this.service.diasParaRemarcar(id);
  }

  @Get('horarios')
  horarios(@AgendamentoDoToken() id: string, @Query() q: ConsultaHorariosTokenDto): Promise<SlotDto[]> {
    return this.service.horariosParaRemarcar(id, q.data);
  }

  @HttpCode(200)
  @Post('remarcar')
  remarcar(@AgendamentoDoToken() id: string, @Body() dto: RemarcarDto): Promise<MeuAgendamentoDto> {
    return this.service.remarcar(id, new Date(dto.inicio));
  }
}
