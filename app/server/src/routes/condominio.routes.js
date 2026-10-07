import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { aplicarEstrutura, gravarRotulos, lerCondominio } from '../db/estrutura.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { previa, validarConfiguracao, validarRotulos } from '../utils/estrutura.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import { rotulos } from '../utils/rotulos.js';
import { TAMANHO_MINIMO_DA_SENHA } from '../utils/administradores.js';

export const condominioRouter = Router();
condominioRouter.use(requireAuth);

const CAMPOS_ROTULOS = [
  'nome', 'agrupador_singular', 'agrupador_plural', 'agrupador_genero', 'agrupador_abrev',
  'unidade_singular', 'unidade_plural', 'unidade_genero', 'unidade_abrev', 'rotulo_terreo',
];

function estado() {
  const config = lerCondominio();
  const { agrupadores } = db.prepare('SELECT COUNT(*) AS agrupadores FROM blocos').get();
  const { unidades } = db.prepare('SELECT COUNT(*) AS unidades FROM apartamentos').get();
  const { setup_concluido, ...resto } = config;
  return { ...resto, id: undefined, configurado: Boolean(setup_concluido), total_de_agrupadores: agrupadores, total_de_unidades: unidades };
}

// Qualquer usuário logado: a interface precisa dos nomes para montar os textos; o admin, do estado do primeiro acesso.
condominioRouter.get('/', (_req, res) => res.json(estado()));

// Prévia do que o assistente vai criar (não grava nada).
condominioRouter.post('/previa', requireRole('admin'), (req, res) => {
  const { config, agrupadores, erro } = validarConfiguracao(req.body);
  if (erro) return res.status(400).json({ error: erro });
  res.json(previa(config, agrupadores));
});

// Primeiro acesso: grava os nomes e cria a estrutura. Só uma vez — depois a estrutura só cresce (POST /blocos e
// /apartamentos) e os nomes são editados em PUT /rotulos.
condominioRouter.post('/', requireRole('admin'), (req, res) => {
  if (lerCondominio().setup_concluido) {
    const r = rotulos();
    return res.status(409).json({ error: `A estrutura ${r.nome === 'Condomínio' ? 'do condomínio' : `de ${r.nome}`} já foi configurada.` });
  }
  const { config, agrupadores, erro } = validarConfiguracao(req.body);
  if (erro) return res.status(400).json({ error: erro });
  const novaSenha = req.body?.nova_senha_admin;
  if (novaSenha !== undefined && novaSenha !== null && novaSenha !== '' && String(novaSenha).length < TAMANHO_MINIMO_DA_SENHA) {
    return res.status(400).json({ error: `A nova senha deve ter ao menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.` });
  }

  const criado = aplicarEstrutura(config, agrupadores);
  if (novaSenha) {
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(novaSenha), 10), req.user.sub);
  }
  registrarAuditoria(req, {
    entidade: 'configuracao', acao: 'configurar_estrutura',
    depois: { ...Object.fromEntries(CAMPOS_ROTULOS.map((c) => [c, config[c]])), agrupadores, ...criado },
    detalhe: `Estrutura criada: ${criado.agrupadores} ${config.agrupador_plural.toLowerCase()}, ${criado.unidades} ${config.unidade_plural.toLowerCase()}`,
  });
  res.status(201).json({ ...criado, senha_alterada: Boolean(novaSenha) });
});

// Nomes exibidos (podem ser mudados a qualquer momento; a estrutura e os números não mudam).
condominioRouter.put('/rotulos', requireRole('admin'), (req, res) => {
  const { rotulos: novos, erro } = validarRotulos({ ...lerCondominio(), ...req.body });
  if (erro) return res.status(400).json({ error: erro });
  const antes = Object.fromEntries(CAMPOS_ROTULOS.map((c) => [c, lerCondominio()[c]]));
  gravarRotulos(novos);
  const depois = Object.fromEntries(CAMPOS_ROTULOS.map((c) => [c, novos[c]]));
  if (JSON.stringify(antes) !== JSON.stringify(depois)) {
    registrarAuditoria(req, { entidade: 'configuracao', acao: 'editar_rotulos', antes, depois, detalhe: 'Nomes do condomínio' });
  }
  res.json(estado());
});
