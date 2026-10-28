import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { WaAkgProvider } from './waakg.provider';
import { WHATSAPP_PROVIDER } from './whatsapp.provider';
import { WhatsappService } from './whatsapp.service';

/** Conexão e fila de envio. Fica à parte porque a agenda precisa dela para confirmar marcações, e o bot e os lembretes precisam da agenda. */
@Module({
  imports: [NotificacoesModule],
  providers: [{ provide: WHATSAPP_PROVIDER, useClass: WaAkgProvider }, WhatsappService],
  exports: [WhatsappService, WHATSAPP_PROVIDER],
})
export class WhatsappNucleoModule {}
