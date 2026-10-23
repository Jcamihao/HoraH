/** 8000 -> "R$ 80"; 8050 -> "R$ 80,50". */
export function formatarReais(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  const resto = centavos % 100;
  const inteiro = reais.toLocaleString('pt-BR');
  return resto === 0 ? `R$ ${inteiro}` : `R$ ${inteiro},${String(resto).padStart(2, '0')}`;
}

/** "80", "80,5", "1.200,00" -> centavos. Devolve null se não for um valor válido. */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/\s|R\$/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, decimais = ''] = limpo.replace(/\./g, '').split(',');
  return Number(inteiro) * 100 + Number(decimais.padEnd(2, '0'));
}

/** Para preencher o campo: 8000 -> "80,00". */
export function reaisParaCampo(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
