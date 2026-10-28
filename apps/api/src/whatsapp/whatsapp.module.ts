import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { BotService } from './bot.service';
import { LembretesService } from './lembretes.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappNucleoModule } from './whatsapp-nucleo.module';
import { WhatsappWebhookController } from './whatsapp.webhook.controller';

@Module({
  imports: [AgendaModule, WhatsappNucleoModule, NotificacoesModule],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [LembretesService, BotService],
  exports: [LembretesService, BotService, WhatsappNucleoModule],
})
export class WhatsappModule {}
