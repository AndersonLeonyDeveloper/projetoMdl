import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';

interface Pessoa {
  id: number;
  nome: string;
  telefone: string;
  cpf: string | null;
  email: string;
}

export function MeusDados() {
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [confirmarEmail, setConfirmarEmail] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.get<Pessoa>('/pessoas/me').then((res) => {
      setPessoa(res.data);
      setNome(res.data.nome);
      setTelefone(res.data.telefone);
      setEmail(res.data.email);
      setConfirmarEmail(res.data.email);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    try {
      await api.put('/pessoas/me', { nome, telefone, email, confirmarEmail });
      setMensagem('Dados atualizados com sucesso.');
    } catch (err) {
      setErro(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          'Erro ao atualizar dados.'
      );
    }
  }

  if (!pessoa) return <p>Carregando...</p>;

  return (
    <div className="page page-meus-dados">
      <h2>Meus Dados</h2>
      <form onSubmit={handleSubmit} data-testid="form-meus-dados">
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} data-testid="input-nome" required />
        </label>
        <label>
          Telefone
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            data-testid="input-telefone"
            required
          />
        </label>
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="input-email"
            required
          />
        </label>
        <label>
          Confirmar e-mail
          <input
            type="email"
            value={confirmarEmail}
            onChange={(e) => setConfirmarEmail(e.target.value)}
            data-testid="input-confirmar-email"
            required
          />
        </label>
        {erro && (
          <p role="alert" data-testid="erro-meus-dados">
            {erro}
          </p>
        )}
        {mensagem && <p data-testid="sucesso-meus-dados">{mensagem}</p>}
        <button type="submit" data-testid="botao-salvar-meus-dados">
          Salvar
        </button>
      </form>
    </div>
  );
}
