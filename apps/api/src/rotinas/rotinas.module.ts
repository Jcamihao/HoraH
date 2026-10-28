import { Module } from '@nestjs/common';
import { AssinaturaModule } from '../assinatura/assinatura.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { RotinasAgendador } from './rotinas.agendador';
import { RotinasService } from './rotinas.service';

@Module({
  imports: [AssinaturaModule, WhatsappModule],
  providers: [RotinasService, RotinasAgendador],
  exports: [RotinasService],
})
export class RotinasModule {}
