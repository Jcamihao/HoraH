import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { MeuAgendamentoController, PublicoController } from './publico.controller';
import { PublicoService } from './publico.service';
import { TenantPorSlugGuard, TenantPorTokenGuard } from './tenant-publico.guards';

@Module({
  imports: [AgendaModule],
  controllers: [PublicoController, MeuAgendamentoController],
  providers: [PublicoService, TenantPorSlugGuard, TenantPorTokenGuard],
})
export class PublicoModule {}
