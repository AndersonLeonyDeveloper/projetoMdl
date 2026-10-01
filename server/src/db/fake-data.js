// Geração de dados fictícios determinísticos (mesma semente => mesmo resultado).

const PRIMEIROS_NOMES = [
  'Bryan', 'Melissa', 'Jason', 'Ashley', 'Brandon', 'Jessica', 'Tyler', 'Amanda', 'Kevin', 'Brittany',
  'Justin', 'Samantha', 'Austin', 'Rachel', 'Dylan', 'Megan', 'Ethan', 'Lauren', 'Logan', 'Hannah',
  'Caleb', 'Olivia', 'Mason', 'Emily', 'Connor', 'Chloe', 'Hunter', 'Natalie', 'Carter', 'Abigail',
  'Wyatt', 'Madison', 'Jackson', 'Kayla', 'Lucas', 'Sophia', 'Owen', 'Grace', 'Gavin', 'Victoria',
  'Nolan', 'Savannah', 'Blake', 'Paige', 'Trevor', 'Courtney', 'Garrett', 'Heather', 'Colton', 'Allison',
  'Ryan', 'Brooke', 'Derek', 'Claire', 'Travis', 'Vanessa', 'Spencer', 'Holly', 'Dustin', 'Tiffany'
];

const SOBRENOMES = [
  'Smith', 'Oxford', 'Johnson', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore',
  'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Hill', 'Green', 'Adams', 'Baker', 'Nelson',
  'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards',
  'Collins', 'Stewart', 'Morris', 'Murphy', 'Cook', 'Rogers', 'Morgan', 'Cooper', 'Peterson', 'Reed',
  'Bailey', 'Bell', 'Kelly', 'Howard', 'Ward', 'Cox', 'Richardson', 'Wood', 'Watson', 'Brooks'
];

// mulberry32: PRNG pequeno e determinístico.
function criarPrng(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar(lista, rand) {
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function digitoCpf(digitos) {
  const peso = digitos.length + 1;
  const soma = digitos.reduce((acc, d, i) => acc + d * (peso - i), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

function gerarCpf(rand) {
  const base = Array.from({ length: 9 }, () => Math.floor(rand() * 10));
  const d1 = digitoCpf(base);
  const d2 = digitoCpf([...base, d1]);
  const n = [...base, d1, d2].join('');
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
}

function gerarTelefone(rand) {
  const num = String(Math.floor(rand() * 1e8)).padStart(8, '0');
  return `(85) 9${num.slice(0, 4)}-${num.slice(4)}`;
}

/**
 * Gera `quantidade` pessoas fictícias com nome completo, e-mail, telefone e CPF únicos.
 * Lança erro se `quantidade` exceder as combinações nome × sobrenome disponíveis.
 */
export function gerarPessoasUnicas(quantidade, { semente = 2026, emailsReservados = [] } = {}) {
  const total = PRIMEIROS_NOMES.length * SOBRENOMES.length;
  if (quantidade > total) {
    throw new Error(`Só há ${total} combinações de nome disponíveis (pedido: ${quantidade}).`);
  }
  const rand = criarPrng(semente);
  const combinacoes = embaralhar(
    PRIMEIROS_NOMES.flatMap((p) => SOBRENOMES.map((s) => [p, s])),
    rand
  ).slice(0, quantidade);

  const emails = new Set(emailsReservados.map((e) => e.toLowerCase()));
  const cpfs = new Set();
  const telefones = new Set();

  return combinacoes.map(([primeiro, sobrenome]) => {
    const email = `${primeiro}.${sobrenome}@example.com`.toLowerCase();
    if (emails.has(email)) throw new Error(`E-mail duplicado: ${email}`);
    emails.add(email);

    let cpf;
    do cpf = gerarCpf(rand); while (cpfs.has(cpf));
    cpfs.add(cpf);

    let telefone;
    do telefone = gerarTelefone(rand); while (telefones.has(telefone));
    telefones.add(telefone);

    return { nome: `${primeiro} ${sobrenome}`, email, telefone, cpf };
  });
}
