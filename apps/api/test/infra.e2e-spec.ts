import { Ambiente, limparBanco, subirApp } from './helpers';

describe('infraestrutura', () => {
  let env: Ambiente;
  beforeAll(async () => {
    env = await subirApp();
    await limparBanco(env.prisma);
  });
  afterAll(() => env.fechar());

  it('responde /api/health com o banco ligado', async () => {
    const res = await env.http().get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('btree_gist está disponível (a Fase 2 usa para impedir conflito de horário)', async () => {
    await env.prisma.semTenant.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS btree_gist');
    const r = await env.prisma.semTenant.$queryRawUnsafe<{ extname: string }[]>(
      "SELECT extname FROM pg_extension WHERE extname='btree_gist'",
    );
    expect(r).toHaveLength(1);
  });

  it('cabeçalhos de segurança do helmet estão presentes', async () => {
    const res = await env.http().get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
