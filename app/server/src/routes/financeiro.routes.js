import { Router } from 'express';
import { db, isUniqueConstraintError, lerConfiguracao, withTransaction } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  COMPROVANTES_DIR,
  MIME_POR_EXTENSAO,
  apagarComprovante,
  salvarComprovante,
  uploadComprovante,
} from '../utils/comprovantes.js';
import { calcularJuros, ehDataValida, hojeISO, sqlVencida, statusDaTaxa } from '../utils/juros.js';
import {
  CAMPOS_CONFIGURACAO,
  CAMPOS_LANCAMENTO,
  CAMPOS_TAXA,
  consultarAuditoria,
  instantaneo,
  mudou,
  registrarAuditoria,
  rotuloDaTaxa,
} from '../utils/auditoria.js';

const taxaPorId = (id) => db.prepare('SELECT * FROM taxas_condominio WHERE id = ?').get(id);

// Cancelamento (exclusão lógica): o registro fica no banco, sai das listas e dos totais e pode ser restaurado.
const MENSAGEM_CANCELADO = (rotulo) => `${rotulo} cancelada. Restaure antes de alterar.`;
const querCancelados = (req) => req.user?.role === 'admin' && ehVerdadeiro(req.query.incluir_cancelados);

function lerMotivo(corpo) {
  const motivo = typeof corpo?.motivo === 'string' ? corpo.motivo.trim() : '';
  return motivo.length >= 3 && motivo.length <= 200 ? motivo : null;
}

// Cancela um registro (taxa, despesa ou outra receita). `impedimento` devolve um texto quando não pode cancelar.
function cancelarRegistro(req, res, { tabela, entidade, campos, rotulo, descrever, impedimento = () => null }) {
  const registro = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(req.params.id);
  if (!registro) return res.status(404).json({ error: `${rotulo} não encontrada.` });
  if (registro.cancelado_em) return res.status(409).json({ error: `${rotulo} já está cancelada.` });
  const bloqueio = impedimento(registro);
  if (bloqueio) return res.status(409).json({ error: bloqueio });
  const motivo = lerMotivo(req.body);
  if (!motivo) return res.status(400).json({ error: 'Informe o motivo do cancelamento (de 3 a 200 caracteres).' });
  db.prepare(
    `UPDATE ${tabela} SET cancelado_em = datetime('now'), cancelado_por = ?, motivo_cancelamento = ? WHERE id = ?`
  ).run(req.user?.sub ?? null, motivo, registro.id);
  registrarAuditoria(req, {
    entidade, entidadeId: registro.id, acao: 'cancelar',
    antes: instantaneo(registro, campos),
    depois: instantaneo(db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(registro.id), campos),
    detalhe: descrever(registro),
  });
  res.json({ message: `${rotulo} cancelada.` });
}

function restaurarRegistro(req, res, { tabela, entidade, campos, rotulo, descrever }) {
  const registro = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(req.params.id);
  if (!registro) return res.status(404).json({ error: `${rotulo} não encontrada.` });
  if (!registro.cancelado_em) return res.status(409).json({ error: `${rotulo} não está cancelada.` });
  db.prepare(`UPDATE ${tabela} SET cancelado_em = NULL, cancelado_por = NULL, motivo_cancelamento = NULL WHERE id = ?`).run(registro.id);
  registrarAuditoria(req, {
    entidade, entidadeId: registro.id, acao: 'restaurar',
    antes: instantaneo(registro, campos),
    depois: instantaneo(db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(registro.id), campos),
    detalhe: descrever(registro),
  });
  res.json({ message: `${rotulo} restaurada.` });
}

const REGRAS_DA_TAXA = {
  tabela: 'taxas_condominio', entidade: 'taxa', campos: CAMPOS_TAXA, rotulo: 'Taxa', descrever: rotuloDaTaxa,
  impedimento: (t) => (t.data_pagamento ? 'Taxa paga não pode ser cancelada. Remova o pagamento antes.' : null),
};

export const financeiroRouter = Router();
financeiroRouter.use(requireAuth);

// ---------- Helpers de leitura do corpo (multipart envia tudo como texto) ----------

const vazio = (v) => v === undefined || v === null || v === '';
const ehVerdadeiro = (v) => v === true || v === 'true' || v === '1' || v === 'on';
const lerInteiro = (v) => (vazio(v) || !Number.isInteger(Number(v)) ? null : Number(v));
const lerNumeroNaoNegativo = (v) => (vazio(v) || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));

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
  if (!querCancelados(req)) condicoes.push('t.cancelado_em IS NULL');
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
  const configuracao = lerConfiguracao();
  const dia = configuracao.dia_vencimento;
  const hoje = hojeISO();
  res.json(
    taxas.map((t) => {
      // Para taxa paga, compara o juros gravado com o cálculo atual (mesma fórmula do pagamento).
      const calculado = t.data_pagamento ? calcularJuros(t, configuracao).juros : null;
      return {
        ...t,
        status: t.cancelado_em ? 'cancelada' : statusDaTaxa(t, dia, hoje),
        juros_calculado: t.cancelado_em ? null : calculado,
        juros_diverge: !t.cancelado_em && calculado !== null && Math.abs(calculado - t.juros) >= 0.005,
      };
    })
  );
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
    const criada = taxaPorId(info.lastInsertRowid);
    registrarAuditoria(req, {
      entidade: 'taxa', entidadeId: criada.id, acao: 'criar',
      depois: instantaneo(criada, CAMPOS_TAXA), detalhe: rotuloDaTaxa(criada),
    });
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (err) {
    apagarComprovante(comprovante.nome);
    if (isUniqueConstraintError(err)) {
      const existente = db
        .prepare('SELECT cancelado_em FROM taxas_condominio WHERE apartamento_id = ? AND mes_referencia = ? AND ano_referencia = ?')
        .get(apartamento_id, mes_referencia, ano_referencia);
      return res.status(409).json({
        error: existente?.cancelado_em
          ? 'Existe uma taxa cancelada para este apartamento neste mês/ano. Restaure-a em vez de lançar outra.'
          : 'Já existe uma taxa lançada para este apartamento neste mês/ano.',
      });
    }
    throw err;
  }
});

// Prévia da geração: quantas taxas seriam criadas e quantas já existem. Não grava nada.
financeiroRouter.get('/taxas/gerar-mes/previa', requireRole('admin'), (req, res) => {
  const mes = lerInteiro(req.query.mes_referencia);
  const ano = lerInteiro(req.query.ano_referencia);
  if (!mes || mes < 1 || mes > 12 || !ano || ano < 1900 || ano > 2999) {
    return res.status(400).json({ error: 'mes_referencia (1–12) e ano_referencia são obrigatórios.' });
  }
  const totalApartamentos = db.prepare('SELECT COUNT(*) AS total FROM apartamentos').get().total;
  const existentes = db
    .prepare('SELECT COUNT(*) AS total FROM taxas_condominio WHERE mes_referencia = ? AND ano_referencia = ?')
    .get(mes, ano).total;
  const padrao = db.prepare('SELECT valor FROM taxa_padrao WHERE ano = ?').get(ano);
  res.json({
    total_apartamentos: totalApartamentos,
    existentes,
    a_criar: totalApartamentos - existentes,
    valor: padrao?.valor ?? null,
  });
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
  if (criadas > 0) {
    registrarAuditoria(req, {
      entidade: 'taxa', acao: 'gerar_mes',
      depois: { mes_referencia: mes, ano_referencia: ano, valor: padrao.valor, criadas, ignoradas: totalApartamentos - criadas },
      detalhe: `${criadas} taxa(s) geradas para ${String(mes).padStart(2, '0')}/${ano}`,
    });
  }
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
  if (taxa.cancelado_em) return res.status(409).json({ error: MENSAGEM_CANCELADO('Taxa') });

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
  registrarAuditoria(req, {
    entidade: 'taxa', entidadeId: taxa.id, acao: 'pagar',
    antes: instantaneo(taxa, CAMPOS_TAXA), depois: instantaneo(taxaPorId(taxa.id), CAMPOS_TAXA), detalhe: rotuloDaTaxa(taxa),
  });
  res.json({ message: 'Pagamento registrado.', juros });
});

// Regrava o juros de uma taxa já paga com o cálculo atual (percentuais e vencimento de hoje, valor e data gravados).
financeiroRouter.post('/taxas/:id/recalcular-juros', requireRole('admin'), (req, res) => {
  const taxa = db.prepare('SELECT * FROM taxas_condominio WHERE id = ?').get(req.params.id);
  if (!taxa) return res.status(404).json({ error: 'Taxa não encontrada.' });
  if (taxa.cancelado_em) return res.status(409).json({ error: MENSAGEM_CANCELADO('Taxa') });
  if (!taxa.data_pagamento) {
    return res.status(400).json({ error: 'Só é possível recalcular o juros de uma taxa já paga.' });
  }
  const { juros, total } = calcularJuros(taxa, lerConfiguracao());
  db.prepare('UPDATE taxas_condominio SET juros = ? WHERE id = ?').run(juros, taxa.id);
  registrarAuditoria(req, {
    entidade: 'taxa', entidadeId: taxa.id, acao: 'recalcular_juros',
    antes: instantaneo(taxa, CAMPOS_TAXA), depois: instantaneo(taxaPorId(taxa.id), CAMPOS_TAXA), detalhe: rotuloDaTaxa(taxa),
  });
  res.json({ message: 'Juros recalculado.', juros_anterior: taxa.juros, juros, total });
});

// Cancelar e restaurar uma taxa (exclusão lógica). Taxa paga só pode ser cancelada depois de remover o pagamento.
financeiroRouter.post('/taxas/:id/cancelar', requireRole('admin'), (req, res) => cancelarRegistro(req, res, REGRAS_DA_TAXA));
financeiroRouter.post('/taxas/:id/restaurar', requireRole('admin'), (req, res) => restaurarRegistro(req, res, REGRAS_DA_TAXA));

// Editar taxa: valor, juros, data de pagamento e comprovante. Apartamento e mês/ano não mudam.
//  - data_pagamento preenchida → adimplente; vazia → volta a inadimplente (juros zerado, sem juros em aberto);
//    ausente → não muda.
//  - juros informado prevalece; ausente com data de pagamento nova/alterada → calculado; ausente sem mudança → mantém.
financeiroRouter.put('/taxas/:id', requireRole('admin'), uploadComprovante, (req, res) => {
  const taxa = db.prepare('SELECT * FROM taxas_condominio WHERE id = ?').get(req.params.id);
  if (!taxa) return res.status(404).json({ error: 'Taxa não encontrada.' });
  if (taxa.cancelado_em) return res.status(409).json({ error: MENSAGEM_CANCELADO('Taxa') });
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
  const antesDaTaxa = instantaneo(taxa, CAMPOS_TAXA);
  const depoisDaTaxa = instantaneo(taxaPorId(taxa.id), CAMPOS_TAXA);
  if (mudou(antesDaTaxa, depoisDaTaxa)) {
    registrarAuditoria(req, {
      entidade: 'taxa', entidadeId: taxa.id, acao: 'editar', antes: antesDaTaxa, depois: depoisDaTaxa, detalhe: rotuloDaTaxa(taxa),
    });
  }
  res.json({ message: 'Taxa atualizada.', juros, situacao: dataPagamento ? 'adimplente' : 'inadimplente' });
});

// ---------- Outras Receitas e Despesas (mesmos campos e regras) ----------

function lancamentosRouter(tabela, rotulo) {
  const lerPeriodo = (query, incluirCancelados) => {
    const condicoes = incluirCancelados ? [] : ['cancelado_em IS NULL'];
    const params = {};
    if (query.ano) { condicoes.push("strftime('%Y', data) = @ano"); params.ano = String(query.ano); }
    if (query.mes) { condicoes.push("strftime('%m', data) = @mes"); params.mes = String(query.mes).padStart(2, '0'); }
    return { where: condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '', params };
  };

  financeiroRouter.get(`/${tabela.rota}`, (req, res) => {
    const { where, params } = lerPeriodo(req.query, querCancelados(req));
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
    registrarAuditoria(req, {
      entidade: tabela.entidade, entidadeId: Number(info.lastInsertRowid), acao: 'criar',
      depois: instantaneo(db.prepare(`SELECT * FROM ${tabela.nome} WHERE id = ?`).get(info.lastInsertRowid), CAMPOS_LANCAMENTO),
      detalhe: campos.descricao,
    });
    res.status(201).json({ id: info.lastInsertRowid });
  });

  // Editar: descrição, valor, data e comprovante (manter, substituir ou remover).
  financeiroRouter.put(`/${tabela.rota}/:id`, requireRole('admin'), uploadComprovante, (req, res) => {
    const atual = db.prepare(`SELECT * FROM ${tabela.nome} WHERE id = ?`).get(req.params.id);
    if (!atual) return res.status(404).json({ error: `${rotulo} não encontrada.` });
    if (atual.cancelado_em) return res.status(409).json({ error: MENSAGEM_CANCELADO(rotulo) });
    const campos = lerLancamento(req.body);
    if (campos.erro) return res.status(400).json({ error: campos.erro });
    const comprovante = salvarComprovante(req.file);
    if (comprovante.erro) return res.status(400).json({ error: comprovante.erro });

    const remover = !comprovante.nome && ehVerdadeiro(req.body?.remover_comprovante);
    const novoComprovante = comprovante.nome ?? (remover ? null : atual.comprovante_path);
    db.prepare(`UPDATE ${tabela.nome} SET descricao = ?, valor = ?, data = ?, comprovante_path = ? WHERE id = ?`)
      .run(campos.descricao, campos.valor, campos.data, novoComprovante, atual.id);
    if (novoComprovante !== atual.comprovante_path) apagarComprovante(atual.comprovante_path);
    const antes = instantaneo(atual, CAMPOS_LANCAMENTO);
    const depois = instantaneo(db.prepare(`SELECT * FROM ${tabela.nome} WHERE id = ?`).get(atual.id), CAMPOS_LANCAMENTO);
    if (mudou(antes, depois)) {
      registrarAuditoria(req, { entidade: tabela.entidade, entidadeId: atual.id, acao: 'editar', antes, depois, detalhe: campos.descricao });
    }
    res.json({ message: `${rotulo} atualizada.` });
  });

  const regras = {
    tabela: tabela.nome, entidade: tabela.entidade, campos: CAMPOS_LANCAMENTO, rotulo, descrever: (r) => r.descricao,
  };
  financeiroRouter.post(`/${tabela.rota}/:id/cancelar`, requireRole('admin'), (req, res) => cancelarRegistro(req, res, regras));
  financeiroRouter.post(`/${tabela.rota}/:id/restaurar`, requireRole('admin'), (req, res) => restaurarRegistro(req, res, regras));
}

lancamentosRouter({ rota: 'outras-receitas', nome: 'outras_receitas', entidade: 'outra_receita' }, 'Receita');
lancamentosRouter({ rota: 'despesas', nome: 'despesas', entidade: 'despesa' }, 'Despesa');

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

  const antesDaConfiguracao = {
    ...instantaneo(atual, CAMPOS_CONFIGURACAO),
    taxas_padrao: Object.fromEntries(db.prepare('SELECT ano, valor FROM taxa_padrao ORDER BY ano').all().map((t) => [t.ano, t.valor])),
  };
  withTransaction(() => {
    db.prepare(
      'UPDATE configuracao_financeira SET multa_percentual = ?, juros_mensal_percentual = ?, dia_vencimento = ? WHERE id = 1'
    ).run(novo.multa_percentual, novo.juros_mensal_percentual, novo.dia_vencimento);
    const upsert = db.prepare(
      'INSERT INTO taxa_padrao (ano, valor) VALUES (?, ?) ON CONFLICT(ano) DO UPDATE SET valor = excluded.valor'
    );
    for (const { ano, valor } of taxasPadrao) upsert.run(ano, valor);
  });
  const depoisDaConfiguracao = {
    ...instantaneo(lerConfiguracao(), CAMPOS_CONFIGURACAO),
    taxas_padrao: Object.fromEntries(db.prepare('SELECT ano, valor FROM taxa_padrao ORDER BY ano').all().map((t) => [t.ano, t.valor])),
  };
  if (mudou(antesDaConfiguracao, depoisDaConfiguracao)) {
    registrarAuditoria(req, {
      entidade: 'configuracao', acao: 'editar', antes: antesDaConfiguracao, depois: depoisDaConfiguracao,
      detalhe: 'Configurações financeiras',
    });
  }
  res.json({
    ...lerConfiguracao(),
    taxas_padrao: db.prepare('SELECT ano, valor FROM taxa_padrao ORDER BY ano').all(),
  });
});

// ---------- Histórico de alterações (auditoria) ----------

financeiroRouter.get('/auditoria', requireRole('admin'), (req, res) => {
  const { de, ate } = req.query;
  if ((de && !ehDataValida(de)) || (ate && !ehDataValida(ate))) {
    return res.status(400).json({ error: 'de e ate devem ser datas válidas (AAAA-MM-DD).' });
  }
  res.json(consultarAuditoria(req.query));
});

// ---------- Resumos ----------

// Visão geral do mês (equivalente ao card "JANEIRO" do protótipo): receita - despesa.
// regime=competencia (padrão): as taxas entram no mês de referência. regime=caixa: entram no mês em que foram pagas.
// Outras receitas e despesas usam a própria data nos dois regimes.
financeiroRouter.get('/resumo/mensal', (req, res) => {
  const { ano, mes } = req.query;
  if (!ano || !mes) return res.status(400).json({ error: 'ano e mes são obrigatórios.' });
  const regime = req.query.regime ?? 'competencia';
  if (!['competencia', 'caixa'].includes(regime)) {
    return res.status(400).json({ error: 'regime deve ser "competencia" ou "caixa".' });
  }

  const receitasTaxas =
    regime === 'caixa'
      ? db
          .prepare(
            `SELECT COALESCE(SUM(valor + juros), 0) AS total FROM taxas_condominio
             WHERE strftime('%Y', data_pagamento) = ? AND strftime('%m', data_pagamento) = ?
               AND situacao = 'adimplente' AND cancelado_em IS NULL`
          )
          .get(String(ano), String(mes).padStart(2, '0')).total
      : db
          .prepare(
            `SELECT COALESCE(SUM(valor + juros), 0) AS total FROM taxas_condominio
             WHERE ano_referencia = ? AND mes_referencia = ? AND situacao = 'adimplente' AND cancelado_em IS NULL`
          )
          .get(ano, mes).total;

  const receitasOutras = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM outras_receitas
       WHERE strftime('%Y', data) = ? AND strftime('%m', data) = ? AND cancelado_em IS NULL`
    )
    .get(String(ano), String(mes).padStart(2, '0')).total;

  const despesas = db
    .prepare(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
       WHERE strftime('%Y', data) = ? AND strftime('%m', data) = ? AND cancelado_em IS NULL`
    )
    .get(String(ano), String(mes).padStart(2, '0')).total;

  const receitas = receitasTaxas + receitasOutras;
  res.json({ regime, receitas, despesas, saldo: receitas - despesas });
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
         COALESCE(SUM(CASE WHEN t.situacao = 'inadimplente' AND ${sqlVencida('t.')} THEN t.valor + t.juros ELSE 0 END), 0) AS inadimplente,
         COALESCE(SUM(CASE WHEN t.situacao = 'inadimplente' AND NOT (${sqlVencida('t.')}) THEN t.valor + t.juros ELSE 0 END), 0) AS a_vencer
       FROM blocos b
       LEFT JOIN apartamentos a ON a.bloco_id = b.id
       LEFT JOIN taxas_condominio t
         ON t.apartamento_id = a.id AND t.ano_referencia = @ano AND t.mes_referencia = @mes AND t.cancelado_em IS NULL
       GROUP BY b.id
       ORDER BY b.numero`
    )
    .all({ ano, mes, dia: lerConfiguracao().dia_vencimento, hoje: hojeISO() });

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
         COALESCE(SUM(CASE WHEN situacao = 'inadimplente' AND ${sqlVencida()} THEN valor + juros ELSE 0 END), 0) AS inadimplente,
         COALESCE(SUM(CASE WHEN situacao = 'inadimplente' AND NOT (${sqlVencida()}) THEN valor + juros ELSE 0 END), 0) AS a_vencer
       FROM taxas_condominio
       WHERE ano_referencia = @ano AND cancelado_em IS NULL
       GROUP BY mes_referencia
       ORDER BY mes_referencia`
    )
    .all({ ano, dia: lerConfiguracao().dia_vencimento, hoje: hojeISO() });

  res.json(linhas);
});

// Evolução mês a mês (para a tela "Evolução"): receitas, despesas e inadimplência no período.
// Taxas entram pela competência (mês de referência), como em /resumo/mensal.
// "atrasadas" = pagas depois do vencimento ou em aberto e já vencidas (a inadimplência no vencimento). O vencimento é o
// dia configurado; taxas em aberto ainda no prazo ficam em "a_vencer" e não contam como atraso nem como em aberto.
function lerPeriodoDaEvolucao(req, res) {
  const anoInicio = Number(req.query.ano_inicio);
  const anoFim = Number(req.query.ano_fim);
  if (!anoInicio || !anoFim || anoInicio > anoFim) {
    res.status(400).json({ error: 'ano_inicio e ano_fim são obrigatórios (ano_inicio <= ano_fim).' });
    return null;
  }
  return { anoInicio, anoFim };
}

function evolucaoMensal({ anoInicio, anoFim }) {
  const taxas = db
    .prepare(
      `SELECT
         ano_referencia AS ano,
         mes_referencia AS mes,
         COUNT(*) AS unidades,
         COALESCE(SUM(valor), 0) AS faturamento,
         COALESCE(SUM(CASE WHEN situacao = 'adimplente' THEN valor + juros ELSE 0 END), 0) AS receitas_taxas,
         SUM(CASE WHEN (data_pagamento IS NULL AND ${sqlVencida()})
                    OR data_pagamento > printf('%04d-%02d-%02d', ano_referencia, mes_referencia, @dia)
                  THEN 1 ELSE 0 END) AS atrasadas,
         SUM(CASE WHEN situacao = 'inadimplente' AND ${sqlVencida()} THEN 1 ELSE 0 END) AS em_aberto,
         SUM(CASE WHEN situacao = 'inadimplente' AND ${sqlVencida()} AND meses_atraso >= 3 THEN 1 ELSE 0 END) AS em_aberto_3_meses,
         SUM(CASE WHEN situacao = 'inadimplente' AND NOT (${sqlVencida()}) THEN 1 ELSE 0 END) AS a_vencer
       FROM taxas_condominio
       WHERE ano_referencia BETWEEN @anoInicio AND @anoFim AND cancelado_em IS NULL
       GROUP BY ano_referencia, mes_referencia`
    )
    .all({ anoInicio, anoFim, dia: lerConfiguracao().dia_vencimento, hoje: hojeISO() });

  const somaPorMes = (tabela) =>
    new Map(
      db
        .prepare(
          `SELECT strftime('%Y', data) AS ano, strftime('%m', data) AS mes, SUM(valor) AS total
           FROM ${tabela}
           WHERE CAST(strftime('%Y', data) AS INTEGER) BETWEEN ? AND ? AND cancelado_em IS NULL
           GROUP BY ano, mes`
        )
        .all(anoInicio, anoFim)
        .map((l) => [`${Number(l.ano)}-${Number(l.mes)}`, l.total])
    );
  const outrasReceitas = somaPorMes('outras_receitas');
  const despesas = somaPorMes('despesas');

  return taxas
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
    .map((t) => {
      const chave = `${t.ano}-${t.mes}`;
      return {
        ...t,
        receitas_outras: outrasReceitas.get(chave) ?? 0,
        despesas: despesas.get(chave) ?? 0,
      };
    });
}

financeiroRouter.get('/resumo/evolucao', requireRole('admin'), (req, res) => {
  const periodo = lerPeriodoDaEvolucao(req, res);
  if (periodo) res.json(evolucaoMensal(periodo));
});

// Versão aberta a qualquer perfil logado (prestação de contas aos condôminos): só receitas e despesas por mês.
// Não traz faturamento, atraso nem unidades, que permitiriam deduzir a inadimplência.
financeiroRouter.get('/resumo/evolucao-publica', (req, res) => {
  const periodo = lerPeriodoDaEvolucao(req, res);
  if (!periodo) return;
  res.json(
    evolucaoMensal(periodo).map((l) => ({
      ano: l.ano,
      mes: l.mes,
      receitas: l.receitas_taxas + l.receitas_outras,
      despesas: l.despesas,
    }))
  );
});
