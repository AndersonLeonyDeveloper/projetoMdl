import { useEffect, useState } from 'react';
import { Card, Select, InputNumber, Table, Typography, Space, Statistic, Row, Col, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../../api/client';

const { Title } = Typography;

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
interface Taxa {
  id: number;
  bloco_numero: string;
  apartamento_numero: string;
  mes_referencia: number;
  ano_referencia: number;
  valor: number;
  juros: number;
  situacao: 'adimplente' | 'inadimplente';
  meses_atraso: number;
  data_pagamento: string | null;
}

const MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export function VisualizarFinanceiro() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [resumoMensal, setResumoMensal] = useState<ResumoMensal | null>(null);
  const [resumoBlocos, setResumoBlocos] = useState<ResumoBloco[]>([]);
  const [taxas, setTaxas] = useState<Taxa[]>([]);

  useEffect(() => {
    api.get<ResumoMensal>('/financeiro/resumo/mensal', { params: { ano, mes } }).then((res) =>
      setResumoMensal(res.data)
    );
    api.get<ResumoBloco[]>('/financeiro/resumo/blocos', { params: { ano, mes } }).then((res) =>
      setResumoBlocos(res.data)
    );
    api.get<Taxa[]>('/financeiro/taxas', { params: { ano, mes } }).then((res) => setTaxas(res.data));
  }, [ano, mes]);

  const colunasBlocos: ColumnsType<ResumoBloco> = [
    { title: 'Bloco', dataIndex: 'bloco_numero' },
    { title: 'Adimplente', dataIndex: 'adimplente', render: (v: number) => `R$ ${v.toFixed(2)}` },
    { title: 'Inadimplente', dataIndex: 'inadimplente', render: (v: number) => `R$ ${v.toFixed(2)}` },
    {
      title: 'Saldo',
      dataIndex: 'saldo',
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#3f8600' : '#cf1322' }}>R$ {v.toFixed(2)}</span>
      ),
    },
  ];

  const colunasTaxas: ColumnsType<Taxa> = [
    {
      title: 'Bloco',
      dataIndex: 'bloco_numero',
      filters: [...new Set(taxas.map((t) => t.bloco_numero))].map((b) => ({ text: `Bloco ${b}`, value: b })),
      onFilter: (value, record) => record.bloco_numero === value,
    },
    { title: 'Apartamento', dataIndex: 'apartamento_numero' },
    {
      title: 'Situação',
      dataIndex: 'situacao',
      filters: [
        { text: 'Adimplente', value: 'adimplente' },
        { text: 'Inadimplente', value: 'inadimplente' },
      ],
      onFilter: (value, record) => record.situacao === value,
      render: (situacao: Taxa['situacao']) => (
        <Tag color={situacao === 'adimplente' ? 'success' : 'error'}>{situacao}</Tag>
      ),
    },
    { title: 'Valor', dataIndex: 'valor', render: (v: number) => `R$ ${v.toFixed(2)}` },
    { title: 'Juros', dataIndex: 'juros', render: (v: number) => `R$ ${v.toFixed(2)}` },
    { title: 'Meses em atraso', dataIndex: 'meses_atraso' },
    { title: 'Data pagamento', dataIndex: 'data_pagamento', render: (v: string | null) => v ?? '—' },
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
        <Table
          data-testid="tabela-resumo-blocos"
          rowKey="bloco_numero"
          columns={colunasBlocos}
          dataSource={resumoBlocos}
          pagination={false}
        />
      </Card>

      <Card>
        <Title level={4}>Lançamentos de taxa de condomínio</Title>
        <Table
          data-testid="tabela-taxas"
          rowKey="id"
          columns={colunasTaxas}
          dataSource={taxas}
          pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: [5, 10, 20] }}
        />
      </Card>
    </Space>
  );
}
