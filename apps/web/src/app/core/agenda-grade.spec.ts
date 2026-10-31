import {
  HORAS_PADRAO, MAX_DIAS_CONSULTA, andarNaVisao, contarPorDia, gradeDoMes, horaCheia, horasDeFuncionamento, janelaDaVisao, mesmoPeriodo, pontoDoSeletor,
  somarMeses, unirHoras,
} from './agenda-grade';
import { diaDaSemana } from './datas';

function dias(de: string, ate: string): number {
  return (Date.parse(ate) - Date.parse(de)) / 86_400_000 + 1;
}

describe('agenda-grade', () => {
  describe('gradeDoMes', () => {
    it('começa na segunda e completa as bordas com dias de outros meses', () => {
      const grade = gradeDoMes('2026-10-15'); // 1º de out/2026 é quinta; 31 é sábado
      expect(grade.length).toBe(5);
      expect(grade[0][0]).toEqual({ data: '2026-09-28', dentro: false });
      expect(grade[0][3]).toEqual({ data: '2026-10-01', dentro: true });
      expect(grade.at(-1)!.at(-1)).toEqual({ data: '2026-11-01', dentro: false });
      expect(grade.every((s) => s.length === 7)).toBeTrue();
      expect(grade.every((s) => diaDaSemana(s[0].data) === 1)).toBeTrue();
    });

    it('mês que começa na segunda e termina no domingo não ganha dias de fora', () => {
      const grade = gradeDoMes('2026-06-10'); // 1º de jun/2026 é segunda; 30 é terça
      expect(grade[0][0]).toEqual({ data: '2026-06-01', dentro: true });
      const fev = gradeDoMes('2027-02-01'); // fev/2027: segunda a domingo, 28 dias
      expect(fev.length).toBe(4);
      expect(fev.flat().every((c) => c.dentro)).toBeTrue();
    });

    it('chega a 6 semanas quando precisa (domingo no dia 1 de um mês de 31 dias)', () => {
      const grade = gradeDoMes('2026-03-10'); // 1º de mar/2026 é domingo
      expect(grade.length).toBe(6);
      expect(grade[0][0].data).toBe('2026-02-23');
      expect(grade.at(-1)!.at(-1)!.data).toBe('2026-04-05');
    });
  });

  describe('janelaDaVisao', () => {
    it('dia é o próprio dia; semana vai de segunda a domingo', () => {
      expect(janelaDaVisao('dia', '2026-10-15')).toEqual({ de: '2026-10-15', ate: '2026-10-15' });
      expect(janelaDaVisao('semana', '2026-10-15')).toEqual({ de: '2026-10-12', ate: '2026-10-18' });
    });

    it('mês cobre a grade inteira e nunca passa do limite da API', () => {
      for (let m = 0; m < 24; m++) {
        const data = somarMeses('2026-01-15', m);
        const { de, ate } = janelaDaVisao('mes', data);
        expect(dias(de, ate)).toBeLessThanOrEqual(42);
        expect(dias(de, ate) - 1).toBeLessThan(MAX_DIAS_CONSULTA);
        expect(diaDaSemana(de)).toBe(1);
        expect(diaDaSemana(ate)).toBe(0);
      }
    });
  });

  describe('somarMeses / andarNaVisao', () => {
    it('vira o ano e prende no último dia do mês curto', () => {
      expect(somarMeses('2026-12-15', 1)).toBe('2027-01-15');
      expect(somarMeses('2026-01-15', -1)).toBe('2025-12-15');
      expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
      expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
    });

    it('anda 1 dia, 1 semana ou 1 mês', () => {
      expect(andarNaVisao('dia', '2026-10-31', 1)).toBe('2026-11-01');
      expect(andarNaVisao('semana', '2026-10-31', -1)).toBe('2026-10-24');
      expect(andarNaVisao('mes', '2026-10-31', 1)).toBe('2026-11-30');
    });
  });

  it('mesmoPeriodo compara dia, semana e mês', () => {
    expect(mesmoPeriodo('dia', '2026-10-15', '2026-10-16')).toBeFalse();
    expect(mesmoPeriodo('semana', '2026-10-12', '2026-10-18')).toBeTrue();
    expect(mesmoPeriodo('semana', '2026-10-18', '2026-10-19')).toBeFalse();
    expect(mesmoPeriodo('mes', '2026-10-01', '2026-10-31')).toBeTrue();
  });

  it('pontoDoSeletor monta o texto e a microlinha de cada visão', () => {
    expect(pontoDoSeletor('dia', '2026-10-09')).toEqual({ texto: '9', micro: 'out' });
    expect(pontoDoSeletor('semana', '2026-10-15')).toEqual({ texto: '12 - 18', micro: 'out' });
    expect(pontoDoSeletor('semana', '2026-10-29')).toEqual({ texto: '26 - 1', micro: 'out nov' });
    expect(pontoDoSeletor('mes', '2026-10-15')).toEqual({ texto: 'out', micro: '2026' });
  });

  describe('contarPorDia', () => {
    it('ignora cancelados e usa o dia do salão, não o do aparelho', () => {
      const contagem = contarPorDia(
        [
          { inicio: '2026-10-15T13:00:00Z', status: 'AGENDADO' },
          { inicio: '2026-10-15T15:00:00Z', status: 'CONCLUIDO' },
          { inicio: '2026-10-15T16:00:00Z', status: 'CANCELADO' },
          { inicio: '2026-10-16T01:30:00Z', status: 'FALTOU' }, // 22:30 do dia 15 em São Paulo
        ],
        'America/Sao_Paulo',
      );
      expect(contagem.get('2026-10-15')).toBe(3);
      expect(contagem.has('2026-10-16')).toBeFalse();
    });

    it('dia só com cancelados não aparece', () => {
      expect(contarPorDia([{ inicio: '2026-10-15T13:00:00Z', status: 'CANCELADO' }], 'America/Sao_Paulo').size).toBe(0);
    });
  });

  describe('horas', () => {
    it('horaCheia pega a hora de um HH:MM', () => {
      expect(horaCheia('14:30')).toBe(14);
      expect(horaCheia('00:00')).toBe(0);
    });

    it('sem horário cadastrado vale 7h às 19h (fecha às 20h)', () => {
      expect(horasDeFuncionamento([])).toEqual([...HORAS_PADRAO]);
      expect(HORAS_PADRAO[0]).toBe(7);
      expect(HORAS_PADRAO.at(-1)).toBe(19);
    });

    it('horário de funcionamento vira a faixa de horas, arredondando para fora', () => {
      const faixas = [
        { diaSemana: 1, inicioMin: 9 * 60 + 30, fimMin: 12 * 60 },
        { diaSemana: 1, inicioMin: 14 * 60, fimMin: 18 * 60 + 15 },
        { diaSemana: 6, inicioMin: 8 * 60, fimMin: 13 * 60 },
      ];
      expect(horasDeFuncionamento(faixas)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    });

    it('unirHoras mantém uma hora com item fora do expediente, sem preencher o vão', () => {
      expect(unirHoras([9, 10, 11], [6, 10, 22])).toEqual([6, 9, 10, 11, 22]);
    });
  });
});
