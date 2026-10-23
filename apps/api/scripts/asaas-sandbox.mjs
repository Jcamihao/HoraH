// Confere o contrato com o Asaas DE VERDADE (sandbox): cria cliente e assinatura de teste, lê as cobranças,
// muda o valor, cancela, e verifica que os campos que o Hora H usa existem nas respostas.
// Uso: ASAAS_API_KEY='$aact_...' node apps/api/scripts/asaas-sandbox.mjs   (nunca roda contra produção)
const chave = process.env.ASAAS_API_KEY;
const base = (process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/+$/, '');
if (!chave) { console.error('Defina ASAAS_API_KEY (chave do SANDBOX).'); process.exit(2); }
if (!base.includes('sandbox')) { console.error(`Recusado: ${base} não é sandbox. Este script cria e apaga dados.`); process.exit(2); }

let falhas = 0;
const confere = (ok, texto) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${texto}`); if (!ok) falhas += 1; };
async function chamar(metodo, caminho, corpo) {
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers: { 'content-type': 'application/json', access_token: chave, 'user-agent': 'HoraH' }, body: corpo ? JSON.stringify(corpo) : undefined });
  const texto = await r.text();
  let json; try { json = JSON.parse(texto); } catch { json = texto; }
  if (!r.ok) throw new Error(`${metodo} ${caminho} -> ${r.status} ${texto.slice(0, 300)}`);
  return json;
}

const ref = `horah-sandbox-${Date.now()}`;
const venc = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
let assinaturaId;
try {
  const cliente = await chamar('POST', '/customers', { name: 'Teste Hora H', cpfCnpj: '52998224725', email: 'teste@exemplo.com', externalReference: ref });
  confere(typeof cliente.id === 'string' && cliente.id.startsWith('cus_'), `criar cliente devolve id (${cliente.id})`);

  const sub = await chamar('POST', '/subscriptions', { customer: cliente.id, billingType: 'UNDEFINED', value: 29.9, nextDueDate: venc, cycle: 'MONTHLY', description: 'Hora H: teste de contrato', externalReference: ref });
  assinaturaId = sub.id;
  confere(typeof sub.id === 'string' && sub.id.startsWith('sub_'), `criar assinatura devolve id (${sub.id})`);
  confere(sub.nextDueDate === venc, `nextDueDate = ${venc} (veio ${sub.nextDueDate})`);
  confere(sub.billingType === 'UNDEFINED', `billingType UNDEFINED aceito (veio ${sub.billingType})`);

  const pags = await chamar('GET', `/subscriptions/${sub.id}/payments?limit=50`);
  const p = pags.data?.[0];
  confere(Array.isArray(pags.data) && pags.data.length >= 1, 'a assinatura já nasce com a 1ª cobrança');
  if (p) {
    for (const campo of ['id', 'status', 'value', 'dueDate', 'invoiceUrl', 'subscription']) confere(p[campo] !== undefined && p[campo] !== null, `cobrança tem "${campo}" (${JSON.stringify(p[campo])})`);
    confere(p.status === 'PENDING', `status inicial PENDING (veio ${p.status})`);
    confere(p.dueDate === venc, `dueDate da 1ª cobrança = ${venc}`);
    confere(p.subscription === sub.id, 'cobrança aponta para a assinatura');
    confere(typeof p.invoiceUrl === 'string' && p.invoiceUrl.startsWith('http'), 'invoiceUrl é uma URL (onde o dono escolhe Pix, cartão ou boleto)');
  }

  const lista = await chamar('GET', `/subscriptions?externalReference=${encodeURIComponent(ref)}&limit=10`);
  confere(lista.data?.some((s) => s.id === sub.id), 'busca por externalReference acha a assinatura (usada para não duplicar)');

  const mudou = await chamar('PUT', `/subscriptions/${sub.id}`, { value: 59.9, updatePendingPayments: false });
  confere(Number(mudou.value) === 59.9, `PUT muda o valor da assinatura (veio ${mudou.value})`);
  const depois = await chamar('GET', `/subscriptions/${sub.id}/payments?limit=50`);
  confere(depois.data?.[0]?.value === 29.9, `a cobrança já gerada NÃO muda com updatePendingPayments=false (veio ${depois.data?.[0]?.value})`);

  const lido = await chamar('GET', `/subscriptions/${sub.id}`);
  confere(lido.nextDueDate === venc, 'GET da assinatura devolve nextDueDate');
} catch (e) {
  console.error('ERRO:', e.message);
  falhas += 1;
} finally {
  if (assinaturaId) {
    try {
      const r = await chamar('DELETE', `/subscriptions/${assinaturaId}`);
      confere(r.deleted === true, 'DELETE cancela a assinatura (deleted: true)');
      const aposApagar = await chamar('GET', `/subscriptions/${assinaturaId}`);
      confere(aposApagar.deleted === true || aposApagar.status === 'INACTIVE', `assinatura apagada aparece como deleted/INACTIVE (veio deleted=${aposApagar.deleted}, status=${aposApagar.status})`);
    } catch (e) {
      console.error('Não consegui apagar a assinatura de teste:', e.message);
      falhas += 1;
    }
  }
}
console.log(falhas ? `\n${falhas} conferência(s) falharam: o cliente do Hora H precisa de ajuste.` : '\nTudo conferido: o contrato com o sandbox bate com o que o Hora H usa.');
process.exit(falhas ? 1 : 0);
