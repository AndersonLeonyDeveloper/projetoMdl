import { Router } from 'express';
import { db, withTransaction } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ehDataValida, hojeISO } from '../utils/juros.js';
import { instantaneo, registrarAuditoria, rotuloDoApartamento } from '../utils/auditoria.js';
import { atualizarStatusDosAcordos, CARENCIA_DIAS, montarAcordo, taxasElegiveis } from '../utils/acordos.js';

// Acordos e parcelamentos de dívida (regras-de-negocio.md, seção 4.14). Só o Admin usa.
export const acordosRouter = Router();
acordosRouter.use(requireAuth, requireRole('admin'));
acordosRouter.use((_req, _res, next) => {
  atualizarStatusDosAcordos();
  next();
});

const CAMPOS_ACORDO = ['apartamento_id', 'status', 'valor_taxas', 'juros', 'desconto', 'valor_total', 'entrada', 'observacao', 'encerrado_em', 'motivo_cancelamento'];
const acordoPorId = (id) => db.prepare('SELECT * FROM acordos WHERE id = ?').get(id);
const apartamentoExiste = (id) => !!db.prepare('SELECT 1 FROM apartamentos WHERE id = ?').get(id);

// Taxas em atraso do apartamento que podem entrar em um acordo, com o juros calculado até hoje.
acordosRouter.get('/elegiveis', (req, res) => {
  const apartamentoId = Number(req.query.apartamento_id);
  if (!Number.isInteger(apartamentoId) || apartamentoId < 1) {
    return res.status(400).json({ error: 'apartamento_id é obrigatório.' });
  }
  if (!apartamentoExiste(apartamentoId)) return res.status(404).json({ error: 'Apartamento não encontrado.' });
  res.json(taxasElegiveis(apartamentoId));
});

// Calcula o acordo sem gravar nada: valores e as parcelas que seriam criadas.
acordosRouter.post('/simular', (req, res) => {
  if (!apartamentoExiste(Number(req.body?.apartamento_id))) return res.status(404).json({ error: 'Apartamento não encontrado.' });
  const acordo = montarAcordo(req.body);
  if (acordo.erro) return res.status(acordo.status).json({ error: acordo.erro });
  res.json(acordo);
});

acordosRouter.post('/', (req, res) => {
  if (!apartamentoExiste(Number(req.body?.apartamento_id))) return res.status(404).json({ error: 'Apartamento não encontrado.' });
  const acordo = montarAcordo(req.body);
  if (acordo.erro) return res.status(acordo.status).json({ error: acordo.erro });

  const id = withTransaction(() => {
    const info = db
      .prepare(
        `INSERT INTO acordos (apartamento_id, status, valor_taxas, juros, desconto, valor_total, entrada, observacao, criado_por)
         VALUES (?, 'ativo', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(acordo.apartamento_id, acordo.valor_taxas, acordo.juros, acordo.desconto, acordo.valor_total, acordo.entrada, acordo.observacao, req.user?.sub ?? null);
    const novoId = Number(info.lastInsertRowid);
    const vincular = db.prepare('INSERT INTO acordo_taxas (acordo_id, taxa_id, juros_calculado) VALUES (?, ?, ?)');
    for (const t of acordo.taxas) vincular.run(novoId, t.id, t.juros);
    const inserirParcela = db.prepare('INSERT INTO acordo_parcelas (acordo_id, numero, vencimento, valor) VALUES (?, ?, ?, ?)');
    for (const p of acordo.parcelas) inserirParcela.run(novoId, p.numero, p.vencimento, p.valor);
    return novoId;
  });
  registrarAuditoria(req, {
    entidade: 'acordo', entidadeId: id, acao: 'criar',
    depois: { ...instantaneo(acordoPorId(id), CAMPOS_ACORDO), taxas: acordo.taxas.length, parcelas: acordo.parcelas.length },
    detalhe: `${rotuloDoApartamento(acordo.apartamento_id)} · ${acordo.taxas.length} taxa(s) · ${acordo.parcelas.length} parcela(s)`,
  });
  res.status(201).json({ id });
});

const RESUMO_DO_ACORDO = `
  SELECT ac.*, b.numero AS bloco_numero, a.numero AS apartamento_numero,
    (SELECT COUNT(*) FROM acordo_parcelas p WHERE p.acordo_id = ac.id) AS total_parcelas,
    (SELECT COUNT(*) FROM acordo_parcelas p WHERE p.acordo_id = ac.id AND p.data_pagamento IS NOT NULL) AS parcelas_pagas,
    (SELECT COALESCE(SUM(p.valor), 0) FROM acordo_parcelas p WHERE p.acordo_id = ac.id AND p.data_pagamento IS NOT NULL) AS valor_pago,
    (SELECT MIN(p.vencimento) FROM acordo_parcelas p WHERE p.acordo_id = ac.id AND p.data_pagamento IS NULL) AS proximo_vencimento
  FROM acordos ac
  JOIN apartamentos a ON a.id = ac.apartamento_id
  JOIN blocos b ON b.id = a.bloco_id`;

acordosRouter.get('/', (req, res) => {
  const condicoes = [];
  const params = {};
  if (req.query.status) { condicoes.push('ac.status = @status'); params.status = String(req.query.status); }
  if (req.query.apartamento_id) { condicoes.push('ac.apartamento_id = @apartamento'); params.apartamento = Number(req.query.apartamento_id); }
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  res.json(db.prepare(`${RESUMO_DO_ACORDO} ${where} ORDER BY ac.id DESC`).all(params));
});

acordosRouter.get('/:id', (req, res) => {
  const acordo = db.prepare(`${RESUMO_DO_ACORDO} WHERE ac.id = ?`).get(req.params.id);
  if (!acordo) return res.status(404).json({ error: 'Acordo não encontrado.' });
  res.json({
    ...acordo,
    carencia_dias: CARENCIA_DIAS,
    taxas: db
      .prepare(
        `SELECT t.id, t.mes_referencia, t.ano_referencia, t.valor, at.juros_calculado
         FROM acordo_taxas at JOIN taxas_condominio t ON t.id = at.taxa_id
         WHERE at.acordo_id = ? ORDER BY t.ano_referencia, t.mes_referencia`
      )
      .all(acordo.id),
    parcelas: db.prepare('SELECT * FROM acordo_parcelas WHERE acordo_id = ? ORDER BY numero').all(acordo.id),
  });
});

// Registra o pagamento de uma parcela. Acordo ativo ou descumprido aceita pagamento (um acordo descumprido volta a ativo
// quando não resta parcela vencida além da carência); quitar a última parcela quita o acordo.
acordosRouter.post('/:id/parcelas/:parcelaId/pagamento', (req, res) => {
  const acordo = acordoPorId(req.params.id);
  if (!acordo) return res.status(404).json({ error: 'Acordo não encontrado.' });
  if (['quitado', 'cancelado'].includes(acordo.status)) {
    return res.status(409).json({ error: `Este acordo está ${acordo.status}; não aceita pagamentos.` });
  }
  const parcela = db.prepare('SELECT * FROM acordo_parcelas WHERE id = ? AND acordo_id = ?').get(req.params.parcelaId, acordo.id);
  if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada.' });
  if (parcela.data_pagamento) return res.status(409).json({ error: 'Esta parcela já foi paga.' });
  const dataPagamento = req.body?.data_pagamento;
  if (!ehDataValida(dataPagamento)) {
    return res.status(400).json({ error: 'data_pagamento deve ser uma data válida (AAAA-MM-DD).' });
  }

  db.prepare('UPDATE acordo_parcelas SET data_pagamento = ? WHERE id = ?').run(dataPagamento, parcela.id);
  const rotuloParcela = parcela.numero === 0 ? 'Entrada' : `Parcela ${parcela.numero}`;
  registrarAuditoria(req, {
    entidade: 'acordo', entidadeId: acordo.id, acao: 'pagar_parcela',
    depois: { numero: parcela.numero, valor: parcela.valor, data_pagamento: dataPagamento },
    detalhe: `${rotuloDaParcela(acordo, rotuloParcela)}`,
  });

  const restantes = db.prepare('SELECT COUNT(*) AS total FROM acordo_parcelas WHERE acordo_id = ? AND data_pagamento IS NULL').get(acordo.id).total;
  let status = acordo.status;
  if (restantes === 0) {
    db.prepare("UPDATE acordos SET status = 'quitado', encerrado_em = datetime('now') WHERE id = ?").run(acordo.id);
    status = 'quitado';
    registrarAuditoria(req, {
      entidade: 'acordo', entidadeId: acordo.id, acao: 'quitar',
      antes: { status: acordo.status }, depois: { status: 'quitado' }, detalhe: rotuloDoApartamento(acordo.apartamento_id),
    });
  } else if (acordo.status === 'descumprido') {
    const aindaVencida = db
      .prepare(
        `SELECT 1 FROM acordo_parcelas WHERE acordo_id = ? AND data_pagamento IS NULL AND date(vencimento, '+${CARENCIA_DIAS} days') < ?`
      )
      .get(acordo.id, hojeISO());
    if (!aindaVencida) {
      db.prepare("UPDATE acordos SET status = 'ativo', encerrado_em = NULL WHERE id = ?").run(acordo.id);
      status = 'ativo';
      registrarAuditoria(req, {
        entidade: 'acordo', entidadeId: acordo.id, acao: 'retomar',
        antes: { status: 'descumprido' }, depois: { status: 'ativo' }, detalhe: rotuloDoApartamento(acordo.apartamento_id),
      });
    }
  }
  res.json({ message: 'Pagamento registrado.', status, parcelas_restantes: restantes });
});

const rotuloDaParcela = (acordo, parcela) => `${rotuloDoApartamento(acordo.apartamento_id)} · ${parcela}`;

// Cancela o acordo (ativo ou descumprido): as taxas voltam a valer como estavam. Pagamentos já recebidos continuam como receita.
acordosRouter.post('/:id/cancelar', (req, res) => {
  const acordo = acordoPorId(req.params.id);
  if (!acordo) return res.status(404).json({ error: 'Acordo não encontrado.' });
  if (acordo.status === 'cancelado') return res.status(409).json({ error: 'Este acordo já está cancelado.' });
  if (acordo.status === 'quitado') return res.status(409).json({ error: 'Um acordo quitado não pode ser cancelado.' });
  const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
  if (motivo.length < 3 || motivo.length > 200) {
    return res.status(400).json({ error: 'Informe o motivo do cancelamento (de 3 a 200 caracteres).' });
  }
  db.prepare("UPDATE acordos SET status = 'cancelado', encerrado_em = datetime('now'), motivo_cancelamento = ? WHERE id = ?").run(motivo, acordo.id);
  registrarAuditoria(req, {
    entidade: 'acordo', entidadeId: acordo.id, acao: 'cancelar',
    antes: instantaneo(acordo, CAMPOS_ACORDO), depois: instantaneo(acordoPorId(acordo.id), CAMPOS_ACORDO),
    detalhe: rotuloDoApartamento(acordo.apartamento_id),
  });
  res.json({ message: 'Acordo cancelado.' });
});
