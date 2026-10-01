import { db, runMigrations, withTransaction } from './index.js';

runMigrations();

const { total: totalAdmins } = db
  .prepare("SELECT COUNT(*) AS total FROM usuarios WHERE role = 'admin'")
  .get();

if (totalAdmins === 0) {
  console.error('Nenhum usuário admin encontrado — reset abortado para não deixar o sistema sem acesso.');
  console.error('Rode "npm run db:seed" para criar o admin padrão.');
  process.exit(1);
}

withTransaction(() => {
  db.exec('DELETE FROM password_reset_tokens');
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
    WHERE name IN ('moradores','password_reset_tokens','taxas_condominio','outras_receitas','despesas')
  `);
});

const admins = db.prepare("SELECT email FROM usuarios WHERE role = 'admin'").all();
console.log('Banco zerado com sucesso. Mantidos a estrutura (blocos/apartamentos) e o(s) administrador(es):');
for (const { email } of admins) console.log(`  ${email}`);
