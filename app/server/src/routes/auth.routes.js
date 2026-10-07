import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, withTransaction } from '../db/index.js';
import { signToken } from '../utils/token.js';
import { requireAuth } from '../middleware/auth.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import { TAMANHO_MINIMO_DA_SENHA } from '../utils/administradores.js';

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

  if (!usuario || !usuario.ativo) return credenciaisInvalidas();

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

// Troca da própria senha (qualquer perfil logado): exige a senha atual e uma nova diferente, de pelo menos 6 caracteres.
authRouter.post('/trocar-senha', requireAuth, (req, res) => {
  const { senha_atual, nova_senha } = req.body ?? {};
  if (!senha_atual || !nova_senha) {
    return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' });
  }
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.sub);
  if (!bcrypt.compareSync(String(senha_atual), usuario.senha_hash)) {
    return res.status(400).json({ error: 'A senha atual não confere.' });
  }
  if (String(nova_senha).length < TAMANHO_MINIMO_DA_SENHA) {
    return res.status(400).json({ error: `A nova senha deve ter ao menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.` });
  }
  if (nova_senha === senha_atual) {
    return res.status(400).json({ error: 'A nova senha deve ser diferente da atual.' });
  }
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(nova_senha), 10), usuario.id);
  registrarAuditoria(req, { entidade: 'usuario', entidadeId: usuario.id, acao: 'trocar_senha', detalhe: usuario.email });
  res.json({ message: 'Senha alterada com sucesso.' });
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
  if (String(novaSenha).length < TAMANHO_MINIMO_DA_SENHA) {
    return res.status(400).json({ error: `A nova senha deve ter ao menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.` });
  }

  const senhaHash = bcrypt.hashSync(String(novaSenha), 10);
  // node:sqlite não tem db.transaction(): a senha e o uso do token têm de valer juntos ou nenhum dos dois.
  withTransaction(() => {
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(
      senhaHash,
      registro.usuario_id
    );
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(registro.id);
  });

  res.json({ message: 'Senha atualizada com sucesso.' });
});
