import {
  dataBR, dataBRDoInstante, dataDoInstante, diasAte, diaCurto, diaDaSemana, diaLongo, horaDoInstante, hojeNoFuso, inicioDaSemana, intervaloCurto, rotuloDoDia, somarDias,
} from './datas';

describe('datas', () => {
  it('hoje, data e hora seguem o fuso do salão, não o do aparelho', () => {
    const instante = new Date('2026-10-26T01:30:00Z'); // 22:30 do dia 25 em São Paulo; 10:30 do dia 26 em Tóquio
    expect(hojeNoFuso('America/Sao_Paulo', instante)).toBe('2026-10-25');
    expect(hojeNoFuso('Asia/Tokyo', instante)).toBe('2026-10-26');
    expect(dataDoInstante('2026-10-26T01:30:00Z', 'America/Manaus')).toBe('2026-10-25');
    expect(horaDoInstante('2026-10-26T12:00:00Z', 'America/Sao_Paulo')).toBe('09:00');
    expect(horaDoInstante('2026-10-26T12:00:00Z', 'America/Manaus')).toBe('08:00');
  });

  it('meia-noite local aparece como 00:00, não 24:00', () => {
    expect(horaDoInstante('2026-10-26T03:00:00Z', 'America/Sao_Paulo')).toBe('00:00');
  });

  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('dia da semana: 0 = domingo; semana começa na segunda', () => {
    expect(diaDaSemana('2026-10-25')).toBe(0);
    expect(inicioDaSemana('2026-10-25')).toBe('2026-10-19'); // domingo pertence à semana que começou na segunda
    expect(inicioDaSemana('2026-10-26')).toBe('2026-10-26');
    expect(inicioDaSemana('2026-10-28')).toBe('2026-10-26');
  });

  it('rótulos em português', () => {
    expect(diaCurto('2026-10-22')).toBe('qui, 22 out');
    expect(diaLongo('2026-10-22')).toBe('quinta-feira, 22 de outubro');
    expect(intervaloCurto('2026-10-26', '2026-11-01')).toBe('26 out – 1 nov');
    expect(rotuloDoDia('2026-10-22', '2026-10-22')).toBe('Hoje');
    expect(rotuloDoDia('2026-10-23', '2026-10-22')).toBe('Amanhã');
    expect(rotuloDoDia('2026-10-21', '2026-10-22')).toBe('Ontem');
    expect(rotuloDoDia('2026-10-30', '2026-10-22')).toBe('sex, 30 out');
  });

  it('data em formato brasileiro, no calendário do salão', () => {
    expect(dataBR('2026-11-10')).toBe('10/11/2026');
    expect(dataBRDoInstante('2026-11-10T02:00:00Z', 'America/Sao_Paulo')).toBe('09/11/2026');
    expect(dataBRDoInstante('2026-11-10T02:00:00Z', 'Asia/Tokyo')).toBe('10/11/2026');
  });

  it('dias até um instante, arredondando para cima', () => {
    const agora = new Date('2026-10-23T12:00:00Z');
    expect(diasAte('2026-10-23T18:00:00Z', agora)).toBe(1);
    expect(diasAte('2026-10-25T12:00:00Z', agora)).toBe(2);
    expect(diasAte('2026-10-23T11:00:00Z', agora)).toBe(0);
    expect(diasAte('2026-10-20T12:00:00Z', agora)).toBe(-3);
  });
});
