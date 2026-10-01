import { db, runMigrations, withTransaction } from './index.js';
import { gerarPessoasUnicas } from './fake-data.js';

const INQUILINOS_POR_APTO = 3;

runMigrations();

const apartamentos = db
  .prepare(
    `SELECT a.id, b.numero AS bloco, a.numero
     FROM apartamentos a JOIN blocos b ON b.id = a.bloco_id
     ORDER BY b.numero, a.numero`
  )
  .all();

const adminEmails = db
  .prepare("SELECT email FROM usuarios WHERE role = 'admin'")
  .all()
  .map((u) => u.email);

const pessoas = gerarPessoasUnicas(apartamentos.length * (1 + INQUILINOS_POR_APTO), {
  emailsReservados: adminEmails,
});

const insertPessoa = db.prepare(
  'INSERT INTO pessoas (nome, telefone, cpf, email) VALUES (?, ?, ?, ?)'
);
const insertMorador = db.prepare(
  'INSERT INTO moradores (pessoa_id, apartamento_id, tipo, ativo) VALUES (?, ?, ?, 1)'
);

function criarMorador(pessoa, apartamentoId, tipo) {
  // CPF só é obrigatório para proprietário (regras-de-negocio.md, seção 3.2).
  const cpf = tipo === 'proprietario' ? pessoa.cpf : null;
  const { lastInsertRowid } = insertPessoa.run(pessoa.nome, pessoa.telefone, cpf, pessoa.email);
  insertMorador.run(lastInsertRowid, apartamentoId, tipo);
}

withTransaction(() => {
  // Repovoa só moradores; blocos, apartamentos, admin e financeiro permanecem.
  db.exec('DELETE FROM moradores');
  db.exec("DELETE FROM usuarios WHERE role <> 'admin'");
  db.exec(`
    DELETE FROM pessoas
    WHERE id NOT IN (SELECT pessoa_id FROM usuarios WHERE pessoa_id IS NOT NULL)
  `);
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('moradores','pessoas')");

  let i = 0;
  for (const apto of apartamentos) {
    criarMorador(pessoas[i++], apto.id, 'proprietario');
    for (let n = 0; n < INQUILINOS_POR_APTO; n++) criarMorador(pessoas[i++], apto.id, 'inquilino');
  }
});

console.log(
  `Moradores populados: ${apartamentos.length} apartamentos × (1 proprietário + ${INQUILINOS_POR_APTO} inquilinos) = ${pessoas.length} pessoas.`
);
