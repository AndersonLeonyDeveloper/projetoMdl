import bcrypt from 'bcryptjs';
import { db, isUniqueConstraintError } from '../db/index.js';

// Contas de administrador: regras compartilhadas pela API (routes/administradores.routes.js) e pelo script de linha de
// comando (db/admin.js). Cada função devolve { erro, status } quando recusa, ou o resultado quando dá certo.

export const TAMANHO_MINIMO_DA_SENHA = 6;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizarEmail = (email) => String(email ?? '').trim().toLowerCase();

export function validarSenha(senha) {
  return String(senha ?? '').length >= TAMANHO_MINIMO_DA_SENHA
    ? null
    : `A senha deve ter ao menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`;
}

export const listarAdmins = () =>
  db.prepare("SELECT id, email, ativo, created_at FROM usuarios WHERE role = 'admin' ORDER BY id").all();

export const buscarAdmin = (id) => db.prepare("SELECT * FROM usuarios WHERE id = ? AND role = 'admin'").get(id);
export const buscarAdminPorEmail = (email) =>
  db.prepare("SELECT * FROM usuarios WHERE email = ? AND role = 'admin'").get(normalizarEmail(email));

const adminsAtivos = () => db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE role = 'admin' AND ativo = 1").get().n;

export function criarAdmin(email, senha) {
  const e = normalizarEmail(email);
  if (!EMAIL_VALIDO.test(e) || e.length > 120) return { erro: 'Informe um e-mail válido.', status: 400 };
  const erroSenha = validarSenha(senha);
  if (erroSenha) return { erro: erroSenha, status: 400 };
  try {
    const info = db
      .prepare("INSERT INTO usuarios (email, senha_hash, role, pessoa_id) VALUES (?, ?, 'admin', NULL)")
      .run(e, bcrypt.hashSync(String(senha), 10));
    return { id: Number(info.lastInsertRowid), email: e };
  } catch (err) {
    if (isUniqueConstraintError(err)) return { erro: 'Já existe um usuário com esse e-mail.', status: 409 };
    throw err;
  }
}

// Desativar/reativar. Proteções: ninguém desativa a si mesmo e o último administrador ativo nunca é desativado.
// `executorId` é o id de quem pede (null no script de linha de comando, onde não há "si mesmo").
export function alterarAtivo(admin, ativo, executorId = null) {
  const novo = ativo ? 1 : 0;
  if (admin.ativo === novo) return { alterado: false, ativo: novo };
  if (!novo) {
    if (executorId !== null && admin.id === executorId) {
      return { erro: 'Você não pode desativar a própria conta.', status: 409 };
    }
    if (adminsAtivos() <= 1) {
      return { erro: 'Não é possível desativar o último administrador ativo.', status: 409 };
    }
  }
  db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(novo, admin.id);
  return { alterado: true, ativo: novo };
}

export function definirSenha(admin, novaSenha) {
  const erro = validarSenha(novaSenha);
  if (erro) return { erro, status: 400 };
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(novaSenha), 10), admin.id);
  return { ok: true };
}
