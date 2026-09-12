import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email });
      setMensagem(data.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="page page-esqueci-senha">
      <h1>Informe o seu e-mail</h1>
      <form onSubmit={handleSubmit} data-testid="esqueci-senha-form">
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="esqueci-senha-email"
            required
          />
        </label>
        <button type="submit" data-testid="esqueci-senha-solicitar" disabled={carregando}>
          Solicitar
        </button>
      </form>
      {mensagem && <p data-testid="esqueci-senha-mensagem">{mensagem}</p>}
      <Link to="/login">Voltar ao login</Link>
    </div>
  );
}
