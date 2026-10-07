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
  garantirCondominio();
  garantirOrdem();
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
  ['usuarios', 'ativo', 'INTEGER NOT NULL DEFAULT 1'],
  ['blocos', 'ordem', 'INTEGER NOT NULL DEFAULT 0'],
  ['apartamentos', 'ordem', 'INTEGER NOT NULL DEFAULT 0'],
  ['apartamentos', 'andar', 'INTEGER'],
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

// Linha de configuração do condomínio. Um banco que já tem blocos (criado quando a estrutura era fixa, 12 x 16) é tratado
// como configurado, com os nomes "Bloco/Apartamento"; um banco vazio espera o assistente de primeiro acesso.
// A estrutura NÃO é mais criada no boot — nasce do assistente (POST /api/condominio) ou de aplicarEstruturaPadrao().
function garantirCondominio() {
  if (db.prepare('SELECT 1 FROM condominio_config WHERE id = 1').get()) return;
  const legado = db.prepare('SELECT COUNT(*) AS n FROM blocos').get().n > 0;
  // Banco legado: era o condomínio do projeto (nome que o layout exibia antes de ser configurável).
  db.prepare('INSERT INTO condominio_config (id, nome, setup_concluido) VALUES (1, ?, ?)').run(legado ? 'Morada da Lagoa' : 'Condomínio', legado ? 1 : 0);
  if (!legado) return;
  // Andar implícito no número: "203" = andar 2; "01" = térreo (andar 0).
  const apartamentos = db.prepare('SELECT id, numero FROM apartamentos WHERE andar IS NULL').all();
  const atualizar = db.prepare('UPDATE apartamentos SET andar = ? WHERE id = ?');
  for (const { id, numero } of apartamentos) {
    if (/^\d{3}$/.test(numero)) atualizar.run(Number(numero[0]), id);
    else if (/^\d{2}$/.test(numero)) atualizar.run(0, id);
  }
}

// Posição de exibição (coluna "ordem"): preenche só o que ainda está em 0, na ordem textual antiga, e nunca reordena o resto.
function garantirOrdem() {
  const proximo = (tabela, filtro = '', param = []) =>
    db.prepare(`SELECT COALESCE(MAX(ordem), 0) AS m FROM ${tabela} ${filtro}`).get(...param).m + 1;
  const sem = db.prepare('SELECT id FROM blocos WHERE ordem = 0 ORDER BY numero').all();
  let ordem = proximo('blocos');
  for (const { id } of sem) db.prepare('UPDATE blocos SET ordem = ? WHERE id = ?').run(ordem++, id);
  for (const { bloco_id } of db.prepare('SELECT DISTINCT bloco_id FROM apartamentos WHERE ordem = 0').all()) {
    let n = proximo('apartamentos', 'WHERE bloco_id = ?', [bloco_id]);
    const linhas = db.prepare('SELECT id FROM apartamentos WHERE bloco_id = ? AND ordem = 0 ORDER BY numero').all(bloco_id);
    for (const { id } of linhas) db.prepare('UPDATE apartamentos SET ordem = ? WHERE id = ?').run(n++, id);
  }
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
