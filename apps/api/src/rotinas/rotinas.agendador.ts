import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Env } from '../config/env';
import { RotinasService } from './rotinas.service';

export const FILA_ROTINAS = 'rotinas';

/** `redis://:senha@host:6379/0` -> opções de conexão do BullMQ. */
export function opcoesRedis(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null, // exigência do BullMQ para o worker
  };
}

/**
 * Liga o job de assinaturas. Com REDIS_URL usa BullMQ (um agendamento repetido que sobrevive a reinício e não
 * duplica se houver mais de uma instância). Sem Redis, só em desenvolvimento, usa um temporizador do processo.
 */
@Injectable()
export class RotinasAgendador implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RotinasAgendador.name);
  private fila?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly rotinas: RotinasService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get('REDIS_URL', { infer: true });
    const intervalo = this.config.get('ROTINAS_INTERVALO_MIN', { infer: true }) * 60_000;
    if (url) {
      const connection = opcoesRedis(url);
      this.fila = new Queue(FILA_ROTINAS, { connection });
      await this.fila.upsertJobScheduler('assinaturas', { every: intervalo }, { name: 'assinaturas', opts: { removeOnComplete: 20, removeOnFail: 50 } });
      this.worker = new Worker(FILA_ROTINAS, async (job) => {
        if (job.name === 'assinaturas') return this.rotinas.processarAssinaturas();
      }, { connection, concurrency: 1 });
      this.worker.on('failed', (job, e) => this.logger.error(`Job ${job?.name} falhou: ${e.message}`));
      this.logger.log(`Jobs ligados no Redis (a cada ${intervalo / 60_000} min).`);
    } else if (this.config.get('NODE_ENV', { infer: true }) === 'development') {
      const rodar = () => this.rotinas.processarAssinaturas().catch((e) => this.logger.error(`Rotina falhou: ${e.message}`));
      this.timer = setInterval(rodar, intervalo);
      this.timer.unref();
      setTimeout(rodar, 20_000).unref();
      this.logger.warn('Sem REDIS_URL: jobs rodando num temporizador do processo (só desenvolvimento).');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.fila?.close();
  }
}
