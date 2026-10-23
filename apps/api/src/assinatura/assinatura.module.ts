import { Module } from '@nestjs/common';
import { AcessoGuard } from './acesso.guard';
import { AsaasClient } from './asaas.client';
import { AssinaturaController } from './assinatura.controller';
import { AssinaturaService } from './assinatura.service';
import { WebhookController } from './webhook.controller';

@Module({
  controllers: [AssinaturaController, WebhookController],
  providers: [AsaasClient, AssinaturaService, AcessoGuard],
  exports: [AssinaturaService, AcessoGuard],
})
export class AssinaturaModule {}
