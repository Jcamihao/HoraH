import type { Email } from './mail.transport';

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Mensagem simples e legível em qualquer leitor de e-mail: texto puro e um HTML sem imagem nem script. */
function montar(para: string, assunto: string, paragrafos: string[], acao?: { rotulo: string; url: string }): Email {
  const texto = [...paragrafos, ...(acao ? [`${acao.rotulo}: ${acao.url}`] : []), '', 'Hora H'].join('\n\n');
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f2f2f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111113">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.2">${escapar(assunto)}</h1>
${paragrafos.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5">${escapar(p)}</p>`).join('\n')}
${acao ? `<p style="margin:22px 0 4px"><a href="${escapar(acao.url)}" style="display:inline-block;padding:14px 22px;background:#0a72e8;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">${escapar(acao.rotulo)}</a></p>` : ''}
<p style="margin:24px 0 0;font-size:13px;color:#6c6c70">Hora H</p>
</div></body></html>`;
  return { para, assunto, texto, html };
}

const reais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;

interface Base {
  para: string;
  link: string;
}

export const emails = {
  testeAcabando: (d: Base & { dias: number; fimEm: string }): Email =>
    montar(d.para, `Seu teste grátis acaba ${d.dias === 1 ? 'amanhã' : `em ${d.dias} dias`}`, [
      `Seu teste de 7 dias do Hora H termina em ${d.fimEm}.`,
      'Para seus clientes continuarem marcando horário sem interrupção, escolha a forma de pagamento antes dessa data. Seus dados e agendamentos continuam guardados de qualquer jeito.',
    ], { rotulo: 'Assinar agora', url: d.link }),

  testeAcabou: (d: Base & { ate: string }): Email =>
    montar(d.para, 'Seu teste grátis acabou', [
      `O teste de 7 dias terminou. Você ainda tem até ${d.ate} com tudo funcionando normalmente.`,
      'Depois dessa data, novos clientes deixam de conseguir marcar horário. Os agendamentos que já existem e todos os seus dados ficam guardados.',
    ], { rotulo: 'Assinar agora', url: d.link }),

  cobrancaVencida: (d: Base & { vencimento: string; valorCentavos: number; ate: string }): Email =>
    montar(d.para, 'Sua cobrança do Hora H venceu', [
      `A cobrança de ${reais(d.valorCentavos)} com vencimento em ${d.vencimento} não foi paga.`,
      `Você tem até ${d.ate} para pagar sem nenhuma interrupção. Depois disso, novos clientes não conseguem marcar horário até o pagamento. Seus dados e agendamentos continuam guardados.`,
    ], { rotulo: 'Pagar agora', url: d.link }),

  toleranciaUltimoDia: (d: Base & { ate: string }): Email =>
    montar(d.para, 'Último dia para regularizar sua assinatura', [
      `Amanhã, depois de ${d.ate}, novos agendamentos serão bloqueados no seu link.`,
      'Pagando hoje nada muda para você nem para seus clientes.',
    ], { rotulo: 'Regularizar agora', url: d.link }),

  bloqueado: (d: Base): Email =>
    montar(d.para, 'Novos agendamentos estão bloqueados', [
      'Sem o pagamento da assinatura, seus clientes não conseguem mais marcar horário pelo link.',
      'Os agendamentos que já existem e todos os seus dados continuam guardados. Assim que o pagamento for confirmado, tudo volta ao normal automaticamente.',
    ], { rotulo: 'Pagar e liberar', url: d.link }),

  pagamentoConfirmado: (d: Base & { proxima: string | null }): Email =>
    montar(d.para, 'Pagamento confirmado, obrigado!', [
      'Recebemos o pagamento da sua assinatura e tudo está liberado.',
      ...(d.proxima ? [`A próxima cobrança será em ${d.proxima}.`] : []),
    ], { rotulo: 'Ver minha assinatura', url: d.link }),

  faixaMudou: (d: Base & { de: number; para_: number; valorCentavos: number }): Email =>
    montar(d.para, 'O valor da sua assinatura vai mudar', [
      `Com a mudança no número de profissionais, o plano passou de ${reais(d.de)} para ${reais(d.para_)} por mês.`,
      `O novo valor (${reais(d.valorCentavos)}) vale a partir da próxima cobrança. A cobrança atual não muda.`,
    ], { rotulo: 'Ver minha assinatura', url: d.link }),

  lembreteNaoEntregue: (d: Base & { cliente: string; quando: string }): Email =>
    montar(d.para, `Lembrete não entregue: ${d.cliente}`, [
      `O WhatsApp não confirmou a entrega do lembrete para ${d.cliente} (horário: ${d.quando}).`,
      'O agendamento continua marcado e não será cancelado sozinho, porque não sabemos se a mensagem chegou. Vale falar com o cliente.',
    ], { rotulo: 'Ver notificações', url: d.link }),

  whatsappCaiu: (d: Base): Email =>
    montar(d.para, 'O WhatsApp do seu salão desconectou', [
      'Os lembretes e o bot de agendamento pararam de funcionar porque o número foi desconectado.',
      'Reconecte lendo o QR code de novo. Os horários já marcados continuam guardados.',
    ], { rotulo: 'Reconectar o WhatsApp', url: d.link }),

  novoAgendamento: (d: Base & { cliente: string; servico: string; profissional: string; quando: string }): Email =>
    montar(d.para, `Novo agendamento: ${d.cliente}, ${d.quando}`, [
      `${d.cliente} marcou ${d.servico} com ${d.profissional} para ${d.quando}.`,
    ], { rotulo: 'Abrir a agenda', url: d.link }),

  agendamentoCancelado: (d: Base & { cliente: string; servico: string; profissional: string; quando: string; por: string }): Email =>
    montar(d.para, `Agendamento cancelado: ${d.cliente}, ${d.quando}`, [
      `${d.por} cancelou o horário de ${d.cliente} (${d.servico} com ${d.profissional}) em ${d.quando}. O horário voltou a ficar livre.`,
    ], { rotulo: 'Abrir a agenda', url: d.link }),
};
