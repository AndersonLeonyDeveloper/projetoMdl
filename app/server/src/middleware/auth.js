import { db } from '../db/index.js';
import { verifyToken } from '../utils/token.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token ausente.' });
  }
  let payload;
  try {
    payload = verifyToken(header.slice('Bearer '.length));
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
  // O token sozinho não basta: conta desativada (ou removida) perde o acesso na hora, e o perfil vale o do banco.
  const usuario = db.prepare('SELECT id, email, role, pessoa_id, ativo FROM usuarios WHERE id = ?').get(payload.sub);
  if (!usuario || !usuario.ativo) {
    return res.status(401).json({ error: 'Conta desativada.' });
  }
  req.user = { ...payload, email: usuario.email, role: usuario.role, pessoa_id: usuario.pessoa_id };
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso não permitido para este perfil.' });
    }
    next();
  };
}
