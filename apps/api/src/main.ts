import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp } from './app.setup';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  const porta = app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true });
  await app.listen(porta);
  Logger.log(`API do Hora H escutando na porta ${porta}`, 'Bootstrap');
}

void bootstrap();
