// Estrutura do condomínio (agrupadores e unidades): validação da configuração e geração dos números.
// Funções puras, sem acesso ao banco — usadas pelo assistente de primeiro acesso, pela prévia e pelos seeds.

export const LIMITES = { agrupadores: 200, andares: 100, unidadesPorAndar: 200, totalDeUnidades: 10000 };
export const FORMATOS_NUMERACAO = ['andar_sequencia', 'sequencia'];

export const NOME_PADRAO = 'Condomínio';
// Estrutura de demonstração (db:populate): o condomínio fictício do projeto.
export const CONFIG_PADRAO = {
  nome: 'Morada da Lagoa',
  agrupador_singular: 'Bloco', agrupador_plural: 'Blocos', agrupador_genero: 'm', agrupador_abrev: 'Bl.',
  unidade_singular: 'Apartamento', unidade_plural: 'Apartamentos', unidade_genero: 'm', unidade_abrev: 'Ap.',
  tem_terreo: 1, rotulo_terreo: 'Térreo', sem_andares: 0, andares: 3, unidades_por_andar: 4,
  formato_numeracao: 'andar_sequencia',
};
export const AGRUPADORES_PADRAO = 12;

const pad = (n, largura) => String(n).padStart(largura, '0');
const inteiro = (v) => (Number.isInteger(Number(v)) && v !== '' && v !== null ? Number(v) : NaN);

const TAMANHOS = {
  nome: 80, agrupador_singular: 30, agrupador_plural: 30, agrupador_abrev: 6,
  unidade_singular: 30, unidade_plural: 30, unidade_abrev: 6, rotulo_terreo: 30,
};

// Rótulos (nomes exibidos): aceitos tanto no primeiro acesso quanto na edição posterior.
// Plural e abreviação, quando não informados, são deduzidos do singular.
export function validarRotulos(corpo = {}) {
  for (const [campo, max] of Object.entries(TAMANHOS)) {
    if (String(corpo[campo] ?? '').trim().length > max) {
      return { erro: `O campo "${campo}" deve ter no máximo ${max} caracteres.` };
    }
  }
  const texto = (campo, padrao) => String(corpo[campo] ?? '').trim() || padrao;
  const c = {
    nome: texto('nome', NOME_PADRAO),
    agrupador_singular: texto('agrupador_singular', CONFIG_PADRAO.agrupador_singular),
    unidade_singular: texto('unidade_singular', CONFIG_PADRAO.unidade_singular),
    agrupador_genero: corpo.agrupador_genero ?? CONFIG_PADRAO.agrupador_genero,
    unidade_genero: corpo.unidade_genero ?? CONFIG_PADRAO.unidade_genero,
    rotulo_terreo: texto('rotulo_terreo', CONFIG_PADRAO.rotulo_terreo),
  };
  if (!['m', 'f'].includes(c.agrupador_genero) || !['m', 'f'].includes(c.unidade_genero)) {
    return { erro: 'O gênero deve ser "m" (masculino) ou "f" (feminino).' };
  }
  c.agrupador_plural = texto('agrupador_plural', `${c.agrupador_singular}s`);
  c.unidade_plural = texto('unidade_plural', `${c.unidade_singular}s`);
  c.agrupador_abrev = texto('agrupador_abrev', `${c.agrupador_singular.slice(0, 2)}.`);
  c.unidade_abrev = texto('unidade_abrev', `${c.unidade_singular.slice(0, 2)}.`);
  return { rotulos: c };
}

// Configuração completa do primeiro acesso: rótulos + geometria. Retorna { config, agrupadores } ou { erro }.
export function validarConfiguracao(corpo = {}) {
  const { rotulos, erro } = validarRotulos(corpo);
  if (erro) return { erro };

  const semAndares = corpo.sem_andares === true || corpo.sem_andares === 1 || corpo.sem_andares === '1';
  const temTerreo = !semAndares && (corpo.tem_terreo === true || corpo.tem_terreo === 1 || corpo.tem_terreo === '1');
  const agrupadores = inteiro(corpo.agrupadores);
  const andares = semAndares ? 0 : inteiro(corpo.andares ?? 0);
  const porAndar = inteiro(corpo.unidades_por_andar);
  const formato = corpo.formato_numeracao ?? 'andar_sequencia';

  if (!(agrupadores >= 1 && agrupadores <= LIMITES.agrupadores)) {
    return { erro: `A quantidade de ${rotulos.agrupador_plural.toLowerCase()} deve ser de 1 a ${LIMITES.agrupadores}.` };
  }
  if (!semAndares && !(andares >= 0 && andares <= LIMITES.andares)) {
    return { erro: `A quantidade de andares deve ser de 0 a ${LIMITES.andares}.` };
  }
  if (!semAndares && andares + (temTerreo ? 1 : 0) < 1) {
    return { erro: 'Informe ao menos um andar (ou marque que existe térreo com unidades).' };
  }
  if (!(porAndar >= 1 && porAndar <= LIMITES.unidadesPorAndar)) {
    return { erro: `A quantidade por ${semAndares ? rotulos.agrupador_singular.toLowerCase() : 'andar'} deve ser de 1 a ${LIMITES.unidadesPorAndar}.` };
  }
  if (!FORMATOS_NUMERACAO.includes(formato)) {
    return { erro: 'Formato de numeração inválido.' };
  }
  const config = {
    ...rotulos,
    tem_terreo: temTerreo ? 1 : 0,
    sem_andares: semAndares ? 1 : 0,
    andares,
    unidades_por_andar: porAndar,
    formato_numeracao: formato,
  };
  const total = agrupadores * contarUnidadesPorAgrupador(config);
  if (total > LIMITES.totalDeUnidades) {
    return { erro: `A estrutura teria ${total} unidades; o máximo é ${LIMITES.totalDeUnidades}.` };
  }
  return { config, agrupadores };
}

export function contarUnidadesPorAgrupador(config) {
  if (config.sem_andares) return config.unidades_por_andar;
  return (config.andares + (config.tem_terreo ? 1 : 0)) * config.unidades_por_andar;
}

// Números dos agrupadores: "01".."N" (largura mínima 2, como os blocos originais).
export function numerosDosAgrupadores(quantidade) {
  const largura = Math.max(2, String(quantidade).length);
  return Array.from({ length: quantidade }, (_, i) => pad(i + 1, largura));
}

// Unidades de UM agrupador, na ordem de exibição: [{ numero, andar, rotuloAndar }].
//  - andar_sequencia: térreo "01".."0U" (sem o dígito do andar) e andar k como `${k}${sequência}` (101, 102, 201…).
//  - sequencia: numeração contínua "01".."NN" dentro do agrupador, independente do andar.
//  - sem_andares: "01".."U", sem andar (condomínio horizontal).
export function unidadesDoAgrupador(config) {
  const u = config.unidades_por_andar;
  const largura = Math.max(2, String(u).length);
  if (config.sem_andares) {
    const larguraTotal = Math.max(2, String(u).length);
    return Array.from({ length: u }, (_, i) => ({ numero: pad(i + 1, larguraTotal), andar: null, rotuloAndar: null }));
  }
  const andares = [];
  if (config.tem_terreo) andares.push(0);
  for (let k = 1; k <= config.andares; k++) andares.push(k);
  const total = andares.length * u;
  const larguraTotal = Math.max(2, String(total).length);
  const unidades = [];
  let contador = 0;
  for (const andar of andares) {
    for (let n = 1; n <= u; n++) {
      contador += 1;
      const numero =
        config.formato_numeracao === 'sequencia'
          ? pad(contador, larguraTotal)
          : andar === 0 ? pad(n, largura) : `${andar}${pad(n, largura)}`;
      unidades.push({ numero, andar, rotuloAndar: andar === 0 ? config.rotulo_terreo : `${andar}º andar` });
    }
  }
  return unidades;
}

// Plano completo (para gravar) e resumo (para a prévia mostrada ao administrador).
export function planejar(config, agrupadores) {
  const unidades = unidadesDoAgrupador(config);
  return { agrupadores: numerosDosAgrupadores(agrupadores), unidades };
}

export function previa(config, agrupadores) {
  const { agrupadores: numeros, unidades } = planejar(config, agrupadores);
  const porAndar = new Map();
  for (const un of unidades) {
    const chave = un.rotuloAndar ?? '';
    if (!porAndar.has(chave)) porAndar.set(chave, []);
    porAndar.get(chave).push(un.numero);
  }
  return {
    agrupadores: numeros.length,
    unidades_por_agrupador: unidades.length,
    total_de_unidades: numeros.length * unidades.length,
    exemplo_agrupadores: numeros.slice(0, 5),
    exemplo_andares: [...porAndar.entries()].slice(0, 6).map(([andar, numeros]) => ({ andar: andar || null, numeros: numeros.slice(0, 8) })),
  };
}
