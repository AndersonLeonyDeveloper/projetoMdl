import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';

interface Bloco {
  id: number;
  numero: string;
}
interface Apartamento {
  id: number;
  bloco_id: number;
  numero: string;
}
interface DadoMorador {
  bloco: string;
  apartamento: string;
  tipo: 'proprietario' | 'inquilino' | null;
  nome: string | null;
  telefone: string | null;
  email: string | null;
}

const TIPOS = ['proprietario', 'inquilino'] as const;

export function Moradores() {
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [apartamentos, setApartamentos] = useState<Apartamento[]>([]);
  const [dadosMoradores, setDadosMoradores] = useState<DadoMorador[]>([]);

  const [blocoId, setBlocoId] = useState('');
  const [apartamentoId, setApartamentoId] = useState('');
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>('proprietario');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [confirmarEmail, setConfirmarEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function carregarDadosMoradores() {
    const { data } = await api.get<DadoMorador[]>('/dados-moradores');
    setDadosMoradores(data);
  }

  useEffect(() => {
    api.get<Bloco[]>('/blocos').then((res) => setBlocos(res.data));
    carregarDadosMoradores();
  }, []);

  useEffect(() => {
    if (!blocoId) {
      setApartamentos([]);
      return;
    }
    api.get<Apartamento[]>('/apartamentos', { params: { bloco_id: blocoId } }).then((res) => {
      setApartamentos(res.data);
    });
  }, [blocoId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (email !== confirmarEmail) {
      setErro('Confirmação de e-mail não confere.');
      return;
    }

    try {
      await api.post('/moradores', {
        apartamento_id: Number(apartamentoId),
        tipo,
        nome,
        telefone,
        cpf: cpf || null,
        email,
      });
      setSucesso('Morador cadastrado com sucesso.');
      setNome('');
      setTelefone('');
      setCpf('');
      setEmail('');
      setConfirmarEmail('');
      carregarDadosMoradores();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        'Erro ao cadastrar morador.';
      setErro(message);
    }
  }

  return (
    <div className="page page-moradores">
      <h2>Cadastro: Moradores</h2>
      <form onSubmit={handleSubmit} data-testid="form-cadastro-morador">
        <label>
          Bloco
          <select
            value={blocoId}
            onChange={(e) => {
              setBlocoId(e.target.value);
              setApartamentoId('');
            }}
            data-testid="select-bloco"
            required
          >
            <option value="">Selecione</option>
            {blocos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.numero}
              </option>
            ))}
          </select>
        </label>
        <label>
          Apartamento
          <select
            value={apartamentoId}
            onChange={(e) => setApartamentoId(e.target.value)}
            data-testid="select-apartamento"
            required
          >
            <option value="">Selecione</option>
            {apartamentos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.numero}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo morador
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as (typeof TIPOS)[number])}
            data-testid="select-tipo"
          >
            <option value="proprietario">Proprietário</option>
            <option value="inquilino">Inquilino</option>
          </select>
        </label>
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
            placeholder="(85) 99999-9999"
            required
          />
        </label>
        {tipo === 'proprietario' && (
          <label>
            CPF
            <input
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              data-testid="input-cpf"
              placeholder="000.000.000-00"
              required
            />
          </label>
        )}
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
          <p role="alert" data-testid="erro-cadastro-morador">
            {erro}
          </p>
        )}
        {sucesso && <p data-testid="sucesso-cadastro-morador">{sucesso}</p>}
        <button type="submit" data-testid="botao-salvar-morador">
          Salvar
        </button>
      </form>

      <h3>Moradores cadastrados</h3>
      <table data-testid="tabela-moradores">
        <thead>
          <tr>
            <th>Bloco</th>
            <th>Apartamento</th>
            <th>Tipo</th>
            <th>Nome</th>
            <th>Telefone</th>
            <th>E-mail</th>
          </tr>
        </thead>
        <tbody>
          {dadosMoradores.map((linha, idx) => (
            <tr key={idx}>
              <td>{linha.bloco}</td>
              <td>{linha.apartamento}</td>
              <td>{linha.tipo ?? '—'}</td>
              <td>{linha.nome ?? '—'}</td>
              <td>{linha.telefone ?? '—'}</td>
              <td>{linha.email ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
