import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, type Role } from '../context/AuthContext';

export function ProtectedRoute({
  roles,
  children,
}: {
  roles?: Role[];
  children: ReactNode;
}) {
  const { usuario } = useAuth();

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }
  if (roles && !roles.includes(usuario.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
