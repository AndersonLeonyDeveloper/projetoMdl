import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { COMPROVANTES_DIR } from '../utils/comprovantes.js';

// Gera os comprovantes fictícios usados pelo seed financeiro: 2 modelos (PDF e JPEG) por tipo
// de lançamento. Determinístico e idempotente: sobrescreve os arquivos "exemplo-*" a cada execução.
// Sem dependências além do jpeg-js — o PDF é montado à mão (uma página, Helvetica).

export const TIPOS_COMPROVANTE = {
  taxa: { titulo: 'Comprovante de pagamento de taxa', cor: [37, 99, 235] },
  receita: { titulo: 'Recibo de receita', cor: [22, 163, 74] },
  despesa: { titulo: 'Nota de despesa', cor: [220, 38, 38] },
};
const VARIACOES = [
  { sufixo: '1', valor: 325.0, favorecido: 'Condomínio Morada da Lagoa' },
  { sufixo: '2', valor: 1480.75, favorecido: 'Fornecedor Exemplo Ltda.' },
];

export const NOMES_COMPROVANTES_EXEMPLO = Object.fromEntries(
  Object.keys(TIPOS_COMPROVANTE).map((tipo) => [
    tipo,
    VARIACOES.flatMap((v) => [`exemplo-${tipo}-${v.sufixo}.pdf`, `exemplo-${tipo}-${v.sufixo}.jpg`]),
  ])
);

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

// ---------- PDF ----------
function pdfString(texto) {
  // WinAnsi ≈ latin1: acentos do português viram um byte; só escapamos ( ) \.
  return `(${texto.replace(/[\\()]/g, '\\$&')})`;
}

function montarPdf(linhas) {
  const conteudo = linhas
    .map(([texto, tamanho, y]) => `BT /F1 ${tamanho} Tf 50 ${y} Td ${pdfString(texto)} Tj ET`)
    .join('\n');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objetos.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function pdfDe(tipo, variacao) {
  return montarPdf([
    [TIPOS_COMPROVANTE[tipo].titulo, 18, 250],
    ['DOCUMENTO DE EXEMPLO', 11, 230],
    [`Favorecido: ${variacao.favorecido}`, 12, 190],
    [`Valor: ${brl(variacao.valor)}`, 12, 170],
    [`Autenticação: EXEMPLO-${tipo.toUpperCase()}-${variacao.sufixo}`, 12, 150],
    ['Documento fictício gerado para demonstração, sem valor fiscal.', 9, 40],
  ]);
}

// ---------- JPEG ----------
// Fonte 5x7 só com os glifos necessários.
const FONTE = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  C: '01110 10001 10000 10000 10000 10001 01110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  R: '11110 10001 10001 11110 10100 10010 10001',
  T: '11111 00100 00100 00100 00100 00100 00100',
  V: '10001 10001 10001 10001 10001 01010 00100',
  X: '10001 10001 01010 00100 01010 10001 10001',
  0: '01110 10001 10011 10101 11001 10001 01110',
  1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111',
  3: '11110 00001 00001 01110 00001 00001 11110',
  4: '00010 00110 01010 10010 11111 00010 00010',
  5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110',
  7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100',
  $: '00100 01111 10100 01110 00101 11110 00100',
  ',': '00000 00000 00000 00000 01100 00100 01000',
};

function jpegDe(tipo, variacao) {
  const largura = 600;
  const altura = 400;
  const dados = Buffer.alloc(largura * altura * 4);
  const retangulo = (x0, y0, w, h, [r, g, b]) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const p = (y * largura + x) * 4;
        dados[p] = r; dados[p + 1] = g; dados[p + 2] = b; dados[p + 3] = 255;
      }
    }
  };
  const texto = (str, x, y, escala, cor) => {
    [...str].forEach((ch, i) => {
      const glifo = FONTE[ch];
      if (!glifo) return; // espaço
      glifo.split(' ').forEach((linha, ly) => {
        [...linha].forEach((bit, lx) => {
          if (bit === '1') retangulo(x + (i * 6 + lx) * escala, y + ly * escala, escala, escala, cor);
        });
      });
    });
  };

  retangulo(0, 0, largura, altura, [245, 242, 232]); // papel
  retangulo(0, 0, largura, 90, TIPOS_COMPROVANTE[tipo].cor);
  texto('COMPROVANTE', 30, 28, 6, [255, 255, 255]);
  texto('EXEMPLO', 30, 120, 4, [90, 90, 90]);
  [170, 200, 230].forEach((y, i) => retangulo(30, y, 360 - i * 70, 10, [200, 200, 195])); // "linhas de texto"
  texto(`R$ ${variacao.valor.toFixed(2).replace('.', ',')}`, 30, 290, 8, [30, 30, 30]);
  retangulo(30, 360, 540, 2, [160, 160, 155]);

  return jpeg.encode({ data: dados, width: largura, height: altura }, 85).data;
}

// ---------- Geração ----------
export function gerarComprovantesExemplo() {
  fs.mkdirSync(COMPROVANTES_DIR, { recursive: true });
  for (const tipo of Object.keys(TIPOS_COMPROVANTE)) {
    for (const variacao of VARIACOES) {
      fs.writeFileSync(path.join(COMPROVANTES_DIR, `exemplo-${tipo}-${variacao.sufixo}.pdf`), pdfDe(tipo, variacao));
      fs.writeFileSync(path.join(COMPROVANTES_DIR, `exemplo-${tipo}-${variacao.sufixo}.jpg`), jpegDe(tipo, variacao));
    }
  }
  return Object.values(NOMES_COMPROVANTES_EXEMPLO).flat();
}

// Execução direta: npm run db:comprovantes
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arquivos = gerarComprovantesExemplo();
  console.log(`${arquivos.length} comprovantes de exemplo gerados em ${COMPROVANTES_DIR}`);
}
