import { Router } from 'express';
import { db, withTransaction, isUniqueConstraintError } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const cadastroRouter = Router();
cadastroRouter.use(requireAuth);

// ---------- Blocos ----------

cadastroRouter.get('/blocos', (_req, res) => {
  res.json(db.prepare('SELECT * FROM blocos ORDER BY numero').all());
});

cadastroRouter.post('/blocos', requireRole('admin'), (req, res) => {
  const { numero } = req.body ?? {};
  if (!numero) return res.status(400).json({ error: 'Número do bloco é obrigatório.' });
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
  const { bloco_id, numero } = req.body ?? {};
  if (!bloco_id || !numero) {
    return res.status(400).json({ error: 'bloco_id e numero são obrigatórios.' });
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
        error: `Já existe um ${tipo} ativo para este apartamento.`,
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
cadastroRouter.get('/dados-moradores', requireRole('admin'), (_req, res) => {
  const linhas = db
    .prepare(
      `SELECT b.numero AS bloco, a.numero AS apartamento, m.tipo, p.nome, p.telefone, p.email
       FROM apartamentos a
       JOIN blocos b ON b.id = a.bloco_id
       LEFT JOIN moradores m ON m.apartamento_id = a.id AND m.ativo = 1
       LEFT JOIN pessoas p ON p.id = m.pessoa_id
       ORDER BY b.numero, a.numero, m.tipo`
    )
    .all();
  res.json(linhas);
});
