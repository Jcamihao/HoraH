import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env';

/** Configuração comum à aplicação real e aos testes e2e (mesmo pipeline nos dois). */
export function configurarApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  (app as NestExpressApplication).set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
}
