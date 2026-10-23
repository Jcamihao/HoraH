import { Module } from '@nestjs/common';
import { AssinaturaModule } from '../assinatura/assinatura.module';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { AgendaController, BloqueiosController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { BloqueiosService } from './bloqueios.service';

@Module({
  imports: [AssinaturaModule],
  controllers: [AgendaController, BloqueiosController],
  providers: [AgendaService, BloqueiosService, NotificacoesService],
  exports: [AgendaService],
})
export class AgendaModule {}
