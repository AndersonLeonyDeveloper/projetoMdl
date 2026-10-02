import { Router } from 'express';
import { db, isUniqueConstraintError, withTransaction } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  COMPROVANTES_DIR,
  MIME_POR_EXTENSAO,
  apagarComprovante,
  salvarComprovante,
  uploadComprovante,
} from '../utils/comprovantes.js';
import { calcularJuros, ehDataValida } from '../utils/juros.js';

export const financeiroRouter = Router();
financeiroRouter.use(requireAuth);

// ---------- Helpers de leitura do corpo (multipart envia tudo como texto) ----------

const vazio = (v) => v === undefined || v === null || v === '';
const ehVerdadeiro = (v) => v === true || v === 'true' || v === '1' || v === 'on';
const lerInteiro = (v) => (vazio(v) || !Number.isInteger(Number(v)) ? null : Number(v));
const lerNumeroNaoNegativo = (v) => (vazio(v) || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));
const lerConfiguracao = () => db.prepare('SELECT * FROM configuracao_financeira WHERE id = 1').get();

// Campos de despesa e outra receita: descrição, valor (>= 0) e data válida.
function lerLancamento(corpo = {}) {
  const descricao = typeof corpo.descricao === 'string' ? corpo.descricao.trim() : '';
  if (!descricao || vazio(corpo.valor) || vazio(corpo.data)) {
    return { erro: 'descricao, valor e data são obrigatórios.' };
  }
  const valor = lerNumeroNaoNegativo(corpo.valor);
  if (valor === null) return { erro: 'valor deve ser um número maior ou igual a zero.' };
  if (!ehDataValida(corpo.data)) return { erro: 'data deve ser uma data válida (AAAA-MM-DD).' };
  return { descricao, valor, data: corpo.data };
}

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
    apagarComprovante(comprovante.nome);
    if (isUniqueConstraintError(err)) {
      return res
        .status(409)
        .json({ error: 'Já existe uma taxa lançada para este apartamento neste mês/ano.' });
    }
    throw err;
  }
});

// Gera, de uma vez, a taxa do mês para todos os apartamentos que ainda não têm uma.
// Usa o valor configurado para o ano; não altera taxas já existentes (idempotente).
financeiroRouter.post('/taxas/gerar-mes', requireRole('admin'), (req, res) => {
  const mes = lerInteiro(req.body?.mes_referencia);
  const ano = lerInteiro(req.body?.ano_referencia);
  if (!mes || mes < 1 || mes > 12 || !ano || ano < 1900 || ano > 2999) {
    return res.status(400).json({ error: 'mes_referencia (1–12) e ano_referencia são obrigatórios.' });
  }
  const padrao = db.prepare('SELECT valor FROM taxa_padrao WHERE ano = ?').get(ano);
  if (!padrao) {
    return res.status(400).json({
      error: `Não há valor de taxa configurado para ${ano}. Defina-o em Configurações financeiras.`,
    });
  }
  const insert = db.prepare(
    `INSERT OR IGNORE INTO taxas_condominio
       (apartamento_id, mes_referencia, ano_referencia, valor, juros, situacao, meses_atraso)
     SELECT id, ?, ?, ?, 0, 'inadimplente', 0 FROM apartamentos`
  );
  const totalApartamentos = db.prepare('SELECT COUNT(*) AS total FROM apartamentos').get().total;
  const criadas = Number(withTransaction(() => insert.run(mes, ano, padrao.valor)).changes);
  res.status(201).json({ criadas, ignoradas: totalApartamentos - criadas, valor: padrao.valor });
});

// Prévia do juros para uma data de pagamento (a tela mostra antes de confirmar).
financeiroRouter.get('/taxas/:id/calculo-juros', requireRole('admin'), (req, res) => {
  const taxa = db.prepare('SELECT * FROM taxas_condominio WHERE id = ?').get(req.params.id);
  if (!taxa) return res.status(404).json({ error: 'Taxa não encontrada.' });
  const { data_pagamento } = req.query;
  if (!ehDataValida(data_pagamento)) {
    return res.status(400).json({ error: 'data_pagamento deve ser uma data válida (AAAA-MM-DD).' });
  }
  const valor = req.query.valor === undefined ? taxa.valor : lerNumeroNaoNegativo(req.query.valor);
  if (valor === null) return res.status(400).json({ error: 'valor deve ser um número maior ou igual a zero.' });
  res.json(calcularJuros({ ...taxa, valor, data_pagamento }, lerConfiguracao()));
});

// Registrar pagamento: muda situação para adimplente e zera meses em atraso.
// Sem "juros" no corpo, o sistema calcula multa + juros pelo atraso; com "juros", o valor informado prevalece.
financeiroRouter.put('/taxas/:id/pagamento', requireRole('admin'), uploadComprovante, (req, res) => {
  const { data_pagamento } = req.body ?? {};
  if (!data_pagamento) {
    return res.status(400).json({ error: 'data_pagamento é obrigatória.' });
  }
  if (!ehDataValida(data_pagamento)) {
    return res.status(400).json({ error: 'data_pagamento deve ser uma data válida (AAAA-MM-DD).' });
  }
  const taxa = db.prepare('SELECT * FROM taxas_condominio WHERE id = ?').get(req.params.id);
  if (!taxa) return res.status(404).json({ error: 'Taxa não encontrada.' });

  let juros;
  if (vazio(req.body.juros)) {
    juros = calcularJuros({ ...taxa, data_pagamento }, lerConfiguracao()).juros;
  } else {
    juros = lerNumeroNaoNegativo(req.body.juros);
    if (juros === null) return res.status(400).json({ error: 'juros deve ser um número maior ou igual a zero.' });
  }

  const comprovante = salvarComprovante(req.file);
  if (comprovante.erro) return res.status(400).json({ error: comprovante.erro });
  db.prepare(
    `UPDATE taxas_condominio
     SET data_pagamento = ?, juros = ?, situacao = 'adimplente', meses_atraso = 0,
         comprovante_path = COALESCE(?, comprovante_path)
     WHERE id = ?`
  ).run(data_pagamento, juros, comprovante.nome, req.params.id);
  if (comprovante.nome) apagarComprovante(taxa.comprovante_path);
  res.json({ message: 'Pagamento registrado.', juros });
});

// Editar taxa: valor, juros, data de pagamento e comprovante. Apartamento e mês/ano não mudam.
//  - data_pagamento preenchida → adimplente; vazia → volta a inadimplente (juros zerado, sem juros em aberto);
//    ausente → não muda.
//  - juros informado prevalece; ausente com data de pagamento nova/alterada → calculado; ausente sem mudança → mantém.
financeiroRouter.put('/taxas/:id', requireRole('admin'), uploadComprovante, (req, res) => {
  const taxa = db.prepare('SELECT * FROM taxas_condominio WHERE id = ?').get(req.params.id);
  if (!taxa) return res.status(404).json({ error: 'Taxa não encontrada.' });
  const corpo = req.body ?? {};

  let valor = taxa.valor;
  if (!vazio(corpo.valor)) {
    valor = lerNumeroNaoNegativo(corpo.valor);
    if (valor === null) return res.status(400).json({ error: 'valor deve ser um número maior ou igual a zero.' });
  }

  let dataPagamento = taxa.data_pagamento;
  if ('data_pagamento' in corpo) {
    dataPagamento = vazio(corpo.data_pagamento) ? null : corpo.data_pagamento;
    if (dataPagamento !== null && !ehDataValida(dataPagamento)) {
      return res.status(400).json({ error: 'data_pagamento deve ser uma data válida (AAAA-MM-DD).' });
    }
  }

  let juros = taxa.juros;
  if (dataPagamento === null) {
    juros = 0;
  } else if (!vazio(corpo.juros)) {
    juros = lerNumeroNaoNegativo(corpo.juros);
    if (juros === null) return res.status(400).json({ error: 'juros deve ser um número maior ou igual a zero.' });
  } else if (dataPagamento !== taxa.data_pagamento) {
    juros = calcularJuros({ ...taxa, valor, data_pagamento: dataPagamento }, lerConfiguracao()).juros;
  }

  const comprovante = salvarComprovante(req.file);
  if (comprovante.erro) return res.status(400).json({ error: comprovante.erro });
  const remover = !comprovante.nome && ehVerdadeiro(corpo.remover_comprovante);
  const novoComprovante = comprovante.nome ?? (remover ? null : taxa.comprovante_path);

  db.prepare(
    `UPDATE taxas_condominio
     SET valor = ?, juros = ?, data_pagamento = ?, situacao = ?, meses_atraso = ?, comprovante_path = ?
     WHERE id = ?`
  ).run(
    valor,
    juros,
    dataPagamento,
    dataPagamento ? 'adimplente' : 'inadimplente',
    dataPagamento ? 0 : taxa.meses_atraso,
    novoComprovante,
    taxa.id
  );
  if (novoComprovante !== taxa.comprovante_path) apagarComprovante(taxa.comprovante_path);
  res.json({ message: 'Taxa atualizada.', juros, situacao: dataPagamento ? 'adimplente' : 'inadimplente' });
});

// ---------- Outras Receitas e Despesas (mesmos campos e regras) ----------

function lancamentosRouter(tabela, rotulo) {
  const lerPeriodo = (query) => {
    const condicoes = [];
    const params = {};
    if (query.ano) { condicoes.push("strftime('%Y', data) = @ano"); params.ano = String(query.ano); }
    if (query.mes) { condicoes.push("strftime('%m', data) = @mes"); params.mes = String(query.mes).padStart(2, '0'); }
    return { where: condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '', params };
  };

  financeiroRouter.get(`/${tabela.rota}`, (req, res) => {
    const { where, params } = lerPeriodo(req.query);
    res.json(db.prepare(`SELECT * FROM ${tabela.nome} ${where} ORDER BY data DESC`).all(params));
  });

  financeiroRouter.post(`/${tabela.rota}`, requireRole('admin'), uploadComprovante, (req, res) => {
    const campos = lerLancamento(req.body);
    if (campos.erro) return res.status(400).json({ error: campos.erro });
    const comprovante = salvarComprovante(req.file);
    if (comprovante.erro) return res.status(400).json({ error: comprovante.erro });
    const info = db
      .prepare(`INSERT INTO ${tabela.nome} (descricao, valor, data, comprovante_path) VALUES (?, ?, ?, ?)`)
      .run(campos.descricao, campos.valor, campos.data, comprovante.nome);
    res.status(201).json({ id: info.lastInsertRowid });
  });

  // Editar: descrição, valor, data e comprovante (manter, substituir ou remover).
  financeiroRouter.put(`/${tabela.rota}/:id`, requireRole('admin'), uploadComprovante, (req, res) => {
    const atual = db.prepare(`SELECT * FROM ${tabela.nome} WHERE id = ?`).get(req.params.id);
    if (!atual) return res.status(404).json({ error: `${rotulo} não encontrada.` });
    const campos = lerLancamento(req.body);
    if (campos.erro) return res.status(400).json({ error: campos.erro });
    const comprovante = salvarComprovante(req.file);
    if (comprovante.erro) return res.status(400).json({ error: comprovante.erro });

    const remover = !comprovante.nome && ehVerdadeiro(req.body?.remover_comprovante);
    const novoComprovante = comprovante.nome ?? (remover ? null : atual.comprovante_path);
    db.prepare(`UPDATE ${tabela.nome} SET descricao = ?, valor = ?, data = ?, comprovante_path = ? WHERE id = ?`)
      .run(campos.descricao, campos.valor, campos.data, novoComprovante, atual.id);
    if (novoComprovante !== atual.comprovante_path) apagarComprovante(atual.comprovante_path);
    res.json({ message: `${rotulo} atualizada.` });
  });
}

lancamentosRouter({ rota: 'outras-receitas', nome: 'outras_receitas' }, 'Receita');
lancamentosRouter({ rota: 'despesas', nome: 'despesas' }, 'Despesa');

// ---------- Configurações financeiras ----------

financeiroRouter.get('/configuracoes', (_req, res) => {
  res.json({
    ...lerConfiguracao(),
    taxas_padrao: db.prepare('SELECT ano, valor FROM taxa_padrao ORDER BY ano').all(),
  });
});

// Altera multa, juros, vencimento e/ou o valor da taxa de um ou mais anos. Não mexe em lançamentos existentes.
financeiroRouter.put('/configuracoes', requireRole('admin'), (req, res) => {
  const corpo = req.body ?? {};
  const atual = lerConfiguracao();
  const novo = { ...atual };

  const parametros = [
    ['multa_percentual', 'multa_percentual deve estar entre 0 e 2.', (v) => v >= 0 && v <= 2],
    ['juros_mensal_percentual', 'juros_mensal_percentual deve ser maior ou igual a zero.', (v) => v >= 0],
    ['dia_vencimento', 'dia_vencimento deve ser um inteiro entre 1 e 28.', (v) => Number.isInteger(v) && v >= 1 && v <= 28],
  ];
  for (const [campo, mensagem, valido] of parametros) {
    if (vazio(corpo[campo])) continue;
    const numero = Number(corpo[campo]);
    if (!Number.isFinite(numero) || !valido(numero)) return res.status(400).json({ error: mensagem });
    novo[campo] = numero;
  }

  const taxasPadrao = [];
  if (corpo.taxas_padrao !== undefined) {
    if (!Array.isArray(corpo.taxas_padrao)) {
      return res.status(400).json({ error: 'taxas_padrao deve ser uma lista de { ano, valor }.' });
    }
    for (const item of corpo.taxas_padrao) {
      const ano = lerInteiro(item?.ano);
      const valor = vazio(item?.valor) ? null : lerNumeroNaoNegativo(item.valor);
      if (!ano || ano < 1900 || ano > 2999 || valor === null) {
        return res.status(400).json({ error: 'Cada item de taxas_padrao precisa de ano válido e valor maior ou igual a zero.' });
      }
      taxasPadrao.push({ ano, valor });
    }
  }

  withTransaction(() => {
    db.prepare(
      'UPDATE configuracao_financeira SET multa_percentual = ?, juros_mensal_percentual = ?, dia_vencimento = ? WHERE id = 1'
    ).run(novo.multa_percentual, novo.juros_mensal_percentual, novo.dia_vencimento);
    const upsert = db.prepare(
      'INSERT INTO taxa_padrao (ano, valor) VALUES (?, ?) ON CONFLICT(ano) DO UPDATE SET valor = excluded.valor'
    );
    for (const { ano, valor } of taxasPadrao) upsert.run(ano, valor);
  });
  res.json({
    ...lerConfiguracao(),
    taxas_padrao: db.prepare('SELECT ano, valor FROM taxa_padrao ORDER BY ano').all(),
  });
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
