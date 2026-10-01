import { createContext, useContext, useState, type ReactNode } from 'react';
import { api } from '../api/client';

export type Role = 'admin' | 'proprietario' | 'inquilino';

export interface Usuario {
  id: number;
  email: string;
  role: Role;
  pessoa_id: number | null;
}

interface AuthContextValue {
  usuario: Usuario | null;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function lerUsuarioSalvo(): Usuario | null {
  const raw = localStorage.getItem('usuario');
  return raw ? (JSON.parse(raw) as Usuario) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(lerUsuarioSalvo);

  async function login(email: string, senha: string) {
    const { data } = await api.post('/auth/login', { email, senha });
    localStorage.setItem('token', data.token);
    localStorage.setItem('usuario', JSON.stringify(data.usuario));
    setUsuario(data.usuario);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de um AuthProvider.');
  return ctx;
}
