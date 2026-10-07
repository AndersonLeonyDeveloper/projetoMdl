import fs from 'node:fs';
import path from 'node:path';

// Recria um banco VAZIO, só com o administrador padrão e sem estrutura, para exercitar o primeiro acesso
// (assistente de configuração). O primeiro acesso só acontece uma vez por banco, então este script apaga e recria o
// arquivo a cada execução.
//
// Fica num arquivo e numa pasta próprios (por padrão ./data/primeiro-acesso/), separados do banco de demonstração,
// que nunca é tocado: o script recusa o caminho do banco de demonstração.
// A segunda instância da API sobe nesse banco com "npm run start:vazio -w server" (porta 3002).

const PADRAO = './data/primeiro-acesso/condominio.sqlite';
const DEMONSTRACAO = path.resolve(process.cwd(), './data/condominio.sqlite');

const alvo = path.resolve(process.cwd(), process.env.DATABASE_PATH ?? PADRAO);
if (alvo === DEMONSTRACAO) {
  console.error('Recusado: este é o banco de demonstração. Use "npm run db:populate" para recriá-lo.');
  console.error(`Sem DATABASE_PATH, o db:vazio usa ${PADRAO}.`);
  process.exit(1);
}

for (const sufixo of ['', '-wal', '-shm', '-journal']) fs.rmSync(alvo + sufixo, { force: true });
fs.rmSync(path.join(path.dirname(alvo), 'comprovantes'), { recursive: true, force: true });

// O banco abre ao importar db/index.js, então o caminho é fixado antes (variável já definida não é sobrescrita pelo .env).
process.env.DATABASE_PATH = alvo;
const { garantirAdmin, runMigrations } = await import('./index.js');

runMigrations();
garantirAdmin();

console.log('Banco vazio criado em:');
console.log(`  ${alvo}`);
console.log('Estado: sem estrutura (condomínio não configurado) e só o administrador padrão (admin@condominio.com / senha123).');
console.log('\nPara usar:');
console.log('  1. API na porta 3002 (outro terminal): npm run start:vazio -w server   (dentro de app/)');
console.log('  2. Tela:  npm run dev:vazio -w client   → http://localhost:5174  (entre como admin e siga o assistente)');
console.log('  3. Testes de API: cd test/restassured && mvn test -Pprimeiro-acesso');
