import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { AvisosService } from './avisos.service';
import { LogTransport, MAIL_TRANSPORT, MemoryTransport, ResendTransport } from './mail.transport';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const provedor = config.get('MAIL_PROVIDER', { infer: true });
        if (provedor === 'resend') return new ResendTransport(config.get('RESEND_API_KEY', { infer: true }), config.get('MAIL_FROM', { infer: true }));
        return provedor === 'memory' ? new MemoryTransport() : new LogTransport();
      },
    },
    AvisosService,
  ],
  exports: [AvisosService, MAIL_TRANSPORT],
})
export class MailModule {}
