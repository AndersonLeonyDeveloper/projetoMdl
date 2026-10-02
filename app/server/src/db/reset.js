import fs from 'node:fs';
import { db, garantirAdmin, runMigrations, withTransaction } from './index.js';
import { COMPROVANTES_DIR } from '../utils/comprovantes.js';

runMigrations();

// Em um banco novo ainda não há administrador: cria o padrão para o sistema nunca ficar sem acesso.
if (garantirAdmin()) console.log('Administrador padrão criado (senha padrão: "senha123").');

withTransaction(() => {
  db.exec('DELETE FROM password_reset_tokens');
  db.exec('DELETE FROM auditoria');
  db.exec('DELETE FROM taxas_condominio');
  db.exec('DELETE FROM moradores');
  db.exec('DELETE FROM outras_receitas');
  db.exec('DELETE FROM despesas');

  db.exec("DELETE FROM usuarios WHERE role <> 'admin'");
  db.exec(`
    DELETE FROM pessoas
    WHERE id NOT IN (SELECT pessoa_id FROM usuarios WHERE pessoa_id IS NOT NULL)
  `);

  db.exec(`
    DELETE FROM sqlite_sequence
    WHERE name IN ('moradores','password_reset_tokens','taxas_condominio','outras_receitas','despesas','auditoria')
  `);
});

fs.rmSync(COMPROVANTES_DIR, { recursive: true, force: true });

const admins = db.prepare("SELECT email FROM usuarios WHERE role = 'admin'").all();
console.log('Banco zerado com sucesso. Mantidos a estrutura (blocos/apartamentos) e o(s) administrador(es):');
for (const { email } of admins) console.log(`  ${email}`);
