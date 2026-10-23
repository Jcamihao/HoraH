import { Module } from '@nestjs/common';
import { AgendaController, BloqueiosController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { BloqueiosService } from './bloqueios.service';

@Module({
  controllers: [AgendaController, BloqueiosController],
  providers: [AgendaService, BloqueiosService],
  exports: [AgendaService],
})
export class AgendaModule {}
