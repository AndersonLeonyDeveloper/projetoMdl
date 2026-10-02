import { db, lerConfiguracao } from '../db/index.js';
import { hojeISO } from './juros.js';

// Fundo de reserva (regras-de-negocio.md, seção 4.13). Nada é gravado: tudo é calculado das taxas e despesas existentes.
//  - aportes: o percentual do ano de referência da taxa, aplicado ao valor (sem juros) das taxas PAGAS, no mês do pagamento
//    (caixa). Taxas de um ano sem valor configurado não geram aporte.
//  - retiradas: despesas marcadas "paga pelo fundo de reserva", no mês da despesa.
//  - cancelados ficam de fora. Só entram movimentos até o mês corrente.
export function calcularFundo() {
  const mesCorrente = hojeISO().slice(0, 7);
  const saldoInicial = lerConfiguracao().fundo_saldo_inicial ?? 0;

  const aportes = db
    .prepare(
      `SELECT strftime('%Y-%m', t.data_pagamento) AS mes, SUM(t.valor * tp.fundo_percentual / 100.0) AS total
       FROM taxas_condominio t
       JOIN taxa_padrao tp ON tp.ano = t.ano_referencia
       WHERE t.situacao = 'adimplente' AND t.data_pagamento IS NOT NULL AND t.cancelado_em IS NULL
         AND strftime('%Y-%m', t.data_pagamento) <= @mesCorrente
       GROUP BY mes`
    )
    .all({ mesCorrente });
  const retiradas = db
    .prepare(
      `SELECT strftime('%Y-%m', data) AS mes, SUM(valor) AS total
       FROM despesas
       WHERE fundo_reserva = 1 AND cancelado_em IS NULL AND strftime('%Y-%m', data) <= @mesCorrente
       GROUP BY mes`
    )
    .all({ mesCorrente });

  const porMes = new Map();
  for (const { mes, total } of aportes) porMes.set(mes, { aportes: total, retiradas: 0 });
  for (const { mes, total } of retiradas) {
    porMes.set(mes, { aportes: porMes.get(mes)?.aportes ?? 0, retiradas: total });
  }

  const arredondar = (v) => Math.round(v * 100) / 100;
  let saldo = saldoInicial;
  const movimentos = [...porMes.keys()].sort().map((mes) => {
    const { aportes: a, retiradas: r } = porMes.get(mes);
    saldo = arredondar(saldo + a - r);
    const [ano, mm] = mes.split('-').map(Number);
    return { ano, mes: mm, aportes: arredondar(a), retiradas: arredondar(r), saldo };
  });

  const obras = db
    .prepare(
      `SELECT d.id, d.descricao, d.valor, d.data, b.numero AS bloco_numero
       FROM despesas d LEFT JOIN blocos b ON b.id = d.bloco_id
       WHERE d.fundo_reserva = 1 AND d.cancelado_em IS NULL AND strftime('%Y-%m', d.data) <= @mesCorrente
       ORDER BY d.data DESC, d.id DESC`
    )
    .all({ mesCorrente });

  const aportesTotal = arredondar(movimentos.reduce((s, m) => s + m.aportes, 0));
  const retiradasTotal = arredondar(movimentos.reduce((s, m) => s + m.retiradas, 0));
  return {
    saldo_inicial: saldoInicial,
    aportes_total: aportesTotal,
    retiradas_total: retiradasTotal,
    saldo_atual: arredondar(saldoInicial + aportesTotal - retiradasTotal),
    percentuais: db.prepare('SELECT ano, fundo_percentual AS percentual FROM taxa_padrao ORDER BY ano').all(),
    movimentos,
    obras,
  };
}
