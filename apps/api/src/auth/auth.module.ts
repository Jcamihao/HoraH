import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessaoService } from './sessao.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({ secret: config.get('JWT_SECRET', { infer: true }) }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessaoService],
  exports: [SessaoService],
})
export class AuthModule {}
