import { db, garantirAdmin, runMigrations, SENHA_PADRAO, withTransaction } from './index.js';
import bcrypt from 'bcryptjs';
import { gerarPessoasUnicas } from './fake-data.js';
import { aplicarEstruturaPadrao, exigirEstruturaDeDemonstracao } from './estrutura.js';

const INQUILINOS_POR_APTO = 3;

runMigrations();
aplicarEstruturaPadrao();
exigirEstruturaDeDemonstracao();
garantirAdmin();

const apartamentos = db
  .prepare(
    `SELECT a.id, b.numero AS bloco, a.numero
     FROM apartamentos a JOIN blocos b ON b.id = a.bloco_id
     ORDER BY b.ordem, b.numero, a.ordem, a.numero`
  )
  .all();

const adminEmails = db
  .prepare("SELECT email FROM usuarios WHERE role = 'admin'")
  .all()
  .map((u) => u.email);

// Logins de teste (senha padrão) ligados a moradores gerados. O restante dos moradores não tem login.
const LOGINS_NOMEADOS = [
  { email: 'anderson@example.com', nome: 'Anderson Leony Maia Barbosa', telefone: '(85) 97777-7777' },
  { email: 'maria@example.com', nome: 'Maria Fulana', telefone: '(85) 98888-8888' },
  { email: 'carlos.inquilino@example.com', nome: 'Carlos Inquilino', telefone: '(85) 96666-6666' },
];
const BLOCOS_DA_AMOSTRA = ['01', '02', '03'];
const emailsDosCenarios = ['pedro.atual@example.com', 'joana.antiga@example.com'];
const emailsDaAmostra = BLOCOS_DA_AMOSTRA.flatMap((b) => [
  `proprietario.bloco${b}@example.com`,
  `inquilino.bloco${b}@example.com`,
]);

const pessoas = gerarPessoasUnicas(apartamentos.length * (1 + INQUILINOS_POR_APTO), {
  emailsReservados: [
    ...adminEmails,
    ...LOGINS_NOMEADOS.map((l) => l.email),
    ...emailsDosCenarios,
    ...emailsDaAmostra,
  ],
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

const idDoApartamento = (bloco, numero) =>
  apartamentos.find((a) => a.bloco === bloco && a.numero === numero).id;
const moradorAtivo = (apartamentoId, tipo, ordem = 0) =>
  db
    .prepare(
      'SELECT id, pessoa_id FROM moradores WHERE apartamento_id = ? AND tipo = ? AND ativo = 1 ORDER BY id LIMIT 1 OFFSET ?'
    )
    .get(apartamentoId, tipo, ordem);
const atualizarPessoa = (pessoaId, { nome, telefone, email }) =>
  db
    .prepare('UPDATE pessoas SET nome = COALESCE(?, nome), telefone = COALESCE(?, telefone), email = ? WHERE id = ?')
    .run(nome ?? null, telefone ?? null, email, pessoaId);
const insertUsuario = db.prepare(
  'INSERT INTO usuarios (email, senha_hash, role, pessoa_id) VALUES (?, ?, ?, ?)'
);

// Cenários de borda que as sugestões de teste usam (vieram do antigo db:seed).
function aplicarCenarios() {
  // Bl.08/301: apartamento sem nenhum morador.
  db.prepare('DELETE FROM moradores WHERE apartamento_id = ?').run(idDoApartamento('08', '301'));
  // Bl.07/301: só inquilinos, sem proprietário (alerta de unidade sem proprietário).
  db.prepare("DELETE FROM moradores WHERE apartamento_id = ? AND tipo = 'proprietario'").run(
    idDoApartamento('07', '301')
  );
  // Bl.09/204: troca de inquilino com histórico (Joana Antiga desativada, Pedro Atual ativo).
  const apto204 = idDoApartamento('09', '204');
  atualizarPessoa(moradorAtivo(apto204, 'inquilino').pessoa_id, { nome: 'Pedro Atual', email: 'pedro.atual@example.com' });
  const joana = db
    .prepare('INSERT INTO pessoas (nome, telefone, cpf, email) VALUES (?, ?, NULL, ?)')
    .run('Joana Antiga', '(85) 95555-5555', 'joana.antiga@example.com').lastInsertRowid;
  db.prepare('INSERT INTO moradores (pessoa_id, apartamento_id, tipo, ativo) VALUES (?, ?, ?, 0)').run(
    joana,
    apto204,
    'inquilino'
  );
}

function criarLogins() {
  const hash = bcrypt.hashSync(SENHA_PADRAO, 10);
  const logar = (email, role, pessoaId) => insertUsuario.run(email, hash, role, pessoaId);

  // Anderson: proprietário de Bl.08/203 e de Bl.09/101 (a mesma pessoa nos dois apartamentos).
  const andersonMorador = moradorAtivo(idDoApartamento('08', '203'), 'proprietario');
  atualizarPessoa(andersonMorador.pessoa_id, LOGINS_NOMEADOS[0]);
  const outroApto = moradorAtivo(idDoApartamento('09', '101'), 'proprietario');
  db.prepare('UPDATE moradores SET pessoa_id = ? WHERE id = ?').run(andersonMorador.pessoa_id, outroApto.id);
  logar(LOGINS_NOMEADOS[0].email, 'proprietario', andersonMorador.pessoa_id);

  // Maria: proprietária de Bl.08/101. Carlos: inquilino de Bl.08/203.
  const maria = moradorAtivo(idDoApartamento('08', '101'), 'proprietario');
  atualizarPessoa(maria.pessoa_id, LOGINS_NOMEADOS[1]);
  logar(LOGINS_NOMEADOS[1].email, 'proprietario', maria.pessoa_id);
  const carlos = moradorAtivo(idDoApartamento('08', '203'), 'inquilino');
  atualizarPessoa(carlos.pessoa_id, LOGINS_NOMEADOS[2]);
  logar(LOGINS_NOMEADOS[2].email, 'inquilino', carlos.pessoa_id);

  // Amostra: o proprietário e o primeiro inquilino do apartamento 01 de cada bloco 01–03 (mantêm o nome gerado).
  for (const bloco of BLOCOS_DA_AMOSTRA) {
    const apto = idDoApartamento(bloco, '01');
    const dono = moradorAtivo(apto, 'proprietario');
    atualizarPessoa(dono.pessoa_id, { email: `proprietario.bloco${bloco}@example.com` });
    logar(`proprietario.bloco${bloco}@example.com`, 'proprietario', dono.pessoa_id);
    const inquilino = moradorAtivo(apto, 'inquilino');
    atualizarPessoa(inquilino.pessoa_id, { email: `inquilino.bloco${bloco}@example.com` });
    logar(`inquilino.bloco${bloco}@example.com`, 'inquilino', inquilino.pessoa_id);
  }
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

  criarLogins();
  aplicarCenarios();
  // Pessoas que ficaram sem vínculo (apartamentos esvaziados pelos cenários) não têm razão de existir.
  db.exec(`
    DELETE FROM pessoas
    WHERE id NOT IN (SELECT pessoa_id FROM moradores)
      AND id NOT IN (SELECT pessoa_id FROM usuarios WHERE pessoa_id IS NOT NULL)
  `);
});

const ativos = db.prepare('SELECT COUNT(*) AS total FROM moradores WHERE ativo = 1').get().total;
console.log(
  `Moradores populados: ${apartamentos.length} apartamentos × (1 proprietário + ${INQUILINOS_POR_APTO} inquilinos), ` +
    `menos os cenários de borda: ${ativos} vínculos ativos.`
);
console.log(`Logins de teste (senha padrão: "${SENHA_PADRAO}"):`);
console.log('  admin@condominio.com            (admin)');
console.log('  anderson@example.com            (proprietario — Bl.08/203 e Bl.09/101)');
console.log('  maria@example.com               (proprietario — Bl.08/101)');
console.log('  carlos.inquilino@example.com    (inquilino — Bl.08/203)');
console.log('  proprietario.bloco01@example.com … bloco03 / inquilino.bloco01@example.com … bloco03 (apartamento 01)');
console.log('Cenários: Bl.08/301 sem moradores; Bl.07/301 só com inquilinos; Bl.09/204 com inquilino desativado (histórico).');
