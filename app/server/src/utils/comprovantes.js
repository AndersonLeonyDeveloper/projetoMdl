import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { DATA_DIR } from '../db/index.js';

export const COMPROVANTES_DIR = path.join(DATA_DIR, 'comprovantes');
export const TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5 MB

const TIPOS = {
  pdf: { mime: 'application/pdf', assinatura: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  jpg: { mime: 'image/jpeg', assinatura: [0xff, 0xd8, 0xff] },
  png: { mime: 'image/png', assinatura: [0x89, 0x50, 0x4e, 0x47] },
};
const EXTENSAO_POR_MIME = Object.fromEntries(Object.entries(TIPOS).map(([ext, t]) => [t.mime, ext]));
export const MIME_POR_EXTENSAO = Object.fromEntries(Object.entries(TIPOS).map(([ext, t]) => [ext, t.mime]));

// Mantém o arquivo em memória: só vai para o disco depois de validado.
const multerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO, files: 1 } });

// Aceita multipart (com campo opcional "comprovante") ou JSON, sem mudar o contrato antigo.
export function uploadComprovante(req, res, next) {
  multerUpload.single('comprovante')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'O comprovante deve ter no máximo 5 MB.' });
    }
    return res.status(400).json({ error: 'Não foi possível ler o comprovante enviado.' });
  });
}

// Valida tipo (mime + conteúdo real) e grava com nome gerado pelo servidor.
// Retorna { nome } (ou { nome: null } se não houve arquivo) ou { erro }.
export function salvarComprovante(file) {
  if (!file) return { nome: null };
  const extensao = EXTENSAO_POR_MIME[file.mimetype];
  const assinatura = extensao && TIPOS[extensao].assinatura;
  if (!assinatura || !assinatura.every((byte, i) => file.buffer[i] === byte)) {
    return { erro: 'O comprovante deve ser um arquivo PDF, JPEG ou PNG válido.' };
  }
  fs.mkdirSync(COMPROVANTES_DIR, { recursive: true });
  const nome = `${crypto.randomUUID()}.${extensao}`;
  fs.writeFileSync(path.join(COMPROVANTES_DIR, nome), file.buffer);
  return { nome };
}

// Apaga o arquivo de um comprovante substituído ou removido. Os modelos "exemplo-*" do seed são
// compartilhados entre vários lançamentos e nunca são apagados.
export function apagarComprovante(nome) {
  if (!nome || nome.startsWith('exemplo-') || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(nome)) return;
  fs.rmSync(path.join(COMPROVANTES_DIR, nome), { force: true });
}
