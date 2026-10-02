import { db, runMigrations, withTransaction } from './index.js';
import { criarPrng } from './fake-data.js';
import { gerarComprovantesExemplo, NOMES_COMPROVANTES_EXEMPLO } from './comprovantes-exemplo.js';

// Histórico financeiro fictício (jan/2020 → set/2026) de um condomínio de 192 unidades.
// Determinístico (semente fixa) e idempotente: limpa e recria taxas, receitas e despesas.

// ---------- Parâmetros (ajuste aqui) ----------
const ANO_INICIAL = 2020;
const ULTIMO_MES = 80; // índice do último mês fechado: set/2026 (0 = jan/2020)
const HOJE = new Date(Date.UTC(2026, 8, 30)); // data de corte: em aberto "hoje"
const VENCIMENTO_DIA = 10;
const SEMENTE = 20260930;

// Taxa ordinária por apartamento (reajuste anual em janeiro, ~INPC; 2021 congelada na pandemia).
const TAXA_POR_ANO = { 2020: 230, 2021: 240, 2022: 265, 2023: 280, 2024: 295, 2025: 310, 2026: 325 };

// % de unidades em atraso no vencimento, por mês de referência (0 = jan/2020).
const TAXA_BASE_POR_ANO = { 2020: 7.5, 2021: 9, 2022: 8.5, 2023: 6, 2024: 5, 2025: 4.5, 2026: 5 };
const PANDEMIA_2020 = { 3: 9, 4: 11, 5: 13, 6: 14, 7: 14, 8: 12.5, 9: 12, 10: 11, 11: 10 }; // mês 0-based
const SAZONAL_PP = { 0: 2, 1: 1, 11: -1 }; // jan +2 p.p., fev +1, dez -1
const COBRANCA_JURIDICA = 32; // out/2022: assessoria jurídica reduz a inadimplência
const DEPOIS_COBRANCA = { 32: 7.5, 33: 7 };

// Pesos dos perfis ao sortear quem atrasa (pontual atrasa pouco, reincidente muito).
const PERFIS = { cronicos: 6, reincidentes: 17, eventuais: 54 }; // o resto é pontual
const PESO_PERFIL = { pontual: 0.15, eventual: 1, reincidente: 3 };

// Quanto tempo depois do vencimento o atraso termina (meses): [probabilidade acumulada, mín, máx]
const ATRASO_TERMINA = [
  [0.3, 0, 0], // paga no mesmo mês, depois do dia 10
  [0.6, 1, 1],
  [0.75, 2, 2],
  [0.92, 3, 6],
  [1, 7, 24], // acordo tardio
];

// Despesas mensais: percentual do faturamento (taxa × unidades).
const DESPESAS_MENSAIS = [
  { descricao: 'Folha de pagamento e encargos (portaria, zeladoria e limpeza)', peso: 0.51, dia: 5, sazonal: (mo) => (mo >= 10 ? 1.08 : 1) },
  { descricao: 'Água e esgoto (Cagece)', peso: 0.115, dia: 18, sazonal: (mo) => ([0, 1, 10, 11].includes(mo) ? 1.1 : 1) },
  { descricao: 'Energia elétrica das áreas comuns (Enel)', peso: 0.055, dia: 20, sazonal: (mo) => (mo >= 9 || mo <= 2 ? 1.08 : 1) },
  { descricao: 'Manutenção geral (elétrica, hidráulica, portões, interfone)', peso: 0.075, dia: 12, sazonal: () => 1 },
  { descricao: 'Material de limpeza, jardinagem e insumos', peso: 0.04, dia: 9, sazonal: () => 1 },
  { descricao: 'Administradora e contabilidade', peso: 0.03, dia: 7, sazonal: () => 1 },
  { descricao: 'Portaria remota, CFTV e monitoramento', peso: 0.03, dia: 15, sazonal: () => 1 },
  { descricao: 'Honorários advocatícios', peso: 0.006, dia: 25, sazonal: () => 1 },
  { descricao: 'Despesas diversas (correios, cartório, papelaria)', peso: 0.015, dia: 22, sazonal: () => 1 },
];

// Despesas pontuais: [índice do mês, descrição, valor em R$ de 2020, dia]
const m = (ano, mes) => (ano - ANO_INICIAL) * 12 + (mes - 1);
const DESPESAS_PONTUAIS = [
  ...[3, 4, 5, 6, 7].map((mes) => [m(2020, mes), 'Álcool em gel, EPIs e sanitização das áreas comuns', 1800, 14]),
  ...[3, 4, 5].map((mes, i) => [m(2022, mes), `Instalação de CFTV — parcela ${i + 1}/3`, 38000 / 3, 16, null, true]),
  ...[2, 3, 4, 5].map((mes, i) => [m(2023, mes), `Pintura dos 12 blocos — parcela ${i + 1}/4`, 140000 / 4, 14, null, true]),
  // O 5º item, quando existe, atribui a despesa a um bloco (texto) ou divide o valor entre vários ({bloco} na descrição).
  // O 6º item (true) marca a despesa como paga pelo fundo de reserva: as obras saem do fundo.
  [m(2024, 6), 'Troca de bombas d’água e reforma do reservatório — bloco 05', 18000, 11, '05', true],
  [m(2025, 3), 'Impermeabilização do telhado do bloco {bloco}', 22000, 13, ['03', '07'], true],
  [m(2025, 10), 'Reforma da quadra poliesportiva', 24000, 17, null, true],
  [m(2026, 4), 'Renovação do AVCB e recarga de extintores', 6000, 8],
];
// Recorrentes (mês 1-12): dedetização, caixa d’água, extintores, seguro predial (anual)
const DESPESAS_RECORRENTES = [
  { meses: [3, 9], descricao: 'Dedetização e desratização', valor: 2800, dia: 6 },
  { meses: [6, 12], descricao: 'Limpeza e desinfecção das caixas d’água', valor: 3500, dia: 10 },
  { meses: [10], descricao: 'Manutenção de extintores e hidrantes', valor: 1900, dia: 9 },
];
const SEGURO_PESO_ANUAL = 0.14; // % do faturamento anual (lançado em março)

// ---------- Utilidades ----------
const rand = criarPrng(SEMENTE);
const entre = (min, max) => min + Math.floor(rand() * (max - min + 1));
const arred = (v) => Math.round(v * 100) / 100;
const anoDe = (i) => ANO_INICIAL + Math.floor(i / 12);
const mesDe = (i) => (i % 12) + 1;
const iso = (ano, mes, dia) => `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
const dataDoMes = (i, dia) => iso(anoDe(i), mesDe(i), dia);
const diasEntre = (isoA, ref) => Math.max(0, Math.round((ref - new Date(`${isoA}T00:00:00Z`)) / 86400000));
const inflacao = (ano) => TAXA_POR_ANO[ano] / TAXA_POR_ANO[ANO_INICIAL];

function embaralhar(lista) {
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function taxaAtrasoAlvo(i) {
  const ano = anoDe(i);
  const mo = i % 12;
  let base = TAXA_BASE_POR_ANO[ano];
  if (ano === 2020 && PANDEMIA_2020[mo] != null) base = PANDEMIA_2020[mo];
  if (DEPOIS_COBRANCA[i] != null) base = DEPOIS_COBRANCA[i];
  return Math.max(1, base + (SAZONAL_PP[mo] ?? 0) + (rand() - 0.5));
}

// Parte dos atrasos da pandemia (abr–out/2020) nunca é regularizada: segue em cobrança.
const PANDEMIA_SEM_ACORDO = 0.2;

function sortearAtraso(i) {
  if (i >= 3 && i <= 9 && anoDe(i) === 2020 && rand() < PANDEMIA_SEM_ACORDO) return 999;
  const r = rand();
  const [, min, max] = ATRASO_TERMINA.find(([p]) => r <= p);
  return entre(min, max);
}

// ---------- Apartamentos e perfis ----------
runMigrations();

const apartamentos = db
  .prepare(
    `SELECT a.id FROM apartamentos a JOIN blocos b ON b.id = a.bloco_id ORDER BY b.numero, a.numero`
  )
  .all()
  .map((a) => a.id);
const unidades = apartamentos.length;

const ordem = embaralhar(apartamentos);
const cronicos = ordem.slice(0, PERFIS.cronicos);
const reincidentes = ordem.slice(PERFIS.cronicos, PERFIS.cronicos + PERFIS.reincidentes);
const eventuais = ordem.slice(
  PERFIS.cronicos + PERFIS.reincidentes,
  PERFIS.cronicos + PERFIS.reincidentes + PERFIS.eventuais
);
const pesoApto = new Map(apartamentos.map((id) => [id, PESO_PERFIL.pontual]));
for (const id of eventuais) pesoApto.set(id, PESO_PERFIL.eventual);
for (const id of reincidentes) pesoApto.set(id, PESO_PERFIL.reincidente);

// Episódios dos devedores crônicos: {s, e, fim: 'acordo' | 'aberto' | 'judicial'} (índices de mês)
const episodios = new Map(cronicos.map((id) => [id, []]));
const abertos = [[0, 11], [1, 7], [2, 5]]; // 3 devedores com dívida em aberto hoje (meses em atraso)
abertos.forEach(([k, tam]) =>
  episodios.get(cronicos[k]).push({ s: ULTIMO_MES - tam + 1, e: ULTIMO_MES, fim: 'aberto' })
);
episodios.get(cronicos[5]).push({ s: m(2022, 10), e: m(2022, 10) + 11, fim: 'judicial' });

function sobrepoe(lista, s, e) {
  return lista.some((ep) => s <= ep.e + 6 && e >= ep.s - 6);
}
cronicos.forEach((id, k) => {
  const lista = episodios.get(id);
  const quantos = k < 3 ? 1 : 2;
  for (let n = 0; n < quantos; n++) {
    for (let tentativa = 0; tentativa < 50; tentativa++) {
      const tam = entre(5, 14);
      const s = entre(0, 60 - tam);
      if (!sobrepoe(lista, s, s + tam - 1)) {
        lista.push({ s, e: s + tam - 1, fim: 'acordo' });
        break;
      }
    }
  }
});

// ---------- Taxas de condomínio ----------
// registro[apto][mes] = { dataPagamento|null, pagoNoMes (índice do mês do pagamento) }
const registro = new Map(apartamentos.map((id) => [id, new Array(ULTIMO_MES + 1).fill(null)]));
let atrasosNoVencimento = new Array(ULTIMO_MES + 1).fill(0);

function pagarEmDia(id, i) {
  registro.get(id)[i] = { data: dataDoMes(i, entre(1, VENCIMENTO_DIA)) };
}
function pagarEm(id, i, mesPag, dia) {
  const data = dataDoMes(mesPag, dia);
  registro.get(id)[i] = mesPag <= ULTIMO_MES && new Date(`${data}T00:00:00Z`) <= HOJE ? { data } : { data: null };
}

for (let i = 0; i <= ULTIMO_MES; i++) {
  const emEpisodio = new Set();
  for (const [id, lista] of episodios) {
    const ep = lista.find((x) => i >= x.s && i <= x.e);
    if (!ep) continue;
    emEpisodio.add(id);
    atrasosNoVencimento[i]++;
    if (ep.fim === 'acordo') pagarEm(id, i, ep.e + 1, entre(3, 25));
    else registro.get(id)[i] = { data: null };
  }

  const alvo = Math.round((taxaAtrasoAlvo(i) / 100) * unidades);
  let restantes = Math.max(0, alvo - emEpisodio.size);
  const candidatos = apartamentos.filter((id) => !emEpisodio.has(id) && !cronicos.includes(id));
  const sorteados = new Set();
  while (restantes > 0 && sorteados.size < candidatos.length) {
    const livres = candidatos.filter((id) => !sorteados.has(id));
    let total = livres.reduce((s, id) => s + pesoApto.get(id), 0);
    let r = rand() * total;
    for (const id of livres) {
      r -= pesoApto.get(id);
      if (r <= 0) { sorteados.add(id); break; }
    }
    restantes--;
  }
  atrasosNoVencimento[i] += sorteados.size;

  for (const id of apartamentos) {
    if (sorteados.has(id)) {
      const d = sortearAtraso(i);
      pagarEm(id, i, i + d, d === 0 ? entre(11, 28) : entre(1, 28));
    } else if (!emEpisodio.has(id)) {
      // Inclui quem está no episódio crônico fechado: já definido acima.
      pagarEmDia(id, i);
    }
  }
}

// Monta as linhas: juros por dias de atraso (multa 2% + juros 1% a.m. pro rata) e meses em atraso.
const linhasTaxas = [];
for (const id of apartamentos) {
  let sequencia = 0;
  for (let i = 0; i <= ULTIMO_MES; i++) {
    const ano = anoDe(i);
    const valor = TAXA_POR_ANO[ano];
    const vencimento = dataDoMes(i, VENCIMENTO_DIA);
    const { data } = registro.get(id)[i];
    const ref = data ? new Date(`${data}T00:00:00Z`) : HOJE;
    const dias = diasEntre(vencimento, ref);
    const juros = dias > 0 ? arred(valor * (0.02 + (0.01 * dias) / 30)) : 0;
    sequencia = data ? 0 : sequencia + 1;
    linhasTaxas.push({
      apartamento_id: id,
      mes_referencia: mesDe(i),
      ano_referencia: ano,
      valor,
      juros,
      data_pagamento: data,
      situacao: data ? 'adimplente' : 'inadimplente',
      meses_atraso: data ? 0 : sequencia,
      comprovante_path: null, // preenchido na gravação, só para taxas pagas
    });
  }
}

// ---------- Despesas e outras receitas ----------
const despesas = [];
const receitas = [];
for (let i = 0; i <= ULTIMO_MES; i++) {
  const ano = anoDe(i);
  const mes = mesDe(i);
  const mo = i % 12;
  const faturamento = TAXA_POR_ANO[ano] * unidades;
  const anoFator = (cat) => 1 + ((cat.descricao.length * 7 + ano * 13) % 9 - 4) / 100; // ±4% por ano

  for (const cat of DESPESAS_MENSAIS) {
    let peso = cat.peso;
    if (cat.descricao === 'Honorários advocatícios') peso = i >= COBRANCA_JURIDICA ? 0.014 : 0.006;
    let fator = cat.sazonal(mo) * anoFator(cat) * (0.94 + rand() * 0.12);
    if (ano === 2020 && mes >= 4 && mes <= 7 && /Manutenção geral/.test(cat.descricao)) fator *= 0.6;
    if (ano === 2021 && mes >= 7 && /Energia/.test(cat.descricao)) fator *= 1.2; // bandeira vermelha
    despesas.push([cat.descricao, arred(faturamento * peso * fator), dataDoMes(i, cat.dia + entre(-2, 2))]);
  }
  for (const rec of DESPESAS_RECORRENTES) {
    if (rec.meses.includes(mes)) {
      despesas.push([rec.descricao, arred(rec.valor * inflacao(ano) * (0.92 + rand() * 0.16)), dataDoMes(i, rec.dia)]);
    }
  }
  if (mes === 3) {
    despesas.push(['Seguro predial anual', arred(faturamento * SEGURO_PESO_ANUAL * (0.95 + rand() * 0.1)), dataDoMes(i, 20)]);
  }
  for (const [idx, descricao, valor, dia, blocos, fundo = false] of DESPESAS_PONTUAIS) {
    if (idx !== i) continue;
    const total = arred(valor * inflacao(ano));
    const data = dataDoMes(i, dia);
    if (Array.isArray(blocos)) {
      // Divide o total entre os blocos sem perder centavos: o último fica com o resto.
      let restante = total;
      blocos.forEach((bloco, k) => {
        const parte = k === blocos.length - 1 ? restante : arred(total / blocos.length);
        restante = arred(restante - parte);
        despesas.push([descricao.replace('{bloco}', bloco), parte, data, bloco, fundo]);
      });
    } else {
      despesas.push([descricao, total, data, blocos ?? null, fundo]);
    }
  }

  // Receitas
  const precoSalao = [150, 150, 180, 200, 220, 240, 250][ano - ANO_INICIAL];
  let eventos = entre(2, 6) + (mes === 7 || mes === 12 ? 2 : 0);
  if (ano === 2020 && mes >= 4 && mes <= 8) eventos = 0;
  else if (ano === 2020 && mes >= 9) eventos = Math.min(eventos, mes === 12 ? 3 : 1);
  for (let e = 0; e < eventos; e++) {
    receitas.push(['Aluguel do salão de festas', precoSalao, dataDoMes(i, entre(1, 28))]);
  }
  receitas.push(['Rendimentos do fundo de reserva (CDB)', arred(faturamento * (0.012 + rand() * 0.006)), dataDoMes(i, 28)]);
  receitas.push(['Venda de material reciclável', arred((80 + rand() * 120) * inflacao(ano)), dataDoMes(i, entre(5, 25))]);
  for (let n = entre(0, 2); n > 0; n--) {
    receitas.push(['Multa por infração ao regimento interno', arred(TAXA_POR_ANO[ano] * (0.5 + rand())), dataDoMes(i, entre(1, 28))]);
  }
  for (let n = entre(0, 2); n > 0; n--) {
    receitas.push(['Taxa de mudança / uso de área comum', arred(120 * inflacao(ano)), dataDoMes(i, entre(1, 28))]);
  }
  if (mes === 6) receitas.push(['Festa junina — arrecadação', arred((3200 + rand() * 1800) * inflacao(ano)), dataDoMes(i, 27)]);
  if (mes === 12) receitas.push(['Bingo de fim de ano — arrecadação', arred((2500 + rand() * 1500) * inflacao(ano)), dataDoMes(i, 18)]);
}
if (anoDe(0) === 2020) {
  // A festa junina e o bingo não aconteceram em 2020 (pandemia).
  const bloqueadas = ['Festa junina — arrecadação', 'Bingo de fim de ano — arrecadação'];
  for (let k = receitas.length - 1; k >= 0; k--) {
    if (bloqueadas.includes(receitas[k][0]) && receitas[k][2].startsWith('2020')) receitas.splice(k, 1);
  }
}

// ---------- Gravação ----------
const insertTaxa = db.prepare(`
  INSERT INTO taxas_condominio
    (apartamento_id, mes_referencia, ano_referencia, valor, juros, data_pagamento, situacao, meses_atraso, comprovante_path)
  VALUES (@apartamento_id, @mes_referencia, @ano_referencia, @valor, @juros, @data_pagamento, @situacao, @meses_atraso, @comprovante_path)
`);
const insertReceita = db.prepare('INSERT INTO outras_receitas (descricao, valor, data, comprovante_path) VALUES (?, ?, ?, ?)');
const insertDespesa = db.prepare('INSERT INTO despesas (descricao, valor, data, comprovante_path, bloco_id, fundo_reserva) VALUES (?, ?, ?, ?, ?, ?)');
const idDoBloco = new Map(db.prepare('SELECT numero, id FROM blocos').all().map((b) => [b.numero, b.id]));

// Comprovantes de exemplo: parte dos lançamentos aponta para um dos modelos gerados (PDF ou JPEG).
// Escolha por posição (não usa o gerador aleatório), então não altera os valores já sorteados.
gerarComprovantesExemplo();
const comprovanteDe = (tipo, indice, percentual) =>
  (indice * 37) % 100 < percentual
    ? NOMES_COMPROVANTES_EXEMPLO[tipo][indice % NOMES_COMPROVANTES_EXEMPLO[tipo].length]
    : null;

withTransaction(() => {
  db.exec('DELETE FROM auditoria'); // o histórico se refere às taxas e lançamentos que este seed recria
  // O condomínio já tinha R$ 50 mil no fundo de reserva antes de jan/2020 (sem isso o fundo ficaria negativo na pintura de 2023).
  db.prepare('UPDATE configuracao_financeira SET fundo_saldo_inicial = ? WHERE id = 1').run(50000);
  db.exec('DELETE FROM taxa_padrao');
  // Valor da taxa por ano (Configurações financeiras). Multa 2%, juros 1% a.m. e vencimento dia 10 são o padrão da tabela.
  for (const [ano, valor] of Object.entries(TAXA_POR_ANO)) {
    db.prepare('INSERT INTO taxa_padrao (ano, valor) VALUES (?, ?) ON CONFLICT(ano) DO UPDATE SET valor = excluded.valor')
      .run(Number(ano), valor);
  }
  db.exec('DELETE FROM taxas_condominio');
  db.exec('DELETE FROM outras_receitas');
  db.exec('DELETE FROM despesas');
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('taxas_condominio','outras_receitas','despesas','auditoria')");
  linhasTaxas.forEach((l, i) =>
    insertTaxa.run({ ...l, comprovante_path: l.situacao === 'adimplente' ? comprovanteDe('taxa', i, 60) : null })
  );
  receitas.forEach((r, i) => insertReceita.run(...r, comprovanteDe('receita', i, 80)));
  despesas.forEach(([descricao, valor, data, bloco = null, fundo = false], i) =>
    insertDespesa.run(descricao, valor, data, comprovanteDe('despesa', i, 90), bloco ? idDoBloco.get(bloco) : null, fundo ? 1 : 0)
  );
});

// ---------- Resumo ----------
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
console.log(`Financeiro populado: ${linhasTaxas.length} taxas, ${receitas.length} receitas, ${despesas.length} despesas.`);
console.log('Ano   Faturamento   Atraso no venc.   Em aberto hoje   Receitas       Despesas       Saldo');
for (let ano = ANO_INICIAL; ano <= 2026; ano++) {
  const meses = [...Array(ULTIMO_MES + 1).keys()].filter((i) => anoDe(i) === ano);
  const linhas = linhasTaxas.filter((l) => l.ano_referencia === ano);
  const fat = linhas.reduce((s, l) => s + l.valor, 0);
  const aberto = linhas.filter((l) => l.situacao === 'inadimplente');
  const rec =
    linhas.filter((l) => l.situacao === 'adimplente').reduce((s, l) => s + l.valor + l.juros, 0) +
    receitas.filter((r) => r[2].startsWith(String(ano))).reduce((s, r) => s + r[1], 0);
  const desp = despesas.filter((d) => d[2].startsWith(String(ano))).reduce((s, d) => s + d[1], 0);
  const pctAtraso = (meses.reduce((s, i) => s + atrasosNoVencimento[i], 0) / (meses.length * unidades)) * 100;
  console.log(
    `${ano}  ${brl(fat).padStart(11)}   ${pctAtraso.toFixed(1).padStart(10)}%   ${((aberto.length / linhas.length) * 100).toFixed(1).padStart(10)}%   ${brl(rec).padStart(11)}   ${brl(desp).padStart(11)}   ${brl(rec - desp).padStart(10)}`
  );
}
