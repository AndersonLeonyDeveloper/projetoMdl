import { db, withTransaction } from './index.js';
import { AGRUPADORES_PADRAO, CONFIG_PADRAO, planejar } from '../utils/estrutura.js';

export const lerCondominio = () => db.prepare('SELECT * FROM condominio_config WHERE id = 1').get();

export const estruturaConfigurada = () => Boolean(lerCondominio()?.setup_concluido);

const COLUNAS_ROTULOS = [
  'nome', 'agrupador_singular', 'agrupador_plural', 'agrupador_genero', 'agrupador_abrev',
  'unidade_singular', 'unidade_plural', 'unidade_genero', 'unidade_abrev', 'rotulo_terreo',
];
const COLUNAS_GEOMETRIA = ['tem_terreo', 'sem_andares', 'andares', 'unidades_por_andar', 'formato_numeracao'];

export function gravarRotulos(rotulos) {
  const sets = COLUNAS_ROTULOS.map((c) => `${c} = @${c}`).join(', ');
  db.prepare(`UPDATE condominio_config SET ${sets} WHERE id = 1`).run(
    Object.fromEntries(COLUNAS_ROTULOS.map((c) => [c, rotulos[c]]))
  );
}

// Grava a configuração e cria agrupadores e unidades. Só vale para um condomínio ainda não configurado.
export function aplicarEstrutura(config, agrupadores) {
  const plano = planejar(config, agrupadores);
  const inserirAgrupador = db.prepare('INSERT INTO blocos (numero, ordem) VALUES (?, ?)');
  const inserirUnidade = db.prepare('INSERT INTO apartamentos (bloco_id, numero, andar, ordem) VALUES (?, ?, ?, ?)');
  withTransaction(() => {
    const colunas = [...COLUNAS_ROTULOS, ...COLUNAS_GEOMETRIA];
    const sets = [...colunas.map((c) => `${c} = @${c}`), 'setup_concluido = 1'].join(', ');
    db.prepare(`UPDATE condominio_config SET ${sets} WHERE id = 1`).run(
      Object.fromEntries(colunas.map((c) => [c, config[c]]))
    );
    plano.agrupadores.forEach((numero, i) => {
      const id = inserirAgrupador.run(numero, i + 1).lastInsertRowid;
      plano.unidades.forEach((un, j) => inserirUnidade.run(id, un.numero, un.andar, j + 1));
    });
  });
  return { agrupadores: plano.agrupadores.length, unidades: plano.agrupadores.length * plano.unidades.length };
}

// Estrutura de demonstração (a mesma de antes do assistente): 12 blocos, térreo + 3 andares, 4 apartamentos por andar.
// Usada pelos scripts de banco (reset, seeds); não faz nada se o condomínio já estiver configurado.
export function aplicarEstruturaPadrao() {
  if (estruturaConfigurada()) return false;
  aplicarEstrutura(CONFIG_PADRAO, AGRUPADORES_PADRAO);
  return true;
}

// Os seeds de demonstração citam blocos e apartamentos específicos (Bl.08/203, Bl.07/301...). Com outra estrutura
// eles não têm onde se apoiar: para em vez de quebrar no meio.
export function exigirEstruturaDeDemonstracao() {
  const faltando = [['08', '203'], ['08', '301'], ['07', '301'], ['09', '204'], ['09', '101'], ['08', '101'], ['01', '01'], ['02', '01'], ['03', '01'], ['05', '01']].filter(
    ([b, a]) => !db.prepare('SELECT 1 FROM apartamentos a JOIN blocos b ON b.id = a.bloco_id WHERE b.numero = ? AND a.numero = ?').get(b, a)
  );
  if (faltando.length) {
    console.error(
      'Estes seeds foram feitos para a estrutura de demonstração (12 blocos de 16 apartamentos, térreo + 3 andares).\n' +
      'O banco atual tem outra estrutura. Para gerar os dados de demonstração, apague o arquivo do banco e rode\n' +
      'novamente: a estrutura padrão é criada automaticamente.'
    );
    process.exit(1);
  }
}
