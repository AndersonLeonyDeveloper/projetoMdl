import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { signToken } from '../utils/token.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, senha } = req.body ?? {};
  if (!email || !senha) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const usuario = db
    .prepare('SELECT * FROM usuarios WHERE email = ?')
    .get(email);

  // Mensagem genérica: nunca revelar se o e-mail existe ou não (ver sugestoes-de-testes.md, seção 1).
  const credenciaisInvalidas = () =>
    res.status(401).json({ error: 'E-mail ou senha inválidos.' });

  if (!usuario) return credenciaisInvalidas();

  const senhaConfere = bcrypt.compareSync(senha, usuario.senha_hash);
  if (!senhaConfere) return credenciaisInvalidas();

  const token = signToken({
    sub: usuario.id,
    email: usuario.email,
    role: usuario.role,
    pessoa_id: usuario.pessoa_id,
  });

  res.json({
    token,
    usuario: {
      id: usuario.id,
      email: usuario.email,
      role: usuario.role,
      pessoa_id: usuario.pessoa_id,
    },
  });
});

authRouter.post('/forgot-password', (req, res) => {
  const { email } = req.body ?? {};
  const mensagemGenerica = {
    message: 'Se o e-mail existir em nossa base, um link de redefinição foi enviado.',
  };

  const usuario = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (!usuario) {
    // Responde igual, mesmo sem usuário — evita enumeração de e-mails.
    return res.json(mensagemGenerica);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString(); // 30 min

  db.prepare(
    'INSERT INTO password_reset_tokens (usuario_id, token, expires_at) VALUES (?, ?, ?)'
  ).run(usuario.id, token, expiresAt);

  // Sem serviço de e-mail configurado: log local para uso em ambiente de desenvolvimento/teste.
  console.log(`[forgot-password] token gerado para usuario_id=${usuario.id}: ${token}`);

  res.json(mensagemGenerica);
});

authRouter.post('/reset-password', (req, res) => {
  const { token, novaSenha } = req.body ?? {};
  if (!token || !novaSenha) {
    return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
  }

  const registro = db
    .prepare('SELECT * FROM password_reset_tokens WHERE token = ?')
    .get(token);

  if (!registro || registro.used || new Date(registro.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Token inválido, já utilizado ou expirado.' });
  }

  const senhaHash = bcrypt.hashSync(novaSenha, 10);
  const atualizar = db.transaction(() => {
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(
      senhaHash,
      registro.usuario_id
    );
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(registro.id);
  });
  atualizar();

  res.json({ message: 'Senha atualizada com sucesso.' });
});
