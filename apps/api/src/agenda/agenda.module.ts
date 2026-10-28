import { Module } from '@nestjs/common';
import { AssinaturaModule } from '../assinatura/assinatura.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { WhatsappNucleoModule } from '../whatsapp/whatsapp-nucleo.module';
import { AgendaController, BloqueiosController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { BloqueiosService } from './bloqueios.service';

@Module({
  imports: [AssinaturaModule, NotificacoesModule, WhatsappNucleoModule],
  controllers: [AgendaController, BloqueiosController],
  providers: [AgendaService, BloqueiosService],
  exports: [AgendaService],
})
export class AgendaModule {}
