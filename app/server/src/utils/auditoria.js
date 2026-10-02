import { db } from '../db/index.js';

// Histórico de alterações financeiras (regras-de-negocio.md, seção 4.10). Só se grava; nada é editado nem apagado.
// A linha é gravada logo depois da alteração, na mesma requisição.

export const CAMPOS_TAXA = [
  'apartamento_id', 'mes_referencia', 'ano_referencia', 'valor', 'juros', 'data_pagamento', 'situacao',
  'comprovante_path', 'cancelado_em', 'motivo_cancelamento',
];
export const CAMPOS_LANCAMENTO = ['descricao', 'valor', 'data', 'comprovante_path', 'bloco_id', 'cancelado_em', 'motivo_cancelamento'];
export const CAMPOS_CONFIGURACAO = ['multa_percentual', 'juros_mensal_percentual', 'dia_vencimento'];

// Foto dos campos relevantes de uma linha (campos ausentes, como as colunas de cancelamento antes da migração, ficam de fora).
export const instantaneo = (linha, campos) =>
  linha ? Object.fromEntries(campos.filter((c) => c in linha).map((c) => [c, linha[c]])) : null;

export const mudou = (antes, depois) => JSON.stringify(antes) !== JSON.stringify(depois);

export function registrarAuditoria(req, { entidade, entidadeId = null, acao, antes = null, depois = null, detalhe = null }) {
  db.prepare(
    `INSERT INTO auditoria (entidade, entidade_id, acao, usuario_id, usuario_email, antes, depois, detalhe)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entidade,
    entidadeId,
    acao,
    req.user?.sub ?? null,
    req.user?.email ?? null,
    antes === null ? null : JSON.stringify(antes),
    depois === null ? null : JSON.stringify(depois),
    detalhe
  );
}

export function rotuloDoApartamento(apartamentoId) {
  const apto = db
    .prepare('SELECT a.numero AS apartamento, b.numero AS bloco FROM apartamentos a JOIN blocos b ON b.id = a.bloco_id WHERE a.id = ?')
    .get(apartamentoId);
  return `Bl.${apto?.bloco ?? '?'}/Ap.${apto?.apartamento ?? '?'}`;
}

// "Bl.08/Ap.203 · 03/2026", para a lista do histórico.
export function rotuloDaTaxa(taxa) {
  const apto = db
    .prepare('SELECT a.numero AS apartamento, b.numero AS bloco FROM apartamentos a JOIN blocos b ON b.id = a.bloco_id WHERE a.id = ?')
    .get(taxa.apartamento_id);
  const mes = String(taxa.mes_referencia).padStart(2, '0');
  return `Bl.${apto?.bloco ?? '?'}/Ap.${apto?.apartamento ?? '?'} · ${mes}/${taxa.ano_referencia}`;
}

export function consultarAuditoria({ entidade, acao, entidade_id, usuario, de, ate, pagina = 1, limite = 50 }) {
  const condicoes = [];
  const params = {};
  if (entidade) { condicoes.push('entidade = @entidade'); params.entidade = entidade; }
  if (acao) { condicoes.push('acao = @acao'); params.acao = acao; }
  if (entidade_id) { condicoes.push('entidade_id = @entidade_id'); params.entidade_id = Number(entidade_id); }
  if (usuario) { condicoes.push('usuario_email LIKE @usuario'); params.usuario = `%${usuario}%`; }
  if (de) { condicoes.push('date(criado_em) >= @de'); params.de = de; }
  if (ate) { condicoes.push('date(criado_em) <= @ate'); params.ate = ate; }
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

  const tamanho = Math.min(Math.max(Number(limite) || 50, 1), 200);
  const numeroDaPagina = Math.max(Number(pagina) || 1, 1);
  const total = db.prepare(`SELECT COUNT(*) AS total FROM auditoria ${where}`).get(params).total;
  const itens = db
    .prepare(`SELECT * FROM auditoria ${where} ORDER BY id DESC LIMIT @limite OFFSET @deslocamento`)
    .all({ ...params, limite: tamanho, deslocamento: (numeroDaPagina - 1) * tamanho })
    .map((l) => ({
      ...l,
      antes: l.antes ? JSON.parse(l.antes) : null,
      depois: l.depois ? JSON.parse(l.depois) : null,
    }));
  return { total, pagina: numeroDaPagina, limite: tamanho, itens };
}
