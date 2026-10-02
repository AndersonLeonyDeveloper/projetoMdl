import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Monta o banco completo de demonstração em um comando: reset → moradores (com logins) → financeiro.
// Cada etapa roda como processo próprio, porque os seeds executam ao serem importados.
const pasta = path.dirname(fileURLToPath(import.meta.url));
const etapas = ['reset.js', 'seed-moradores.js', 'seed-financeiro.js'];

for (const etapa of etapas) {
  console.log(`\n> ${etapa}`);
  try {
    execFileSync(process.execPath, [path.join(pasta, etapa)], { stdio: 'inherit' });
  } catch {
    console.error(`\nFalha em ${etapa}. Banco pode estar incompleto; rode "npm run db:populate" de novo.`);
    process.exit(1);
  }
}
console.log('\nBanco populado com sucesso.');
