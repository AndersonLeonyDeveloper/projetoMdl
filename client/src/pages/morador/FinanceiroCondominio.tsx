import { useEffect, useState } from 'react';
import { api } from '../../api/client';

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

export function FinanceiroCondominio() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [resumoMensal, setResumoMensal] = useState<ResumoMensal | null>(null);
  const [resumoBlocos, setResumoBlocos] = useState<ResumoBloco[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<ResumoMensal>('/financeiro/resumo/mensal', { params: { ano, mes } }),
      api.get<ResumoBloco[]>('/financeiro/resumo/blocos', { params: { ano, mes } }),
    ]).then(([mensal, porBloco]) => {
      setResumoMensal(mensal.data);
      setResumoBlocos(porBloco.data);
    });
  }, [ano, mes]);

  return (
    <div className="page page-financeiro-condominio">
      <h2>Financeiro do Condomínio</h2>
      <div className="filtro-periodo">
        <label>
          Ano
          <input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} data-testid="input-ano" />
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
          <p>Receitas: R$ {resumoMensal.receitas.toFixed(2)}</p>
          <p>Despesas: R$ {resumoMensal.despesas.toFixed(2)}</p>
          <p>Saldo: R$ {resumoMensal.saldo.toFixed(2)}</p>
        </section>
      )}

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
    </div>
  );
}
