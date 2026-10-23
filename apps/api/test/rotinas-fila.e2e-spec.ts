import { Queue } from 'bullmq';
import { RedisMemoryServer } from 'redis-memory-server';
import { MemoryTransport } from '../src/mail/mail.transport';
import { opcoesRedis } from '../src/rotinas/rotinas.agendador';
import { Ambiente, limparBanco, montarSalao, subirApp } from './helpers';

/** Os jobs de verdade: BullMQ sobre um Redis real (embutido), do agendamento repetido ao efeito no banco. */
describe('jobs no BullMQ', () => {
  let redis: RedisMemoryServer;
  let env: Ambiente;
  let fila: Queue;
  let url: string;

  beforeAll(async () => {
    redis = await RedisMemoryServer.create();
    url = `redis://${await redis.getHost()}:${await redis.getPort()}`;
    env = await subirApp({ REDIS_URL: url, ROTINAS_INTERVALO_MIN: '1' });
    await limparBanco(env.prisma);
    fila = new Queue('rotinas', { connection: opcoesRedis(url) });
  }, 120_000);

  afterAll(async () => {
    await fila.close();
    await env.fechar();
    await redis.stop();
  });

  it('registra o agendamento repetido do job de assinaturas (a cada minuto)', async () => {
    const agendadores = await fila.getJobSchedulers();
    expect(agendadores.map((a) => a.key)).toContain('assinaturas');
    expect(agendadores.find((a) => a.key === 'assinaturas')!.every).toBe(60_000);
  });

  it('um job na fila é consumido pelo worker e produz o efeito: aviso de fim do teste, uma vez só', async () => {
    const s = await montarSalao(env);
    await env.prisma.semTenant.assinatura.update({
      where: { estabelecimentoId: s.dono.estabelecimentoId },
      data: { testeFimEm: new Date(Date.now() + 1.5 * 86_400_000), status: 'TESTE' },
    });
    MemoryTransport.caixa.length = 0;
    await fila.add('assinaturas', {});
    await fila.add('assinaturas', {}); // dois jobs seguidos: o segundo não repete o aviso
    const fim = Date.now() + 15_000;
    while (!MemoryTransport.caixa.some((e) => e.para === s.dono.email) && Date.now() < fim) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 500));
    expect(MemoryTransport.caixa.filter((e) => e.para === s.dono.email && /teste grátis acaba/.test(e.assunto))).toHaveLength(1);
  }, 30_000);
});
