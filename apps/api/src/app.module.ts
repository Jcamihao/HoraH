import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AgendaModule } from './agenda/agenda.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { RolesGuard } from './common/roles.guard';
import { TenantMiddleware } from './common/tenant.middleware';
import { Env, validateEnv } from './config/env';
import { EstabelecimentoModule } from './estabelecimento/estabelecimento.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProfissionaisModule } from './profissionais/profissionais.module';
import { PublicoModule } from './publico/publico.module';
import { ServicosModule } from './servicos/servicos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, envFilePath: ['.env', '../../.env'] }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const ligado = config.get('THROTTLE_ENABLED', { infer: true });
        return {
          throttlers: [
            { name: 'default', ttl: 60_000, limit: 120, skipIf: () => !ligado },
            {
              // Tentativas de login por e-mail + IP: trava força bruta sem punir quem erra a senha uma vez.
              name: 'login',
              ttl: 60_000,
              limit: 5,
              getTracker: (req: Record<string, any>) => `${req['ip']}|${String(req['body']?.email ?? '').toLowerCase()}`,
              skipIf: (ctx) => !ligado || ctx.getHandler().name !== 'login',
            },
          ],
        };
      },
    }),
    PrismaModule,
    AuthModule,
    EstabelecimentoModule,
    ServicosModule,
    ProfissionaisModule,
    AgendaModule,
    PublicoModule,
  ],
  controllers: [HealthController],
  providers: [
    // Ordem importa: limite de taxa -> autenticação (define o tenant) -> papel.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
