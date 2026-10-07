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
  -- Multiplica o valor da taxa do ano (1 = valor padrão; ex.: 1,2 para uma cobertura).
  fator_taxa REAL NOT NULL DEFAULT 1,
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

-- Garante no máximo 1 proprietário ATIVO por apartamento, sem travar o histórico
-- de vínculos desativados (ver modelagem-dados.md, seção 4). Inquilinos ativos não têm limite.
-- O DROP remove o índice antigo (1 proprietário + 1 inquilino) de bancos já criados.
DROP INDEX IF EXISTS idx_morador_ativo_unico;
CREATE UNIQUE INDEX IF NOT EXISTS idx_proprietario_ativo_unico
  ON moradores(apartamento_id)
  WHERE ativo = 1 AND tipo = 'proprietario';

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
  cancelado_em TEXT,
  cancelado_por INTEGER,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (apartamento_id, mes_referencia, ano_referencia)
);

CREATE TABLE IF NOT EXISTS outras_receitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  data TEXT NOT NULL,
  comprovante_path TEXT,
  cancelado_em TEXT,
  cancelado_por INTEGER,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS despesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  data TEXT NOT NULL,
  comprovante_path TEXT,
  -- Vazio = despesa geral (rateada igualmente entre os blocos). Preenchido = despesa só desse bloco.
  bloco_id INTEGER REFERENCES blocos(id),
  -- 1 = paga com o fundo de reserva (sai do saldo do fundo).
  fundo_reserva INTEGER NOT NULL DEFAULT 0,
  cancelado_em TEXT,
  cancelado_por INTEGER,
  motivo_cancelamento TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Estrutura e nomes do condomínio (uma única linha, id = 1): como o administrador chama os agrupadores (bloco, torre...)
-- e as unidades (apartamento, casa...), e a geometria usada para gerar a estrutura no primeiro acesso.
-- A linha é criada por runMigrations(); setup_concluido = 0 enquanto o administrador não concluiu o assistente.
CREATE TABLE IF NOT EXISTS condominio_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nome TEXT NOT NULL DEFAULT 'Condomínio',
  agrupador_singular TEXT NOT NULL DEFAULT 'Bloco',
  agrupador_plural TEXT NOT NULL DEFAULT 'Blocos',
  agrupador_genero TEXT NOT NULL DEFAULT 'm' CHECK (agrupador_genero IN ('m', 'f')),
  agrupador_abrev TEXT NOT NULL DEFAULT 'Bl.',
  unidade_singular TEXT NOT NULL DEFAULT 'Apartamento',
  unidade_plural TEXT NOT NULL DEFAULT 'Apartamentos',
  unidade_genero TEXT NOT NULL DEFAULT 'm' CHECK (unidade_genero IN ('m', 'f')),
  unidade_abrev TEXT NOT NULL DEFAULT 'Ap.',
  tem_terreo INTEGER NOT NULL DEFAULT 1,
  rotulo_terreo TEXT NOT NULL DEFAULT 'Térreo',
  sem_andares INTEGER NOT NULL DEFAULT 0,
  andares INTEGER NOT NULL DEFAULT 3,
  unidades_por_andar INTEGER NOT NULL DEFAULT 4,
  formato_numeracao TEXT NOT NULL DEFAULT 'andar_sequencia' CHECK (formato_numeracao IN ('andar_sequencia', 'sequencia')),
  setup_concluido INTEGER NOT NULL DEFAULT 0
);

-- Parâmetros financeiros (uma única linha, id = 1): multa, juros e vencimento.
CREATE TABLE IF NOT EXISTS configuracao_financeira (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  multa_percentual REAL NOT NULL DEFAULT 2 CHECK (multa_percentual >= 0 AND multa_percentual <= 2),
  juros_mensal_percentual REAL NOT NULL DEFAULT 1 CHECK (juros_mensal_percentual >= 0),
  dia_vencimento INTEGER NOT NULL DEFAULT 10 CHECK (dia_vencimento BETWEEN 1 AND 28),
  -- Saldo do fundo de reserva antes do primeiro lançamento do sistema.
  fundo_saldo_inicial REAL NOT NULL DEFAULT 0 CHECK (fundo_saldo_inicial >= 0)
);
INSERT OR IGNORE INTO configuracao_financeira (id) VALUES (1);

-- Valor da taxa de condomínio por ano (pré-preenche o lançamento e alimenta a geração em lote).
CREATE TABLE IF NOT EXISTS taxa_padrao (
  ano INTEGER PRIMARY KEY,
  valor REAL NOT NULL CHECK (valor >= 0),
  -- Parte do valor da taxa paga (sem juros) que vai para o fundo de reserva.
  fundo_percentual REAL NOT NULL DEFAULT 10 CHECK (fundo_percentual >= 0 AND fundo_percentual <= 100)
);

-- Histórico de alterações financeiras: só se grava, nunca se edita nem se apaga pela aplicação.
CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  acao TEXT NOT NULL,
  usuario_id INTEGER,
  usuario_email TEXT,
  antes TEXT,
  depois TEXT,
  detalhe TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidade ON auditoria(entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_criado_em ON auditoria(criado_em);

-- Acordos de dívida: renegociam taxas em atraso de um apartamento em parcelas (regras-de-negocio.md, seção 4.14).
CREATE TABLE IF NOT EXISTS acordos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apartamento_id INTEGER NOT NULL REFERENCES apartamentos(id),
  status TEXT NOT NULL CHECK (status IN ('ativo', 'quitado', 'descumprido', 'cancelado')),
  valor_taxas REAL NOT NULL,   -- soma do valor das taxas incluídas
  juros REAL NOT NULL,         -- multa + juros calculados até a data do acordo
  desconto REAL NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  valor_total REAL NOT NULL,   -- valor_taxas + juros - desconto
  entrada REAL NOT NULL DEFAULT 0 CHECK (entrada >= 0),
  observacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  criado_por INTEGER,
  encerrado_em TEXT,
  motivo_cancelamento TEXT
);

CREATE TABLE IF NOT EXISTS acordo_taxas (
  acordo_id INTEGER NOT NULL REFERENCES acordos(id),
  taxa_id INTEGER NOT NULL REFERENCES taxas_condominio(id),
  juros_calculado REAL NOT NULL, -- juros da taxa na data do acordo
  PRIMARY KEY (acordo_id, taxa_id)
);

CREATE TABLE IF NOT EXISTS acordo_parcelas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  acordo_id INTEGER NOT NULL REFERENCES acordos(id),
  numero INTEGER NOT NULL,     -- 0 = entrada; 1..N = parcelas
  vencimento TEXT NOT NULL,
  valor REAL NOT NULL,
  data_pagamento TEXT,
  UNIQUE (acordo_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_acordo_taxas_taxa ON acordo_taxas(taxa_id);
CREATE INDEX IF NOT EXISTS idx_acordo_parcelas_acordo ON acordo_parcelas(acordo_id);

CREATE INDEX IF NOT EXISTS idx_apartamentos_bloco ON apartamentos(bloco_id);
CREATE INDEX IF NOT EXISTS idx_moradores_pessoa ON moradores(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_moradores_apartamento ON moradores(apartamento_id);
CREATE INDEX IF NOT EXISTS idx_taxas_apto_periodo ON taxas_condominio(apartamento_id, ano_referencia, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_outras_receitas_data ON outras_receitas(data);
CREATE INDEX IF NOT EXISTS idx_despesas_data ON despesas(data);
