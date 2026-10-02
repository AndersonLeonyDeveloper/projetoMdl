import { db, lerConfiguracao } from '../db/index.js';
import { calcularJuros, ehDataValida, hojeISO, sqlVencida } from './juros.js';
import { registrarAuditoria } from './auditoria.js';

// Acordos de dívida (regras-de-negocio.md, seção 4.14).

// Dias depois do vencimento de uma parcela sem pagamento para o acordo ser considerado descumprido.
export const CARENCIA_DIAS = 5;
export const MAX_PARCELAS = 60;

const arredondar = (v) => Math.round(v * 100) / 100;

// Verdadeiro quando a taxa está coberta por um acordo ativo ou quitado: ela não conta como atraso nem como a vencer, e
// o dinheiro é recebido pelas parcelas. `p` é o prefixo da tabela da taxa (ex.: 't.').
export const sqlEmAcordo = (p = '') =>
  `EXISTS (SELECT 1 FROM acordo_taxas at_ JOIN acordos ac_ ON ac_.id = at_.acordo_id
           WHERE at_.taxa_id = ${p}id AND ac_.status IN ('ativo', 'quitado'))`;

// Acordo ativo com parcela vencida há mais de CARENCIA_DIAS sem pagamento passa a descumprido (e as taxas voltam a "em atraso").
// Roda no começo das requisições financeiras, então o status nunca fica desatualizado.
export function atualizarStatusDosAcordos() {
  const hoje = hojeISO();
  const vencidos = db
    .prepare(
      `SELECT a.id FROM acordos a
       WHERE a.status = 'ativo' AND EXISTS (
         SELECT 1 FROM acordo_parcelas p
         WHERE p.acordo_id = a.id AND p.data_pagamento IS NULL AND date(p.vencimento, '+${CARENCIA_DIAS} days') < @hoje)`
    )
    .all({ hoje });
  for (const { id } of vencidos) {
    db.prepare("UPDATE acordos SET status = 'descumprido', encerrado_em = datetime('now') WHERE id = ?").run(id);
    registrarAuditoria({ user: null }, {
      entidade: 'acordo', entidadeId: id, acao: 'descumprir',
      antes: { status: 'ativo' }, depois: { status: 'descumprido' },
      detalhe: `Parcela vencida há mais de ${CARENCIA_DIAS} dias sem pagamento`,
    });
  }
}

// Soma n meses a uma data AAAA-MM-DD mantendo o dia (ou o último dia do mês, se não existir).
export function somarMeses(dataISO, n) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  const total = ano * 12 + (mes - 1) + n;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
  return `${String(novoAno).padStart(4, '0')}-${String(novoMes).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`;
}

// Taxas do apartamento que podem entrar em um acordo: em aberto, já vencidas, não canceladas e fora de outro acordo.
// Traz o juros (multa + juros) calculado até hoje, como se fossem pagas hoje.
export function taxasElegiveis(apartamentoId, hoje = hojeISO()) {
  const configuracao = lerConfiguracao();
  return db
    .prepare(
      `SELECT t.* FROM taxas_condominio t
       WHERE t.apartamento_id = @apartamento AND t.situacao = 'inadimplente' AND t.cancelado_em IS NULL
         AND ${sqlVencida('t.')} AND NOT ${sqlEmAcordo('t.')}
       ORDER BY t.ano_referencia, t.mes_referencia`
    )
    .all({ apartamento: apartamentoId, dia: configuracao.dia_vencimento, hoje })
    .map((t) => {
      const { juros, dias_em_atraso } = calcularJuros({ ...t, data_pagamento: hoje }, configuracao);
      return {
        id: t.id,
        mes_referencia: t.mes_referencia,
        ano_referencia: t.ano_referencia,
        valor: t.valor,
        juros,
        dias_em_atraso,
        total: arredondar(t.valor + juros),
      };
    });
}

// Valida os dados e calcula o acordo (sem gravar): taxas, valores e parcelas. Usado na simulação e na criação.
export function montarAcordo(corpo, hoje = hojeISO()) {
  const apartamentoId = Number(corpo?.apartamento_id);
  const taxaIds = [...new Set((Array.isArray(corpo?.taxa_ids) ? corpo.taxa_ids : []).map(Number))];
  if (!taxaIds.length || taxaIds.some((id) => !Number.isInteger(id))) {
    return { status: 400, erro: 'Escolha ao menos uma taxa em atraso para o acordo.' };
  }
  const numeroDeParcelas = Number(corpo?.parcelas);
  if (!Number.isInteger(numeroDeParcelas) || numeroDeParcelas < 1 || numeroDeParcelas > MAX_PARCELAS) {
    return { status: 400, erro: `parcelas deve ser um inteiro de 1 a ${MAX_PARCELAS}.` };
  }
  const primeiroVencimento = corpo?.primeiro_vencimento;
  if (!ehDataValida(primeiroVencimento) || primeiroVencimento < hoje) {
    return { status: 400, erro: 'primeiro_vencimento deve ser uma data válida, de hoje em diante (AAAA-MM-DD).' };
  }
  const numero = (v) => (v === undefined || v === null || v === '' ? 0 : Number(v));
  const entrada = numero(corpo?.entrada);
  const desconto = numero(corpo?.desconto);
  if (!Number.isFinite(entrada) || entrada < 0) return { status: 400, erro: 'entrada deve ser um número maior ou igual a zero.' };
  if (!Number.isFinite(desconto) || desconto < 0) return { status: 400, erro: 'desconto deve ser um número maior ou igual a zero.' };
  const observacao = typeof corpo?.observacao === 'string' ? corpo.observacao.trim() : '';
  if (observacao.length > 300) return { status: 400, erro: 'observacao deve ter até 300 caracteres.' };

  const elegiveis = new Map(taxasElegiveis(apartamentoId, hoje).map((t) => [t.id, t]));
  const fora = taxaIds.filter((id) => !elegiveis.has(id));
  if (fora.length) {
    return {
      status: 409,
      erro: 'Só podem entrar no acordo taxas em atraso deste apartamento que não estejam canceladas nem em outro acordo.',
    };
  }
  const taxas = taxaIds.map((id) => elegiveis.get(id)).sort((a, b) => a.ano_referencia - b.ano_referencia || a.mes_referencia - b.mes_referencia);

  const valorTaxas = arredondar(taxas.reduce((s, t) => s + t.valor, 0));
  const juros = arredondar(taxas.reduce((s, t) => s + t.juros, 0));
  const bruto = arredondar(valorTaxas + juros);
  if (desconto >= bruto) return { status: 400, erro: 'O desconto deve ser menor que o valor do acordo.' };
  const valorTotal = arredondar(bruto - desconto);
  if (entrada >= valorTotal) return { status: 400, erro: 'A entrada deve ser menor que o valor total do acordo.' };

  const restante = arredondar(valorTotal - entrada);
  const base = Math.floor((restante * 100) / numeroDeParcelas) / 100;
  const parcelas = [];
  if (entrada > 0) parcelas.push({ numero: 0, vencimento: hoje, valor: arredondar(entrada) });
  for (let i = 1; i <= numeroDeParcelas; i++) {
    parcelas.push({
      numero: i,
      vencimento: somarMeses(primeiroVencimento, i - 1),
      valor: i === numeroDeParcelas ? arredondar(restante - base * (numeroDeParcelas - 1)) : base,
    });
  }
  return {
    apartamento_id: apartamentoId,
    taxas,
    valor_taxas: valorTaxas,
    juros,
    desconto: arredondar(desconto),
    valor_total: valorTotal,
    entrada: arredondar(entrada),
    observacao: observacao || null,
    parcelas,
  };
}
