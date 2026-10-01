import bcrypt from 'bcryptjs';
import { db, runMigrations, withTransaction } from './index.js';

runMigrations();

const buscarApartamento = db.prepare(`
  SELECT a.id FROM apartamentos a JOIN blocos b ON b.id = a.bloco_id
  WHERE b.numero = ? AND a.numero = ?
`);
const apartamentoId = (bloco, numero) => buscarApartamento.get(bloco, numero).id;
const insertPessoa = db.prepare(
  'INSERT INTO pessoas (nome, telefone, cpf, email) VALUES (?, ?, ?, ?)'
);
const insertMorador = db.prepare(
  'INSERT INTO moradores (pessoa_id, apartamento_id, tipo, ativo) VALUES (?, ?, ?, ?)'
);
const insertUsuario = db.prepare(
  'INSERT INTO usuarios (email, senha_hash, role, pessoa_id) VALUES (?, ?, ?, ?)'
);
const insertTaxa = db.prepare(`
  INSERT INTO taxas_condominio
    (apartamento_id, mes_referencia, ano_referencia, valor, juros, data_pagamento, situacao, meses_atraso, comprovante_path)
  VALUES (@apartamento_id, @mes_referencia, @ano_referencia, @valor, @juros, @data_pagamento, @situacao, @meses_atraso, @comprovante_path)
`);
const insertOutraReceita = db.prepare(`
  INSERT INTO outras_receitas (descricao, valor, data, comprovante_path) VALUES (?, ?, ?, ?)
`);
const insertDespesa = db.prepare(`
  INSERT INTO despesas (descricao, valor, data, comprovante_path) VALUES (?, ?, ?, ?)
`);

const SENHA_PADRAO = 'senha123';
const senhaHash = bcrypt.hashSync(SENHA_PADRAO, 10);

const seed = () => withTransaction(() => {
  // Torna o seed idempotente: limpa os dados antes de repovoar (útil para reset em dev/QA).
  // Blocos e apartamentos são estrutura fixa (ver garantirEstrutura) e não são apagados.
  db.exec('DELETE FROM taxas_condominio');
  db.exec('DELETE FROM moradores');
  db.exec('DELETE FROM usuarios');
  db.exec('DELETE FROM pessoas');
  db.exec('DELETE FROM outras_receitas');
  db.exec('DELETE FROM despesas');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('pessoas','moradores','usuarios','password_reset_tokens','taxas_condominio','outras_receitas','despesas')");

  // Apartamentos (já existem; só buscamos os usados nos cenários)
  const apto08_101 = apartamentoId('08', '101'); // proprietário único
  const apto08_203 = apartamentoId('08', '203'); // proprietário + inquilino
  const apto09_101 = apartamentoId('09', '101'); // 2º apto do mesmo proprietário
  const apto09_204 = apartamentoId('09', '204'); // troca de inquilino (histórico)
  // Bloco 08, apto 301 permanece sem morador (edge case de apartamento órfão)

  // Pessoas
  const anderson = insertPessoa.run(
    'Anderson Leony Maia Barbosa',
    '(85) 97777-7777',
    '023.567.789-56',
    'anderson@example.com'
  ).lastInsertRowid;
  const maria = insertPessoa.run(
    'Maria Fulana',
    '(85) 98888-8888',
    '987.654.321-00',
    'maria@example.com'
  ).lastInsertRowid;
  const carlos = insertPessoa.run(
    'Carlos Inquilino',
    '(85) 96666-6666',
    null,
    'carlos.inquilino@example.com'
  ).lastInsertRowid;
  const joanaAntiga = insertPessoa.run(
    'Joana Antiga',
    '(85) 95555-5555',
    null,
    'joana.antiga@example.com'
  ).lastInsertRowid;
  const pedroAtual = insertPessoa.run(
    'Pedro Atual',
    '(85) 94444-4444',
    null,
    'pedro.atual@example.com'
  ).lastInsertRowid;
  const fernanda = insertPessoa.run(
    'Fernanda Proprietária',
    '(85) 93333-3333',
    '111.222.333-44',
    'fernanda@example.com'
  ).lastInsertRowid;

  // Moradores (vínculos)
  insertMorador.run(maria, apto08_101, 'proprietario', 1);
  insertMorador.run(anderson, apto08_203, 'proprietario', 1);
  insertMorador.run(carlos, apto08_203, 'inquilino', 1);
  insertMorador.run(anderson, apto09_101, 'proprietario', 1); // Anderson: 2 apartamentos
  insertMorador.run(fernanda, apto09_204, 'proprietario', 1);
  insertMorador.run(joanaAntiga, apto09_204, 'inquilino', 0); // vínculo desativado (histórico)
  insertMorador.run(pedroAtual, apto09_204, 'inquilino', 1); // inquilino atual

  // Usuários
  insertUsuario.run('admin@condominio.com', senhaHash, 'admin', null);
  insertUsuario.run('anderson@example.com', senhaHash, 'proprietario', anderson);
  insertUsuario.run('maria@example.com', senhaHash, 'proprietario', maria);
  insertUsuario.run('carlos.inquilino@example.com', senhaHash, 'inquilino', carlos);

  // Taxas de condomínio — ano corrente 2026
  insertTaxa.run({
    apartamento_id: apto08_203,
    mes_referencia: 7,
    ano_referencia: 2026,
    valor: 220,
    juros: 0,
    data_pagamento: '2026-07-05',
    situacao: 'adimplente',
    meses_atraso: 0,
    comprovante_path: null,
  });
  insertTaxa.run({
    apartamento_id: apto08_203,
    mes_referencia: 8,
    ano_referencia: 2026,
    valor: 220,
    juros: 25,
    data_pagamento: null,
    situacao: 'inadimplente',
    meses_atraso: 1,
    comprovante_path: null,
  });
  insertTaxa.run({
    apartamento_id: apto08_101,
    mes_referencia: 7,
    ano_referencia: 2026,
    valor: 220,
    juros: 0,
    data_pagamento: '2026-07-03',
    situacao: 'adimplente',
    meses_atraso: 0,
    comprovante_path: null,
  });
  // Inadimplência crônica (3 meses consecutivos) no 2º apartamento do Anderson
  for (const [mes, meses_atraso] of [[7, 1], [8, 2], [9, 3]]) {
    insertTaxa.run({
      apartamento_id: apto09_101,
      mes_referencia: mes,
      ano_referencia: 2026,
      valor: 220,
      juros: 10 * meses_atraso,
      data_pagamento: null,
      situacao: 'inadimplente',
      meses_atraso,
      comprovante_path: null,
    });
  }
  insertTaxa.run({
    apartamento_id: apto09_204,
    mes_referencia: 7,
    ano_referencia: 2026,
    valor: 220,
    juros: 0,
    data_pagamento: '2026-07-10',
    situacao: 'adimplente',
    meses_atraso: 0,
    comprovante_path: null,
  });

  // Outras receitas (nível condomínio)
  insertOutraReceita.run('Bingo beneficente', 500, '2026-07-15', '/uploads/comprovantes/bingo-jul.pdf');
  insertOutraReceita.run('Propaganda em painel', 300, '2026-08-02', null);

  // Despesas (nível condomínio)
  insertDespesa.run('Produtos de limpeza', 55, '2026-07-10', null);
  insertDespesa.run('Reforma do muro', 800, '2026-08-20', '/uploads/comprovantes/reforma-muro.pdf');
});

seed();

console.log('Seed aplicado com sucesso.');
console.log(`Usuários de teste (senha padrão: "${SENHA_PADRAO}"):`);
console.log('  admin@condominio.com            (admin)');
console.log('  anderson@example.com            (proprietario — 2 apartamentos: Bl.08/203 e Bl.09/101)');
console.log('  maria@example.com               (proprietario — Bl.08/101)');
console.log('  carlos.inquilino@example.com    (inquilino — Bl.08/203)');
