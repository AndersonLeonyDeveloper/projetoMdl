import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { db, isUniqueConstraintError } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { COMPROVANTES_DIR, MIME_POR_EXTENSAO, salvarComprovante, uploadComprovante } from '../utils/comprovantes.js';

export const financeiroRouter = Router();
financeiroRouter.use(requireAuth);

// ---------- Comprovantes ----------
// Qualquer usuário autenticado pode ver. O nome do arquivo é validado antes de tocar no disco.

financeiroRouter.get('/comprovantes/:arquivo', (req, res) => {
  const { arquivo } = req.params;
  const extensao = arquivo.split('.').pop();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(arquivo) || !MIME_POR_EXTENSAO[extensao]) {
    return res.status(404).json({ error: 'Comprovante não encontrado.' });
  }
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(MIME_POR_EXTENSAO[extensao]);
  res.sendFile(arquivo, { root: COMPROVANTES_DIR, dotfiles: 'deny' }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Comprovante não encontrado.' });
  });
});

// ---------- Taxas de Condomínio ----------

financeiroRouter.get('/taxas', (req, res) => {
  const { ano, mes, bloco_id, apartamento_id } = req.query;
  const condicoes = [];
  const params = {};
  if (ano) { condicoes.push('t.ano_referencia = @ano'); params.ano = Number(ano); }
  if (mes) { condicoes.push('t.mes_referencia = @mes'); params.mes = Number(mes); }
  if (bloco_id) { condicoes.push('b.id = @bloco_id'); params.bloco_id = Number(bloco_id); }
  if (apartamento_id) { condicoes.push('a.id = @apartamento_id'); params.apartamento_id = Number(apartamento_id); }
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

  const taxas = db
    .prepare(
      `SELECT t.*, a.numero AS apartamento_numero, b.numero AS bloco_numero
       FROM taxas_condominio t
       JOIN apartamentos a ON a.id = t.apartamento_id
       JOIN blocos b ON b.id = a.bloco_id
       ${where}
       ORDER BY t.ano_referencia, t.mes_referencia, b.numero, a.numero`
    )
    .all(params);
  res.json(taxas);
});

financeiroRouter.post('/taxas', requireRole('admin'), uploadComprovante, (req, res) => {
  const { apartamento_id, mes_referencia, ano_referencia, valor, juros = 0 } = req.body ?? {};
  if (!apartamento_id || !mes_referencia || !ano_referencia || valor == null) {
    return res.status(400).json({
      error: 'apartamento_id, mes_referencia, ano_referencia e valor são obrigatórios.',
    });
  }
  const comprovante = salvarComprovante(req.file);
  if (comprovante.erro) return res.status(400).json({ error: comprovante.erro });
  try {
    const info = db
      .prepare(
        `INSERT INTO taxas_condominio
           (apartamento_id, mes_referencia, ano_referencia, valor, juros, situacao, meses_atraso, comprovante_path)
         VALUES (?, ?, ?, ?, ?, 'inadimplente', 0, ?)`
      )
      .run(apartamento_id, mes_referencia, ano_referencia, valor, juros, comprovante.nome);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (err) {
    if (comprovante.nome) fs.rmSync(path.join(COMPROVANTES_DIR, comprovante.nome), { force: true });
    if (isUniqueConstraintError(err)) {
      return res
        .status(409)
        .json({ error: 'Já existe uma taxa lançada para este apartamento neste mês/ano.' });
    }
    throw err;
  }
});

// Registrar pagamento: muda situação para adimplente e zera meses em atraso.
financeiroRouter.put('/taxas/:id/pagamento', requireRole('admin'), uploadComprovante, (req, res) => {
  const { data_pagamento } = req.body ?? {};
  if (!data_pagamento) {
    return res.status(400).json({ error: 'data_pagamento é obrigatória.' });
  }
  const comprovante = salvarComprovante(req.file);
  if (comprovante.erro) return res.status(400).json({ error: comprovante.erro });
  const info = db
    .prepare(
      `UPDATE taxas_condominio
       SET data_pagamento = ?, situacao = 'adimplente', meses_atraso = 0, comprovante_path = COALESCE(?, comprovante_path)
       WHERE id = ?`
    )
    .run(data_pagamento, comprovante.nome, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Taxa não encontrada.' });
  res.json({ message: 'Pagamento registrado.' });
});

// ---------- Outras Receitas ----------

financeiroRouter.get('/outras-receitas', (req, res) => {
  const { ano, mes } = req.query;
  const condicoes = [];
  const params = {};
  if (ano) { condicoes.push("strftime('%Y', data) = @ano"); params.ano = String(ano); }
  if (mes) { condicoes.push("strftime('%m', data) = @mes"); params.mes = String(mes).padStart(2, '0'); }
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  res.json(
    db.prepare(`SELECT * FROM outras_receitas ${where} ORDER BY data DESC`).all(params)
  );
});

financeiroRouter.post('/outras-receitas', requireRole('admin'), uploadComprovante, (req, res) => {
  const { descricao, valor, data } = req.body ?? {};
  if (!descricao || valor == null || !data) {
    return res.status(400).json({ error: 'descricao, valor e data são obrigatórios.' });
  }
  const comprovante = salvarComprovante(req.file);
  if (comprovante.erro) return res.status(400).json({ error: comprovante.erro });
  const info = db
    .prepare(
      'INSERT INTO outras_receitas (descricao, valor, data, comprovante_path) VALUES (?, ?, ?, ?)'
    )
    .run(descricao, valor, data, comprovante.nome);
  res.status(201).json({ id: info.lastInsertRowid });
});

// ---------- Despesas ----------

financeiroRouter.get('/despesas', (req, res) => {
  const { ano, mes } = req.query;
  const condicoes = [];
  const params = {};
  if (ano) { condicoes.push("strftime('%Y', data) = @ano"); params.ano = String(ano); }
  if (mes) { condicoes.push("strftime('%m', data) = @mes"); params.mes = String(mes).padStart(2, '0'); }
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  res.json(db.prepare(`SELECT * FROM despesas ${where} ORDER BY data DESC`).all(params));
});

financeiroRouter.post('/despesas', requireRole('admin'), uploadComprovante, (req, res) => {
  const { descricao, valor, data } = req.body ?? {};
  if (!descricao || valor == null || !data) {
    return res.status(400).json({ error: 'descricao, valor e data são obrigatórios.' });
  }
  const comprovante = salvarComprovante(req.file);
  if (comprovante.erro) return res.status(400).json({ error: comprovante.erro });
  const info = db
    .prepare(
      'INSERT INTO despesas (descricao, valor, data, comprovante_path) VALUES (?, ?, ?, ?)'
    )
    .run(descricao, valor, data, comprovante.nome);
  res.status(201).json({ id: info.lastInsertRowid });
});

// ---------- Resumos ----------

// Visão geral do mês (equivalente ao card "JANEIRO" do protótipo): receita - despesa.
financeiroRouter.get('/resumo/mensal', (req, res) => {
  const { ano, mes } = req.query;
  if (!ano || !mes) return res.status(400).json({ error: 'ano e mes são obrigatórios.' });

  const receitasTaxas = db
    .prepare(
      `SELECT COALESCE(SUM(valor + juros), 0) AS total FROM taxas_condominio
       WHERE ano_referencia = ? AND mes_referencia = ? AND situacao = 'adimplente'`
    )
    .get(ano, mes).total;

  const receitasOutras = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM outras_receitas
       WHERE strftime('%Y', data) = ? AND strftime('%m', data) = ?`
    )
    .get(String(ano), String(mes).padStart(2, '0')).total;

  const despesas = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
       WHERE strftime('%Y', data) = ? AND strftime('%m', data) = ?`
    )
    .get(String(ano), String(mes).padStart(2, '0')).total;

  const receitas = receitasTaxas + receitasOutras;
  res.json({ receitas, despesas, saldo: receitas - despesas });
});

// Visão por bloco (equivalente aos cards "Bloco 1..6" do protótipo).
// Nota: o protótipo original calcula "Saldo" do card de bloco como Adimplente - Inadimplente
// (não como receita - despesa). Mantido assim de propósito para refletir a regra observada —
// ver regras-de-negocio.md, seção 7 (ambiguidades a validar).
financeiroRouter.get('/resumo/blocos', (req, res) => {
  const { ano, mes } = req.query;
  if (!ano || !mes) return res.status(400).json({ error: 'ano e mes são obrigatórios.' });

  const linhas = db
    .prepare(
      `SELECT
         b.numero AS bloco_numero,
         COALESCE(SUM(CASE WHEN t.situacao = 'adimplente' THEN t.valor + t.juros ELSE 0 END), 0) AS adimplente,
         COALESCE(SUM(CASE WHEN t.situacao = 'inadimplente' THEN t.valor + t.juros ELSE 0 END), 0) AS inadimplente
       FROM blocos b
       LEFT JOIN apartamentos a ON a.bloco_id = b.id
       LEFT JOIN taxas_condominio t
         ON t.apartamento_id = a.id AND t.ano_referencia = ? AND t.mes_referencia = ?
       GROUP BY b.id
       ORDER BY b.numero`
    )
    .all(ano, mes);

  res.json(
    linhas.map((linha) => ({
      ...linha,
      saldo: linha.adimplente - linha.inadimplente,
    }))
  );
});

// Consolidado de inadimplência por ano (para a tela "Taxa de Inadimplência").
financeiroRouter.get('/resumo/inadimplencia', requireRole('admin'), (req, res) => {
  const { ano } = req.query;
  if (!ano) return res.status(400).json({ error: 'ano é obrigatório.' });

  const linhas = db
    .prepare(
      `SELECT
         mes_referencia,
         COALESCE(SUM(CASE WHEN situacao = 'adimplente' THEN valor + juros ELSE 0 END), 0) AS adimplente,
         COALESCE(SUM(CASE WHEN situacao = 'inadimplente' THEN valor + juros ELSE 0 END), 0) AS inadimplente
       FROM taxas_condominio
       WHERE ano_referencia = ?
       GROUP BY mes_referencia
       ORDER BY mes_referencia`
    )
    .all(ano);

  res.json(linhas);
});

// Evolução mês a mês (para a tela "Evolução"): receitas, despesas e inadimplência no período.
// Taxas entram pela competência (mês de referência), como em /resumo/mensal.
// "atrasadas" = pagas depois do dia 10 ou ainda em aberto (a inadimplência no vencimento).
financeiroRouter.get('/resumo/evolucao', requireRole('admin'), (req, res) => {
  const anoInicio = Number(req.query.ano_inicio);
  const anoFim = Number(req.query.ano_fim);
  if (!anoInicio || !anoFim || anoInicio > anoFim) {
    return res.status(400).json({ error: 'ano_inicio e ano_fim são obrigatórios (ano_inicio <= ano_fim).' });
  }

  const taxas = db
    .prepare(
      `SELECT
         ano_referencia AS ano,
         mes_referencia AS mes,
         COUNT(*) AS unidades,
         COALESCE(SUM(valor), 0) AS faturamento,
         COALESCE(SUM(CASE WHEN situacao = 'adimplente' THEN valor + juros ELSE 0 END), 0) AS receitas_taxas,
         SUM(CASE WHEN data_pagamento IS NULL
                    OR data_pagamento > printf('%04d-%02d-10', ano_referencia, mes_referencia)
                  THEN 1 ELSE 0 END) AS atrasadas,
         SUM(CASE WHEN situacao = 'inadimplente' THEN 1 ELSE 0 END) AS em_aberto,
         SUM(CASE WHEN situacao = 'inadimplente' AND meses_atraso >= 3 THEN 1 ELSE 0 END) AS em_aberto_3_meses
       FROM taxas_condominio
       WHERE ano_referencia BETWEEN ? AND ?
       GROUP BY ano_referencia, mes_referencia`
    )
    .all(anoInicio, anoFim);

  const somaPorMes = (tabela) =>
    new Map(
      db
        .prepare(
          `SELECT strftime('%Y', data) AS ano, strftime('%m', data) AS mes, SUM(valor) AS total
           FROM ${tabela}
           WHERE CAST(strftime('%Y', data) AS INTEGER) BETWEEN ? AND ?
           GROUP BY ano, mes`
        )
        .all(anoInicio, anoFim)
        .map((l) => [`${Number(l.ano)}-${Number(l.mes)}`, l.total])
    );
  const outrasReceitas = somaPorMes('outras_receitas');
  const despesas = somaPorMes('despesas');

  res.json(
    taxas
      .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
      .map((t) => {
        const chave = `${t.ano}-${t.mes}`;
        return {
          ...t,
          receitas_outras: outrasReceitas.get(chave) ?? 0,
          despesas: despesas.get(chave) ?? 0,
        };
      })
  );
});
