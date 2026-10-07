import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Result, Spin } from 'antd';
import { useAuth, type Role } from '../context/AuthContext';
import { useCondominio } from '../context/CondominioContext';

export function ProtectedRoute({
  roles,
  semConfiguracao = false,
  children,
}: {
  roles?: Role[];
  // Tela que pode ser aberta antes de o condomínio ser configurado (o assistente de primeiro acesso).
  semConfiguracao?: boolean;
  children: ReactNode;
}) {
  const { usuario } = useAuth();
  const { condominio, carregado } = useCondominio();
  const { pathname } = useLocation();

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }
  if (roles && !roles.includes(usuario.role)) {
    return <Navigate to="/" replace />;
  }
  if (!carregado) {
    return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} data-testid="carregando-condominio" />;
  }
  if (!condominio.configurado) {
    if (usuario.role === 'admin') {
      // Enquanto não houver estrutura, o administrador só vê o assistente.
      return semConfiguracao ? <>{children}</> : <Navigate to="/configuracao-inicial" replace state={{ de: pathname }} />;
    }
    return (
      <Result
        status="info"
        title="Configuração pendente"
        subTitle="O administrador ainda não configurou o condomínio. Tente novamente mais tarde."
        data-testid="configuracao-pendente"
      />
    );
  }
  // Já configurado: o assistente não pode ser repetido.
  if (semConfiguracao) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
