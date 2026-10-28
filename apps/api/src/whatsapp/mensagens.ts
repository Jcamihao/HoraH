import { DateTime } from 'luxon';

/** "sexta-feira, 23/10 às 10:00" no fuso do salão. */
export function quandoPorExtenso(inicio: Date, fuso: string): string {
  return DateTime.fromJSDate(inicio, { zone: fuso }).setLocale('pt-BR').toFormat("cccc, dd/MM 'às' HH:mm");
}

export interface DadosMensagem {
  nome: string;
  salao: string;
  servico: string;
  profissional: string;
  quando: string;
  link: string;
}

/** Textos que o cliente recebe. Curtos, sem enfeite, e sempre com o que fazer a seguir. */
export const textos = {
  confirmacao: (d: DadosMensagem, remarcado: boolean) =>
    [
      `Olá, ${d.nome}! ${remarcado ? 'Seu horário foi remarcado.' : 'Seu horário está confirmado.'}`,
      '',
      `${d.servico} com ${d.profissional}`,
      d.quando,
      d.salao,
      '',
      `Para ver, remarcar ou cancelar: ${d.link}`,
    ].join('\n'),

  lembrete: (d: DadosMensagem) =>
    [
      `Olá, ${d.nome}! Lembrete do seu horário.`,
      '',
      `${d.servico} com ${d.profissional}`,
      d.quando,
      d.salao,
      '',
      'Para CONFIRMAR, responda 1. Para CANCELAR, responda 2.',
      'Se não responder em 2 horas, o horário será liberado para outra pessoa.',
      '',
      `Ver ou remarcar: ${d.link}`,
    ].join('\n'),

  cancelamentoAutomatico: (d: DadosMensagem) =>
    [
      `Olá, ${d.nome}. Como não recebemos sua resposta, liberamos o horário de ${d.quando} (${d.servico} com ${d.profissional}).`,
      '',
      `Para marcar de novo: ${d.link}`,
    ].join('\n'),
};
