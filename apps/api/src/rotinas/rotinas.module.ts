import { Module } from '@nestjs/common';
import { AssinaturaModule } from '../assinatura/assinatura.module';
import { RotinasAgendador } from './rotinas.agendador';
import { RotinasService } from './rotinas.service';

@Module({
  imports: [AssinaturaModule],
  providers: [RotinasService, RotinasAgendador],
  exports: [RotinasService],
})
export class RotinasModule {}
