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
interface ResumoBloco {
  bloco_numero: string;
  adimplente: number;
  inadimplente: number;
  saldo: number;
}
interface ResumoMensal {
  receitas: number;
  despesas: number;
  saldo: number;
}

const MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export function Financeiro() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(new Date().getMonth() + 1);

  const [resumoMensal, setResumoMensal] = useState<ResumoMensal | null>(null);
  const [resumoBlocos, setResumoBlocos] = useState<ResumoBloco[]>([]);

  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [apartamentos, setApartamentos] = useState<Apartamento[]>([]);
  const [blocoId, setBlocoId] = useState('');
  const [apartamentoId, setApartamentoId] = useState('');
  const [valorTaxa, setValorTaxa] = useState('');
  const [mensagemTaxa, setMensagemTaxa] = useState<string | null>(null);

  const [descricaoReceita, setDescricaoReceita] = useState('');
  const [valorReceita, setValorReceita] = useState('');
  const [dataReceita, setDataReceita] = useState('');
  const [mensagemReceita, setMensagemReceita] = useState<string | null>(null);

  const [descricaoDespesa, setDescricaoDespesa] = useState('');
  const [valorDespesa, setValorDespesa] = useState('');
  const [dataDespesa, setDataDespesa] = useState('');
  const [mensagemDespesa, setMensagemDespesa] = useState<string | null>(null);

  async function carregarResumo() {
    const [{ data: mensal }, { data: porBloco }] = await Promise.all([
      api.get<ResumoMensal>('/financeiro/resumo/mensal', { params: { ano, mes } }),
      api.get<ResumoBloco[]>('/financeiro/resumo/blocos', { params: { ano, mes } }),
    ]);
    setResumoMensal(mensal);
    setResumoBlocos(porBloco);
  }

  useEffect(() => {
    api.get<Bloco[]>('/blocos').then((res) => setBlocos(res.data));
  }, []);

  useEffect(() => {
    carregarResumo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mes]);

  useEffect(() => {
    if (!blocoId) {
      setApartamentos([]);
      return;
    }
    api.get<Apartamento[]>('/apartamentos', { params: { bloco_id: blocoId } }).then((res) =>
      setApartamentos(res.data)
    );
  }, [blocoId]);

  async function lancarTaxa(e: FormEvent) {
    e.preventDefault();
    setMensagemTaxa(null);
    try {
      await api.post('/financeiro/taxas', {
        apartamento_id: Number(apartamentoId),
        mes_referencia: mes,
        ano_referencia: ano,
        valor: Number(valorTaxa),
      });
      setMensagemTaxa('Taxa lançada com sucesso.');
      setValorTaxa('');
      carregarResumo();
    } catch (err) {
      setMensagemTaxa(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          'Erro ao lançar taxa.'
      );
    }
  }

  async function lancarOutraReceita(e: FormEvent) {
    e.preventDefault();
    setMensagemReceita(null);
    try {
      await api.post('/financeiro/outras-receitas', {
        descricao: descricaoReceita,
        valor: Number(valorReceita),
        data: dataReceita,
      });
      setMensagemReceita('Receita lançada com sucesso.');
      setDescricaoReceita('');
      setValorReceita('');
      setDataReceita('');
      carregarResumo();
    } catch {
      setMensagemReceita('Erro ao lançar receita.');
    }
  }

  async function lancarDespesa(e: FormEvent) {
    e.preventDefault();
    setMensagemDespesa(null);
    try {
      await api.post('/financeiro/despesas', {
        descricao: descricaoDespesa,
        valor: Number(valorDespesa),
        data: dataDespesa,
      });
      setMensagemDespesa('Despesa lançada com sucesso.');
      setDescricaoDespesa('');
      setValorDespesa('');
      setDataDespesa('');
      carregarResumo();
    } catch {
      setMensagemDespesa('Erro ao lançar despesa.');
    }
  }

  return (
    <div className="page page-financeiro">
      <h2>Financeiro</h2>

      <div className="filtro-periodo">
        <label>
          Ano
          <input
            type="number"
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            data-testid="input-ano"
          />
        </label>
        <label>
          Mês
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))} data-testid="select-mes">
            {MESES.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      {resumoMensal && (
        <section data-testid="resumo-mensal">
          <h3>
            Resumo {MESES[mes - 1]}/{ano}
          </h3>
          <p>Receitas: R$ {resumoMensal.receitas.toFixed(2)}</p>
          <p>Despesas: R$ {resumoMensal.despesas.toFixed(2)}</p>
          <p>Saldo: R$ {resumoMensal.saldo.toFixed(2)}</p>
        </section>
      )}

      <section>
        <h3>Resumo por bloco</h3>
        <table data-testid="tabela-resumo-blocos">
          <thead>
            <tr>
              <th>Bloco</th>
              <th>Adimplente</th>
              <th>Inadimplente</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {resumoBlocos.map((linha) => (
              <tr key={linha.bloco_numero}>
                <td>{linha.bloco_numero}</td>
                <td>R$ {linha.adimplente.toFixed(2)}</td>
                <td>R$ {linha.inadimplente.toFixed(2)}</td>
                <td>R$ {linha.saldo.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Lançar taxa de condomínio</h3>
        <form onSubmit={lancarTaxa} data-testid="form-lancar-taxa">
          <label>
            Bloco
            <select
              value={blocoId}
              onChange={(e) => {
                setBlocoId(e.target.value);
                setApartamentoId('');
              }}
              data-testid="select-taxa-bloco"
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
              data-testid="select-taxa-apartamento"
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
            Valor
            <input
              type="number"
              step="0.01"
              value={valorTaxa}
              onChange={(e) => setValorTaxa(e.target.value)}
              data-testid="input-valor-taxa"
              required
            />
          </label>
          {mensagemTaxa && <p data-testid="mensagem-taxa">{mensagemTaxa}</p>}
          <button type="submit" data-testid="botao-lancar-taxa">
            Lançar
          </button>
        </form>
      </section>

      <section>
        <h3>Outras receitas</h3>
        <form onSubmit={lancarOutraReceita} data-testid="form-outra-receita">
          <label>
            Descrição
            <input
              value={descricaoReceita}
              onChange={(e) => setDescricaoReceita(e.target.value)}
              data-testid="input-descricao-receita"
              required
            />
          </label>
          <label>
            Valor
            <input
              type="number"
              step="0.01"
              value={valorReceita}
              onChange={(e) => setValorReceita(e.target.value)}
              data-testid="input-valor-receita"
              required
            />
          </label>
          <label>
            Data
            <input
              type="date"
              value={dataReceita}
              onChange={(e) => setDataReceita(e.target.value)}
              data-testid="input-data-receita"
              required
            />
          </label>
          {mensagemReceita && <p data-testid="mensagem-receita">{mensagemReceita}</p>}
          <button type="submit" data-testid="botao-lancar-receita">
            Salvar
          </button>
        </form>
      </section>

      <section>
        <h3>Despesas</h3>
        <form onSubmit={lancarDespesa} data-testid="form-despesa">
          <label>
            Descrição
            <input
              value={descricaoDespesa}
              onChange={(e) => setDescricaoDespesa(e.target.value)}
              data-testid="input-descricao-despesa"
              required
            />
          </label>
          <label>
            Valor
            <input
              type="number"
              step="0.01"
              value={valorDespesa}
              onChange={(e) => setValorDespesa(e.target.value)}
              data-testid="input-valor-despesa"
              required
            />
          </label>
          <label>
            Data
            <input
              type="date"
              value={dataDespesa}
              onChange={(e) => setDataDespesa(e.target.value)}
              data-testid="input-data-despesa"
              required
            />
          </label>
          {mensagemDespesa && <p data-testid="mensagem-despesa">{mensagemDespesa}</p>}
          <button type="submit" data-testid="botao-lancar-despesa">
            Salvar
          </button>
        </form>
      </section>
    </div>
  );
}
