import { ehConflitoDeHorario } from './agenda.service';

describe('ehConflitoDeHorario', () => {
  it.each([
    'conflicting key value violates exclusion constraint "agendamentos_sem_sobreposicao_excl"',
    'Error: code: "23P01"',
    'PostgresError { code: "40P01", message: "deadlock detected" }',
    'deadlock detected',
  ])('reconhece: %s', (msg) => expect(ehConflitoDeHorario(new Error(msg))).toBe(true));

  it.each(['connection refused', 'Unique constraint failed on the fields: (`token`)', ''])('não confunde com outro erro: %s', (msg) =>
    expect(ehConflitoDeHorario(new Error(msg))).toBe(false),
  );
  it('valor que não é erro: falso', () => expect(ehConflitoDeHorario('deadlock')).toBe(false));
});
