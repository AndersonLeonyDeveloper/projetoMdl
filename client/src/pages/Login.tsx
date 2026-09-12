import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      await login(email, senha);
      navigate('/');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          setErro('E-mail ou senha inválidos.');
        } else if (!err.response) {
          setErro('Não foi possível conectar ao servidor. Verifique se a API está rodando.');
        } else {
          setErro(`Erro inesperado (${err.response.status}). Veja o console para detalhes.`);
        }
        console.error('Falha no login:', err);
      } else {
        setErro('Erro inesperado ao entrar.');
        console.error(err);
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="page page-login">
      <h1>Condomínio Morada da Lagoa</h1>
      <form onSubmit={handleSubmit} data-testid="login-form">
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="login-email"
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            data-testid="login-senha"
            required
          />
        </label>
        {erro && (
          <p role="alert" data-testid="login-erro">
            {erro}
          </p>
        )}
        <button type="submit" data-testid="login-submit" disabled={carregando}>
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
      <Link to="/esqueci-senha" data-testid="link-esqueci-senha">
        Esqueceu a senha?
      </Link>
    </div>
  );
}
