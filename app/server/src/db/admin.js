import crypto from 'node:crypto';
import { runMigrations } from './index.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import {
  alterarAtivo, buscarAdminPorEmail, criarAdmin, definirSenha, listarAdmins, normalizarEmail,
} from '../utils/administradores.js';

// Contas de administrador pela linha de comando (uso do desenvolvedor, sem perfil especial no sistema).
//   npm run admin -- listar
//   npm run admin -- criar <email> [senha]
//   npm run admin -- senha <email> [nova-senha]
//   npm run admin -- desativar <email>
//   npm run admin -- ativar <email>
// Sem senha informada, gera uma aleatória e a mostra UMA vez (não fica em arquivo nem no histórico).
// Usa o banco de DATABASE_PATH (o de demonstração, por padrão). As mesmas regras da tela valem aqui.
// O que muda entra no Histórico de alterações com o usuário "script".

const USO = `Uso: npm run admin -- <comando>
  listar                         lista os administradores
  criar <email> [senha]          cria um administrador
  senha <email> [nova-senha]     redefine a senha de um administrador
  desativar <email>              desativa (nunca o último administrador ativo)
  ativar <email>                 reativa`;

const AUTOR = { user: { email: 'script' } };
const gerarSenha = () => crypto.randomBytes(9).toString('base64url');
const falhar = (msg) => {
  console.error(msg);
  process.exit(1);
};

function exigirAdmin(email) {
  if (!email) falhar(`Informe o e-mail.\n\n${USO}`);
  const admin = buscarAdminPorEmail(email);
  if (!admin) falhar(`Não há administrador com o e-mail ${normalizarEmail(email)}.`);
  return admin;
}

runMigrations();
const [comando, email, senhaInformada] = process.argv.slice(2);

switch (comando) {
  case 'listar': {
    const admins = listarAdmins();
    if (!admins.length) console.log('Nenhum administrador cadastrado.');
    for (const a of admins) console.log(`${a.ativo ? 'ativo   ' : 'inativo '} ${a.email}  (criado em ${a.created_at})`);
    break;
  }
  case 'criar': {
    if (!email) falhar(`Informe o e-mail.\n\n${USO}`);
    const senha = senhaInformada ?? gerarSenha();
    const r = criarAdmin(email, senha);
    if (r.erro) falhar(r.erro);
    registrarAuditoria(AUTOR, { entidade: 'usuario', entidadeId: r.id, acao: 'criar_admin', depois: { email: r.email, ativo: true }, detalhe: r.email });
    console.log(`Administrador criado: ${r.email}`);
    if (!senhaInformada) console.log(`Senha gerada (mostrada só agora): ${senha}`);
    break;
  }
  case 'senha': {
    const admin = exigirAdmin(email);
    const senha = senhaInformada ?? gerarSenha();
    const r = definirSenha(admin, senha);
    if (r.erro) falhar(r.erro);
    registrarAuditoria(AUTOR, { entidade: 'usuario', entidadeId: admin.id, acao: 'redefinir_senha', detalhe: admin.email });
    console.log(`Senha redefinida: ${admin.email}`);
    if (!senhaInformada) console.log(`Senha gerada (mostrada só agora): ${senha}`);
    break;
  }
  case 'desativar':
  case 'ativar': {
    const admin = exigirAdmin(email);
    const ativo = comando === 'ativar';
    const r = alterarAtivo(admin, ativo);
    if (r.erro) falhar(r.erro);
    if (r.alterado) {
      registrarAuditoria(AUTOR, {
        entidade: 'usuario', entidadeId: admin.id, acao: ativo ? 'reativar' : 'desativar',
        antes: { ativo: Boolean(admin.ativo) }, depois: { ativo }, detalhe: admin.email,
      });
    }
    console.log(r.alterado ? `${ativo ? 'Reativado' : 'Desativado'}: ${admin.email}` : `Nada a fazer: ${admin.email} já está ${ativo ? 'ativo' : 'inativo'}.`);
    break;
  }
  default:
    falhar(comando ? `Comando desconhecido: ${comando}\n\n${USO}` : USO);
}
