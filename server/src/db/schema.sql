-- Schema derivado de regras-de-negocio/modelagem-dados.md (Rev. 2)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS blocos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS apartamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bloco_id INTEGER NOT NULL REFERENCES blocos(id) ON DELETE RESTRICT,
  numero TEXT NOT NULL,
  UNIQUE (bloco_id, numero)
);

CREATE TABLE IF NOT EXISTS pessoas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  cpf TEXT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS moradores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pessoa_id INTEGER NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  apartamento_id INTEGER NOT NULL REFERENCES apartamentos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('proprietario', 'inquilino')),
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Garante no máximo 1 proprietário e 1 inquilino ATIVOS por apartamento,
-- sem travar o histórico de vínculos desativados (ver modelagem-dados.md, seção 4).
CREATE UNIQUE INDEX IF NOT EXISTS idx_morador_ativo_unico
  ON moradores(apartamento_id, tipo)
  WHERE ativo = 1;

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'proprietario', 'inquilino')),
  pessoa_id INTEGER REFERENCES pessoas(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_password_reset_usuario ON password_reset_tokens(usuario_id);

CREATE TABLE IF NOT EXISTS taxas_condominio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apartamento_id INTEGER NOT NULL REFERENCES apartamentos(id) ON DELETE CASCADE,
  mes_referencia INTEGER NOT NULL CHECK (mes_referencia BETWEEN 1 AND 12),
  ano_referencia INTEGER NOT NULL,
  valor REAL NOT NULL,
  juros REAL NOT NULL DEFAULT 0,
  data_pagamento TEXT,
  situacao TEXT NOT NULL CHECK (situacao IN ('adimplente', 'inadimplente')),
  meses_atraso INTEGER NOT NULL DEFAULT 0,
  comprovante_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (apartamento_id, mes_referencia, ano_referencia)
);

CREATE TABLE IF NOT EXISTS outras_receitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  data TEXT NOT NULL,
  comprovante_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS despesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  data TEXT NOT NULL,
  comprovante_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_apartamentos_bloco ON apartamentos(bloco_id);
CREATE INDEX IF NOT EXISTS idx_moradores_pessoa ON moradores(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_moradores_apartamento ON moradores(apartamento_id);
CREATE INDEX IF NOT EXISTS idx_taxas_apto_periodo ON taxas_condominio(apartamento_id, ano_referencia, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_outras_receitas_data ON outras_receitas(data);
CREATE INDEX IF NOT EXISTS idx_despesas_data ON despesas(data);
