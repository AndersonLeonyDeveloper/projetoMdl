import { lazy, Suspense, useEffect, useState } from 'react';
import { Card, Select, InputNumber, Spin, Table, Typography, Space, Statistic, Row, Col } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../../api/client';
import { LancamentosDoMes } from '../../components/LancamentosDoMes';

const { Title } = Typography;

// A evolução usa a biblioteca de gráficos, então só é baixada quando esta tela abre.
const EvolucaoPublica = lazy(() =>
  import('../admin/VisualizarEvolucao').then((m) => ({ default: () => <m.VisualizarEvolucao publico /> }))
);

interface ResumoBloco {
  bloco_numero: string;
  adimplente: number;
  inadimplente: number; // em atraso (vencidas)
  a_vencer: number; // em aberto, ainda no prazo
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
    api.get<ResumoMensal>('/financeiro/resumo/mensal', { params: { ano, mes } }).then((res) =>
      setResumoMensal(res.data)
    );
    api.get<ResumoBloco[]>('/financeiro/resumo/blocos', { params: { ano, mes } }).then((res) =>
      setResumoBlocos(res.data)
    );
  }, [ano, mes]);

  const columns: ColumnsType<ResumoBloco> = [
    {
      title: 'Bloco',
      dataIndex: 'bloco_numero',
      filters: resumoBlocos.map((b) => ({ text: `Bloco ${b.bloco_numero}`, value: b.bloco_numero })),
      onFilter: (value, record) => record.bloco_numero === value,
    },
    { title: 'Adimplente', dataIndex: 'adimplente', render: (v: number) => `R$ ${v.toFixed(2)}` },
    { title: 'Inadimplente', dataIndex: 'inadimplente', render: (v: number) => `R$ ${v.toFixed(2)}` },
    { title: 'A vencer', dataIndex: 'a_vencer', render: (v: number) => `R$ ${v.toFixed(2)}` },
    {
      title: 'Saldo',
      dataIndex: 'saldo',
      sorter: (a, b) => a.saldo - b.saldo,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#3f8600' : '#cf1322' }}>R$ {v.toFixed(2)}</span>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Title level={4}>Financeiro do Condomínio</Title>
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
        <Table
          data-testid="tabela-resumo-blocos"
          rowKey="bloco_numero"
          columns={columns}
          dataSource={resumoBlocos}
          pagination={{ pageSize: 5 }}
        />
      </Card>

      <LancamentosDoMes ano={ano} mes={mes} />

      <Card data-testid="evolucao-do-condominio">
        <Title level={4}>Evolução do condomínio</Title>
        <Typography.Paragraph type="secondary">
          Receitas, despesas e saldo ao longo dos anos. Prestação de contas aos condôminos, sem dados individuais.
        </Typography.Paragraph>
        <Suspense fallback={<Spin style={{ display: 'block', margin: '24px auto' }} />}>
          <EvolucaoPublica />
        </Suspense>
      </Card>
    </Space>
  );
}
