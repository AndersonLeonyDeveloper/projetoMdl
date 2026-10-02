import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DATABASE_PATH ?? './data/condominio.sqlite';
const resolvedPath = path.resolve(process.cwd(), dbPath);
export const DATA_DIR = path.dirname(resolvedPath);
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(resolvedPath);
db.exec('PRAGMA foreign_keys = ON');

export function runMigrations() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  garantirColunas();
  garantirAuditoriaSemRestricaoDeEntidade();
  garantirEstrutura();
}

// Colunas acrescentadas depois da criação das tabelas. Bancos antigos não as têm (o schema só cria tabelas que não
// existem), então são acrescentadas aqui. Idempotente: só acrescenta o que falta e nunca mexe nos dados.
const COLUNAS_ADICIONAIS = [
  ['taxas_condominio', 'cancelado_em', 'TEXT'],
  ['taxas_condominio', 'cancelado_por', 'INTEGER'],
  ['taxas_condominio', 'motivo_cancelamento', 'TEXT'],
  ['outras_receitas', 'cancelado_em', 'TEXT'],
  ['outras_receitas', 'cancelado_por', 'INTEGER'],
  ['outras_receitas', 'motivo_cancelamento', 'TEXT'],
  ['despesas', 'cancelado_em', 'TEXT'],
  ['despesas', 'cancelado_por', 'INTEGER'],
  ['despesas', 'motivo_cancelamento', 'TEXT'],
  ['apartamentos', 'fator_taxa', 'REAL NOT NULL DEFAULT 1'],
  ['despesas', 'bloco_id', 'INTEGER REFERENCES blocos(id)'],
  ['despesas', 'fundo_reserva', 'INTEGER NOT NULL DEFAULT 0'],
  ['configuracao_financeira', 'fundo_saldo_inicial', 'REAL NOT NULL DEFAULT 0'],
  ['taxa_padrao', 'fundo_percentual', 'REAL NOT NULL DEFAULT 10'],
];

function garantirColunas() {
  for (const [tabela, nome, definicao] of COLUNAS_ADICIONAIS) {
    const existentes = new Set(db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name));
    if (!existentes.has(nome)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${nome} ${definicao}`);
  }
}

// A primeira versão da auditoria restringia o tipo da entidade a quatro valores. Para aceitar novos tipos (apartamento,
// acordo...) recria a tabela sem a restrição, preservando as linhas. Só roda se a restrição ainda existir.
function garantirAuditoriaSemRestricaoDeEntidade() {
  const definicao = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auditoria'").get()?.sql ?? '';
  if (!/CHECK\s*\(\s*entidade\s+IN/i.test(definicao)) return;
  withTransaction(() => {
    db.exec('ALTER TABLE auditoria RENAME TO auditoria_antiga');
    db.exec(`CREATE TABLE auditoria (
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
    )`);
    db.exec(`INSERT INTO auditoria (id, entidade, entidade_id, acao, usuario_id, usuario_email, antes, depois, detalhe, criado_em)
             SELECT id, entidade, entidade_id, acao, usuario_id, usuario_email, antes, depois, detalhe, criado_em FROM auditoria_antiga`);
    db.exec('DROP TABLE auditoria_antiga');
    db.exec('CREATE INDEX IF NOT EXISTS idx_auditoria_entidade ON auditoria(entidade, entidade_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_auditoria_criado_em ON auditoria(criado_em)');
  });
}

// Estrutura fixa do condomínio: blocos 01..12, cada um com os mesmos 16 apartamentos.
// Idempotente — pode rodar a cada boot sem duplicar nem apagar nada.
export const BLOCOS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
export const APARTAMENTOS = ['01', '02', '03', '04'].concat(
  ...[1, 2, 3].map((andar) => [1, 2, 3, 4].map((n) => `${andar}0${n}`))
);

export function garantirEstrutura() {
  const insertBloco = db.prepare('INSERT OR IGNORE INTO blocos (numero) VALUES (?)');
  const insertApto = db.prepare(
    'INSERT OR IGNORE INTO apartamentos (bloco_id, numero) SELECT id, ? FROM blocos WHERE numero = ?'
  );
  withTransaction(() => {
    for (const bloco of BLOCOS) {
      insertBloco.run(bloco);
      for (const apto of APARTAMENTOS) insertApto.run(apto, bloco);
    }
  });
}

// node:sqlite (DatabaseSync) não expõe um helper `.transaction()` como o better-sqlite3.
export function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function isUniqueConstraintError(err) {
  return err.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/.test(err.message);
}

// Parâmetros financeiros (multa, juros e dia de vencimento): uma única linha, id = 1.
export const lerConfiguracao = () => db.prepare('SELECT * FROM configuracao_financeira WHERE id = 1').get();

export const SENHA_PADRAO = 'senha123';
export const EMAIL_ADMIN_PADRAO = 'admin@condominio.com';

// Cria o administrador padrão se o banco ainda não tiver nenhum. Retorna true quando criou.
export function garantirAdmin() {
  if (db.prepare("SELECT id FROM usuarios WHERE role = 'admin' LIMIT 1").get()) return false;
  db.prepare('INSERT INTO usuarios (email, senha_hash, role, pessoa_id) VALUES (?, ?, ?, NULL)').run(
    EMAIL_ADMIN_PADRAO,
    bcrypt.hashSync(SENHA_PADRAO, 10),
    'admin'
  );
  return true;
}
