import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import { alterarAtivo, buscarAdmin, criarAdmin, definirSenha, listarAdmins } from '../utils/administradores.js';

// Contas de administrador (só Admin). Nenhuma rota devolve senha nem hash, e o histórico nunca guarda senha.
export const administradoresRouter = Router();
administradoresRouter.use(requireAuth, requireRole('admin'));

const recusar = (res, r) => res.status(r.status).json({ error: r.erro });
const lerAtivo = (v) => (v === true || v === 1 || v === '1' ? true : v === false || v === 0 || v === '0' ? false : null);

administradoresRouter.get('/', (req, res) => {
  res.json(listarAdmins().map((a) => ({ ...a, ativo: Boolean(a.ativo), eu: a.id === req.user.sub })));
});

administradoresRouter.post('/', (req, res) => {
  const r = criarAdmin(req.body?.email, req.body?.senha);
  if (r.erro) return recusar(res, r);
  registrarAuditoria(req, { entidade: 'usuario', entidadeId: r.id, acao: 'criar_admin', depois: { email: r.email, ativo: true }, detalhe: r.email });
  res.status(201).json({ id: r.id, email: r.email, ativo: true });
});

administradoresRouter.put('/:id/ativo', (req, res) => {
  const admin = buscarAdmin(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Administrador não encontrado.' });
  const ativo = lerAtivo(req.body?.ativo);
  if (ativo === null) return res.status(400).json({ error: 'ativo deve ser verdadeiro ou falso.' });
  const r = alterarAtivo(admin, ativo, req.user.sub);
  if (r.erro) return recusar(res, r);
  if (r.alterado) {
    registrarAuditoria(req, {
      entidade: 'usuario', entidadeId: admin.id, acao: ativo ? 'reativar' : 'desativar',
      antes: { ativo: Boolean(admin.ativo) }, depois: { ativo }, detalhe: admin.email,
    });
  }
  res.json({ id: admin.id, ativo });
});

// Redefine a senha de OUTRO administrador (a própria senha se troca em POST /auth/trocar-senha, que exige a senha atual).
administradoresRouter.put('/:id/senha', (req, res) => {
  const admin = buscarAdmin(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Administrador não encontrado.' });
  if (admin.id === req.user.sub) {
    return res.status(400).json({ error: 'Para trocar a sua própria senha use a opção "Minha senha".' });
  }
  const r = definirSenha(admin, req.body?.nova_senha);
  if (r.erro) return recusar(res, r);
  registrarAuditoria(req, { entidade: 'usuario', entidadeId: admin.id, acao: 'redefinir_senha', detalhe: admin.email });
  res.json({ message: 'Senha redefinida.' });
});
