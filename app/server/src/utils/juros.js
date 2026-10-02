// Multa e juros por atraso da taxa de condomínio (regras-de-negocio.md, seção 4.1.1).
//   juros = valor × (multa% + juros% ao mês × dias_em_atraso / 30), arredondado a 2 casas.
// Multa única e juros simples. Sem atraso (pagamento até o vencimento), tudo zero.

const DIA_MS = 24 * 60 * 60 * 1000;

// Arredonda para 2 casas, com meio centavo para cima (evita o erro de ponto flutuante: 8,125 → 8,13).
export const arredondar = (v) => Math.round(Number((v * 100).toFixed(6))) / 100;

export function ehDataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [ano, mes, dia] = texto.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

const emDias = (texto) => {
  const [ano, mes, dia] = texto.split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia) / DIA_MS;
};

export function vencimentoDe(ano, mes, diaVencimento) {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(diaVencimento).padStart(2, '0')}`;
}

// config: { multa_percentual, juros_mensal_percentual, dia_vencimento }
export function calcularJuros({ valor, mes_referencia, ano_referencia, data_pagamento }, config) {
  const vencimento = vencimentoDe(ano_referencia, mes_referencia, config.dia_vencimento);
  const diasEmAtraso = Math.max(0, emDias(data_pagamento) - emDias(vencimento));
  const multa = diasEmAtraso > 0 ? arredondar(valor * (config.multa_percentual / 100)) : 0;
  const juros = diasEmAtraso > 0
    ? arredondar(valor * ((config.multa_percentual + (config.juros_mensal_percentual * diasEmAtraso) / 30) / 100))
    : 0;
  return {
    vencimento,
    dias_em_atraso: diasEmAtraso,
    multa, // parte do total que é multa (informativo)
    juros, // multa + juros, o valor gravado na taxa
    total: arredondar(valor + juros),
  };
}
