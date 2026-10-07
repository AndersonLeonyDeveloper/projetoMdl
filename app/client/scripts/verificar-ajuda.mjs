// Confere se o conteúdo da ajuda guiada (src/ajuda/conteudo.ts) ainda bate com as telas:
//  - todo "alvo" de tour existe como data-testid (ou testId) em alguma tela;
//  - toda rota com tour existe em App.tsx;
//  - toda rota de guia existe em App.tsx (aviso se a tela não tiver tour).
// Uso: npm run verificar:ajuda            (opcional: node scripts/verificar-ajuda.mjs <caminho do conteudo.ts>)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(raiz, 'src');
const caminhoConteudo = process.argv[2] ?? path.join(src, 'ajuda', 'conteudo.ts');

function arquivos(pasta) {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name);
    if (e.isDirectory()) return arquivos(caminho);
    return caminho.endsWith('.tsx') ? [caminho] : [];
  });
}

const conteudo = fs.readFileSync(caminhoConteudo, 'utf8');
const app = fs.readFileSync(path.join(src, 'App.tsx'), 'utf8');
const telas = arquivos(src).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

// Alvos e rotas citados na ajuda.
const alvos = [...conteudo.matchAll(/alvo:\s*'([^']+)'/g)].map((m) => m[1]);
const rotasComTour = [...conteudo.matchAll(/^\s{2}'(\/[^']+)':\s*\{/gm)].map((m) => m[1]);
const rotasDeGuia = [...conteudo.matchAll(/rota:\s*'([^']+)'/g)].map((m) => m[1]);

// Rotas existentes em App.tsx: caminhos filhos prefixados pelo pai (/admin, /minha-area).
const rotasExistentes = new Set();
for (const prefixo of ['/admin', '/minha-area']) {
  const inicio = app.indexOf(`path="${prefixo}"`);
  if (inicio < 0) continue;
  const proximo = ['/admin', '/minha-area'].filter((p) => p !== prefixo).map((p) => app.indexOf(`path="${p}"`)).filter((i) => i > inicio);
  const fim = proximo.length ? Math.min(...proximo) : app.length;
  for (const m of app.slice(inicio, fim).matchAll(/<Route\s+path="([^"/][^"]*)"/g)) rotasExistentes.add(`${prefixo}/${m[1]}`);
}

const testIds = new Set([
  ...[...telas.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]),
  ...[...telas.matchAll(/testId="([^"]+)"/g)].map((m) => m[1]),
]);

// Marcadores {a.X} (agrupador) e {u.X} (unidade): X precisa ser uma forma válida de Termo (CondominioContext.tsx).
const FORMAS = ['s', 'S', 'p', 'P', 'abrev', 'o', 'do', 'no', 'um', 'este', 'esse', 'nesse', 'deste', 'ao'];
const marcadores = [...conteudo.matchAll(/\{([A-Za-z]\.[^{}\s]*)\}/g)].map((m) => m[1]);

const erros = [];
for (const m of marcadores) {
  const ok = /^[au]\.(\w+)$/.exec(m);
  if (!ok || !FORMAS.includes(ok[1])) erros.push(`marcador inválido "{${m}}" (use {a.X} ou {u.X} com X em: ${FORMAS.join(', ')})`);
}
const avisos = [];
for (const alvo of new Set(alvos)) {
  if (!testIds.has(alvo)) erros.push(`alvo "${alvo}" não existe como data-testid em nenhuma tela`);
}
for (const rota of rotasComTour) {
  if (!rotasExistentes.has(rota)) erros.push(`rota com tour "${rota}" não existe em App.tsx`);
}
for (const rota of new Set(rotasDeGuia)) {
  if (!rotasExistentes.has(rota)) erros.push(`rota de guia "${rota}" não existe em App.tsx`);
  else if (!rotasComTour.includes(rota)) avisos.push(`rota de guia "${rota}" não tem tour próprio`);
}

console.log(
  `Ajuda: ${new Set(alvos).size} alvos, ${rotasComTour.length} telas com tour, ${new Set(rotasDeGuia).size} rotas de guia e ${marcadores.length} marcadores verificados.`
);
for (const a of avisos) console.warn(`  aviso: ${a}`);
if (erros.length) {
  for (const e of erros) console.error(`  ERRO: ${e}`);
  process.exit(1);
}
console.log('Conteúdo da ajuda consistente com as telas.');
