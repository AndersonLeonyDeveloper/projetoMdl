import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  garantirEstrutura();
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
