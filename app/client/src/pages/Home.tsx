import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Home() {
  const { usuario } = useAuth();

  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/minha-area" replace />;
}
