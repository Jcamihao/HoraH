import { Ambiente, limparBanco, montarSalao, SalaoPronto, subirApp } from './helpers';

describe('limite de tentativas nas rotas públicas', () => {
  let env: Ambiente;
  let s: SalaoPronto;
  beforeAll(async () => {
    env = await subirApp({ THROTTLE_ENABLED: 'true' });
    await limparBanco(env.prisma);
    s = await montarSalao(env);
  });
  afterAll(() => env.fechar());

  it('marcar horário: no máximo 10 pedidos por minuto por IP', async () => {
    const pedir = () => env.http().post(`/api/publico/${s.slug}/agendamentos`).send({});
    for (let i = 0; i < 10; i++) await pedir().expect(400);
    await pedir().expect(429);
  });

  it('link único: tentar adivinhar tokens esbarra em 429 depois de 30 tentativas por minuto', async () => {
    const chute = () => env.http().get(`/api/meu-agendamento/${'a'.repeat(43)}`);
    for (let i = 0; i < 30; i++) await chute().expect(404);
    await chute().expect(429);
  });
});
