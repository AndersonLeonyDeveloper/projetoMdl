import { Router } from 'express';
import { db, withTransaction, isUniqueConstraintError, lerConfiguracao } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { calcularJuros, hojeISO, sqlVencida } from '../utils/juros.js';
import { atualizarStatusDosAcordos, sqlEmAcordo } from '../utils/acordos.js';
import { instantaneo, registrarAuditoria, rotuloDoApartamento } from '../utils/auditoria.js';

export const cadastroRouter = Router();
cadastroRouter.use(requireAuth);

// ---------- Blocos ----------

cadastroRouter.get('/blocos', (_req, res) => {
  res.json(db.prepare('SELECT * FROM blocos ORDER BY numero').all());
});

// Número de bloco ou de apartamento: 1 a 5 letras ou dígitos, sem espaços. Bloco só com um dígito ("5") vira "05",
// como os blocos existentes (01 a 12), para "5" e "05" não serem dois blocos.
const NUMERO_VALIDO = /^[A-Za-z0-9]{1,5}$/;
function lerNumero(valor, { bloco = false } = {}) {
  const numero = String(valor ?? '').trim();
  if (!NUMERO_VALIDO.test(numero)) return null;
  return bloco && /^\d$/.test(numero) ? `0${numero}` : numero.toUpperCase();
}

cadastroRouter.post('/blocos', requireRole('admin'), (req, res) => {
  if (req.body?.numero === undefined || String(req.body.numero).trim() === '') {
    return res.status(400).json({ error: 'Número do bloco é obrigatório.' });
  }
  const numero = lerNumero(req.body.numero, { bloco: true });
  if (!numero) {
    return res.status(400).json({ error: 'O número do bloco deve ter de 1 a 5 letras ou números, sem espaços.' });
  }
  try {
    const info = db.prepare('INSERT INTO blocos (numero) VALUES (?)').run(numero);
    res.status(201).json({ id: info.lastInsertRowid, numero });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'Já existe um bloco com esse número.' });
    }
    throw err;
  }
});

// ---------- Apartamentos ----------

cadastroRouter.get('/apartamentos', (req, res) => {
  const { bloco_id } = req.query;
  const apartamentos = bloco_id
    ? db
        .prepare('SELECT * FROM apartamentos WHERE bloco_id = ? ORDER BY numero')
        .all(Number(bloco_id))
    : db.prepare('SELECT * FROM apartamentos ORDER BY bloco_id, numero').all();
  res.json(apartamentos);
});

cadastroRouter.post('/apartamentos', requireRole('admin'), (req, res) => {
  const { bloco_id } = req.body ?? {};
  if (!bloco_id || req.body?.numero === undefined || String(req.body.numero).trim() === '') {
    return res.status(400).json({ error: 'bloco_id e numero são obrigatórios.' });
  }
  const numero = lerNumero(req.body.numero);
  if (!numero) {
    return res.status(400).json({ error: 'O número do apartamento deve ter de 1 a 5 letras ou números, sem espaços.' });
  }
  if (!db.prepare('SELECT 1 FROM blocos WHERE id = ?').get(bloco_id)) {
    return res.status(404).json({ error: 'Bloco não encontrado.' });
  }
  try {
    const info = db
      .prepare('INSERT INTO apartamentos (bloco_id, numero) VALUES (?, ?)')
      .run(bloco_id, numero);
    res.status(201).json({ id: info.lastInsertRowid, bloco_id, numero });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'Esse apartamento já existe nesse bloco.' });
    }
    throw err;
  }
});

// Fator da taxa: multiplica o valor-base do ano ao gerar as taxas do mês (1 = valor-base; ex.: 1,2 para uma cobertura).
// Não altera taxas já lançadas. Aceita de 0,1 a 5, com até 4 casas decimais.
function lerFator(valor) {
  if (valor === undefined || valor === null || valor === '' || !Number.isFinite(Number(valor))) return null;
  const fator = Math.round(Number(valor) * 10000) / 10000;
  return fator >= 0.1 && fator <= 5 ? fator : null;
}
const MENSAGEM_FATOR = 'fator deve ser um número entre 0,1 e 5.';

cadastroRouter.put('/apartamentos/:id/fator-taxa', requireRole('admin'), (req, res) => {
  const apto = db.prepare('SELECT * FROM apartamentos WHERE id = ?').get(req.params.id);
  if (!apto) return res.status(404).json({ error: 'Apartamento não encontrado.' });
  const fator = lerFator(req.body?.fator);
  if (fator === null) return res.status(400).json({ error: MENSAGEM_FATOR });
  db.prepare('UPDATE apartamentos SET fator_taxa = ? WHERE id = ?').run(fator, apto.id);
  if (fator !== apto.fator_taxa) {
    registrarAuditoria(req, {
      entidade: 'apartamento', entidadeId: apto.id, acao: 'editar',
      antes: { fator_taxa: apto.fator_taxa }, depois: { fator_taxa: fator }, detalhe: `${rotuloDoApartamento(apto.id)} · fator da taxa`,
    });
  }
  res.json({ id: apto.id, fator_taxa: fator });
});

// Aplica o mesmo fator a todos os apartamentos de um bloco.
cadastroRouter.post('/blocos/:id/fator-taxa', requireRole('admin'), (req, res) => {
  const bloco = db.prepare('SELECT * FROM blocos WHERE id = ?').get(req.params.id);
  if (!bloco) return res.status(404).json({ error: 'Bloco não encontrado.' });
  const fator = lerFator(req.body?.fator);
  if (fator === null) return res.status(400).json({ error: MENSAGEM_FATOR });
  const antes = db.prepare('SELECT id, fator_taxa FROM apartamentos WHERE bloco_id = ?').all(bloco.id);
  const alterados = antes.filter((a) => a.fator_taxa !== fator).length;
  db.prepare('UPDATE apartamentos SET fator_taxa = ? WHERE bloco_id = ?').run(fator, bloco.id);
  if (alterados > 0) {
    registrarAuditoria(req, {
      entidade: 'apartamento', acao: 'editar_bloco',
      depois: { bloco: bloco.numero, fator_taxa: fator, apartamentos_alterados: alterados },
      detalhe: `Bloco ${bloco.numero} · fator da taxa ${fator} em ${alterados} apartamento(s)`,
    });
  }
  res.json({ bloco_id: bloco.id, fator_taxa: fator, apartamentos: antes.length, alterados });
});

// Detalhe de um apartamento com moradores ativos (proprietário/inquilino)
cadastroRouter.get('/apartamentos/:id/moradores', (req, res) => {
  const moradores = db
    .prepare(
      `SELECT m.id, m.tipo, m.ativo, p.id AS pessoa_id, p.nome, p.telefone, p.cpf, p.email
       FROM moradores m
       JOIN pessoas p ON p.id = m.pessoa_id
       WHERE m.apartamento_id = ? AND m.ativo = 1`
    )
    .all(req.params.id);
  res.json(moradores);
});

// ---------- Moradores (vínculo pessoa <-> apartamento) ----------

const CPF_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;

function validarCadastroMorador({ tipo, nome, telefone, cpf, email }) {
  if (!['proprietario', 'inquilino'].includes(tipo)) {
    return 'Tipo de morador inválido.';
  }
  if (!nome || !telefone || !email) {
    return 'Nome, telefone e e-mail são obrigatórios.';
  }
  if (tipo === 'proprietario' && !cpf) {
    return 'CPF é obrigatório para proprietário.';
  }
  if (cpf && !CPF_REGEX.test(cpf)) {
    return 'CPF em formato inválido (esperado 000.000.000-00).';
  }
  return null;
}

// Cadastro de morador (Admin): cria/reaproveita a pessoa pelo e-mail e cria o vínculo ativo.
cadastroRouter.post('/moradores', requireRole('admin'), (req, res) => {
  const { apartamento_id, tipo, nome, telefone, cpf, email } = req.body ?? {};

  if (!apartamento_id) {
    return res.status(400).json({ error: 'apartamento_id é obrigatório.' });
  }
  const erro = validarCadastroMorador({ tipo, nome, telefone, cpf, email });
  if (erro) return res.status(400).json({ error: erro });

  try {
    const resultado = withTransaction(() => {
      let pessoa = db.prepare('SELECT * FROM pessoas WHERE email = ?').get(email);
      if (!pessoa) {
        const info = db
          .prepare('INSERT INTO pessoas (nome, telefone, cpf, email) VALUES (?, ?, ?, ?)')
          .run(nome, telefone, cpf ?? null, email);
        pessoa = { id: info.lastInsertRowid };
      } else if (cpf && !pessoa.cpf) {
        db.prepare('UPDATE pessoas SET cpf = ? WHERE id = ?').run(cpf, pessoa.id);
      }

      const vinculo = db
        .prepare(
          'INSERT INTO moradores (pessoa_id, apartamento_id, tipo, ativo) VALUES (?, ?, ?, 1)'
        )
        .run(pessoa.id, apartamento_id, tipo);

      return { id: vinculo.lastInsertRowid, pessoa_id: pessoa.id };
    });

    res.status(201).json(resultado);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({
        error: 'Já existe um proprietário ativo para este apartamento.',
      });
    }
    throw err;
  }
});

// Desativa o vínculo (não é hard delete — preserva histórico, ver regras-de-negocio.md 3.3).
cadastroRouter.delete('/moradores/:id', requireRole('admin'), (req, res) => {
  const info = db
    .prepare('UPDATE moradores SET ativo = 0 WHERE id = ? AND ativo = 1')
    .run(req.params.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Vínculo não encontrado ou já inativo.' });
  }
  res.status(204).end();
});

// "Meus Apartamentos": vínculos ativos da pessoa autenticada.
cadastroRouter.get('/moradores/meus-apartamentos', (req, res) => {
  if (!req.user.pessoa_id) {
    return res.status(403).json({ error: 'Usuário admin não possui apartamentos vinculados.' });
  }
  const apartamentos = db
    .prepare(
      `SELECT m.tipo, a.id AS apartamento_id, a.numero AS apartamento_numero, b.numero AS bloco_numero
       FROM moradores m
       JOIN apartamentos a ON a.id = m.apartamento_id
       JOIN blocos b ON b.id = a.bloco_id
       WHERE m.pessoa_id = ? AND m.ativo = 1
       ORDER BY b.numero, a.numero`
    )
    .all(req.user.pessoa_id);
  res.json(apartamentos);
});

// "Meus Dados": dados da pessoa autenticada.
cadastroRouter.get('/pessoas/me', (req, res) => {
  if (!req.user.pessoa_id) {
    return res.status(404).json({ error: 'Usuário não possui pessoa vinculada.' });
  }
  const pessoa = db.prepare('SELECT id, nome, telefone, cpf, email FROM pessoas WHERE id = ?').get(
    req.user.pessoa_id
  );
  res.json(pessoa);
});

cadastroRouter.put('/pessoas/me', (req, res) => {
  if (!req.user.pessoa_id) {
    return res.status(404).json({ error: 'Usuário não possui pessoa vinculada.' });
  }
  const { nome, telefone, email, confirmarEmail } = req.body ?? {};
  if (!nome || !telefone || !email) {
    return res.status(400).json({ error: 'Nome, telefone e e-mail são obrigatórios.' });
  }
  if (email !== confirmarEmail) {
    return res.status(400).json({ error: 'Confirmação de e-mail não confere.' });
  }
  db.prepare('UPDATE pessoas SET nome = ?, telefone = ?, email = ? WHERE id = ?').run(
    nome,
    telefone,
    email,
    req.user.pessoa_id
  );
  res.json({ message: 'Dados atualizados com sucesso.' });
});

// Admin: visão completa de todos os apartamentos (dados dos moradores).
// Nas linhas de proprietário, "taxas_em_atraso" lista as mensalidades inadimplentes já vencidas do apartamento
// (vazia = em dia), com o juros estimado até hoje (mesma fórmula do pagamento, se pago hoje). Vencida: o dia de
// vencimento do mês de referência já passou (no próprio dia ainda não é atraso).
// Exceção: em apartamento SEM proprietário (vazio ou só com inquilinos) todas as linhas trazem `sem_proprietario: true` e
// a lista de atraso do apartamento, já que não há proprietário a quem atribuir a dívida. Nas demais linhas de
// inquilino, `taxas_em_atraso` é null.
cadastroRouter.get('/dados-moradores', requireRole('admin'), (_req, res) => {
  atualizarStatusDosAcordos();
  const linhas = db
    .prepare(
      `SELECT a.id AS apartamento_id, b.numero AS bloco, a.numero AS apartamento, m.tipo, p.nome, p.telefone, p.email
       FROM apartamentos a
       JOIN blocos b ON b.id = a.bloco_id
       LEFT JOIN moradores m ON m.apartamento_id = a.id AND m.ativo = 1
       LEFT JOIN pessoas p ON p.id = m.pessoa_id
       ORDER BY b.numero, a.numero, m.tipo`
    )
    .all();

  const configuracao = lerConfiguracao();
  const hoje = hojeISO();
  const emAtraso = new Map();
  const vencidas = db
    .prepare(
      `SELECT t.id, t.apartamento_id, t.mes_referencia, t.ano_referencia, t.valor
       FROM taxas_condominio t
       WHERE t.situacao = 'inadimplente' AND t.cancelado_em IS NULL
         AND ${sqlVencida('t.')} AND NOT ${sqlEmAcordo('t.')}
       ORDER BY t.ano_referencia, t.mes_referencia`
    )
    .all({ dia: configuracao.dia_vencimento, hoje });
  for (const taxa of vencidas) {
    const { dias_em_atraso, juros, total } = calcularJuros({ ...taxa, data_pagamento: hoje }, configuracao);
    if (!emAtraso.has(taxa.apartamento_id)) emAtraso.set(taxa.apartamento_id, []);
    emAtraso.get(taxa.apartamento_id).push({
      id: taxa.id,
      mes_referencia: taxa.mes_referencia,
      ano_referencia: taxa.ano_referencia,
      valor: taxa.valor,
      dias_em_atraso,
      juros,
      total,
    });
  }

  // Taxas cobertas por acordo ativo, por apartamento (não contam como atraso; a tela as mostra à parte).
  const emAcordo = new Map(
    db
      .prepare(
        `SELECT t.apartamento_id, COUNT(*) AS total
         FROM acordo_taxas at JOIN acordos ac ON ac.id = at.acordo_id JOIN taxas_condominio t ON t.id = at.taxa_id
         WHERE ac.status = 'ativo' GROUP BY t.apartamento_id`
      )
      .all()
      .map((l) => [l.apartamento_id, l.total])
  );
  const comProprietario = new Set(linhas.filter((l) => l.tipo === 'proprietario').map((l) => l.apartamento_id));
  res.json(
    linhas.map((linha) => {
      const semProprietario = !comProprietario.has(linha.apartamento_id);
      return {
        ...linha,
        sem_proprietario: semProprietario,
        taxas_em_atraso:
          linha.tipo === 'proprietario' || semProprietario ? (emAtraso.get(linha.apartamento_id) ?? []) : null,
        taxas_em_acordo:
          linha.tipo === 'proprietario' || semProprietario ? (emAcordo.get(linha.apartamento_id) ?? 0) : null,
      };
    })
  );
});
