import { useEffect, useState } from 'react';
import { Button, Card, Select, InputNumber, Table, Typography, Space, Statistic, Row, Col } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { LancamentosDoMes } from '../../components/LancamentosDoMes';
import { SeletorRegime, type Regime } from '../../components/SeletorRegime';

const { Title, Paragraph } = Typography;

interface ResumoBloco {
  bloco_numero: string;
  adimplente: number;
  inadimplente: number; // em atraso (vencidas)
  a_vencer: number; // em aberto, ainda no prazo
  despesas: number; // específicas do bloco + parte das gerais
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

export function VisualizarFinanceiro() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [resumoMensal, setResumoMensal] = useState<ResumoMensal | null>(null);
  const [resumoBlocos, setResumoBlocos] = useState<ResumoBloco[]>([]);
  const [regime, setRegime] = useState<Regime>('competencia');

  useEffect(() => {
    api.get<ResumoMensal>('/financeiro/resumo/mensal', { params: { ano, mes, regime } }).then((res) =>
      setResumoMensal(res.data)
    );
    api.get<ResumoBloco[]>('/financeiro/resumo/blocos', { params: { ano, mes } }).then((res) =>
      setResumoBlocos(res.data)
    );
  }, [ano, mes, regime]);

  const colunasBlocos: ColumnsType<ResumoBloco> = [
    { title: 'Bloco', dataIndex: 'bloco_numero' },
    { title: 'Adimplente', dataIndex: 'adimplente', render: (v: number) => `R$ ${v.toFixed(2)}` },
    { title: 'Inadimplente', dataIndex: 'inadimplente', render: (v: number) => `R$ ${v.toFixed(2)}` },
    { title: 'A vencer', dataIndex: 'a_vencer', render: (v: number) => `R$ ${v.toFixed(2)}` },
    { title: 'Despesas (rateio)', dataIndex: 'despesas', render: (v: number) => `R$ ${v.toFixed(2)}` },
    {
      title: 'Saldo',
      dataIndex: 'saldo',
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#3f8600' : '#cf1322' }}>R$ {v.toFixed(2)}</span>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space size="large" align="end" className="filtro-periodo">
          <div>
            <div>Ano</div>
            <InputNumber value={ano} onChange={(v) => setAno(Number(v))} data-testid="input-ano" />
          </div>
          <div>
            <div>Mês</div>
            <Select
              value={mes}
              onChange={setMes}
              style={{ width: 100 }}
              data-testid="select-mes"
              options={MESES.map((m, idx) => ({ value: idx + 1, label: m }))}
            />
          </div>
          <SeletorRegime valor={regime} onChange={setRegime} />
        </Space>
      </Card>

      {resumoMensal && (
        <Card data-testid="resumo-mensal">
          <Row gutter={32}>
            <Col>
              <Statistic title="Receitas" prefix="R$" value={resumoMensal.receitas.toFixed(2)} />
            </Col>
            <Col>
              <Statistic title="Despesas" prefix="R$" value={resumoMensal.despesas.toFixed(2)} />
            </Col>
            <Col>
              <Statistic
                title="Saldo"
                prefix="R$"
                value={resumoMensal.saldo.toFixed(2)}
                valueStyle={{ color: resumoMensal.saldo >= 0 ? '#3f8600' : '#cf1322' }}
              />
            </Col>
          </Row>
        </Card>
      )}

      <Card>
        <Title level={4}>Resumo por bloco</Title>
        <Paragraph type="secondary">
          Saldo do bloco = receitas do bloco (taxas pagas + parte das outras receitas) menos as despesas dele (as do próprio
          bloco + a parte das despesas gerais, divididas por igual entre os blocos).
        </Paragraph>
        <Table
          data-testid="tabela-resumo-blocos"
          rowKey="bloco_numero"
          columns={colunasBlocos}
          dataSource={resumoBlocos}
          pagination={false}
        />
      </Card>

      <Card data-testid="atalho-taxas-do-mes">
        <Title level={4}>Taxas de condomínio do mês</Title>
        <Paragraph type="secondary">
          A lista de taxas (gerar, registrar pagamento, editar e cancelar) fica na tela Taxas do mês.
        </Paragraph>
        <Link to={`/admin/taxas?ano=${ano}&mes=${mes}`}>
          <Button type="primary" data-testid="botao-abrir-taxas-do-mes">Abrir Taxas de {String(mes).padStart(2, '0')}/{ano}</Button>
        </Link>
      </Card>

      <LancamentosDoMes ano={ano} mes={mes} />
    </Space>
  );
}
