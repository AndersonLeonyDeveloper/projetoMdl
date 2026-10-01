import { useEffect, useState } from 'react';
import { Card, InputNumber, Table, Typography, Statistic, Row, Col, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../../api/client';

const { Title } = Typography;

interface LinhaInadimplencia {
  mes_referencia: number;
  adimplente: number;
  inadimplente: number;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function VisualizarInadimplencia() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [linhas, setLinhas] = useState<LinhaInadimplencia[]>([]);

  useEffect(() => {
    api.get<LinhaInadimplencia[]>('/financeiro/resumo/inadimplencia', { params: { ano } }).then(
      (res) => setLinhas(res.data)
    );
  }, [ano]);

  const totalAdimplente = linhas.reduce((acc, l) => acc + l.adimplente, 0);
  const totalInadimplente = linhas.reduce((acc, l) => acc + l.inadimplente, 0);

  const columns: ColumnsType<LinhaInadimplencia> = [
    { title: 'Mês', dataIndex: 'mes_referencia', render: (m: number) => MESES[m - 1] },
    { title: 'Adimplente', dataIndex: 'adimplente', render: (v: number) => `R$ ${v.toFixed(2)}` },
    { title: 'Inadimplente', dataIndex: 'inadimplente', render: (v: number) => `R$ ${v.toFixed(2)}` },
  ];

  return (
    <Card>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <div>Ano</div>
          <InputNumber value={ano} onChange={(v) => setAno(Number(v))} data-testid="input-ano" />
        </div>
        <Row gutter={32}>
          <Col>
            <Statistic
              title="Total Adimplente"
              prefix="R$"
              value={totalAdimplente.toFixed(2)}
              valueStyle={{ color: '#3f8600' }}
            />
          </Col>
          <Col>
            <Statistic
              title="Total Inadimplente"
              prefix="R$"
              value={totalInadimplente.toFixed(2)}
              valueStyle={{ color: '#cf1322' }}
            />
          </Col>
        </Row>
        <Title level={4}>Taxa de Inadimplência {ano}</Title>
        <Table
          data-testid="tabela-inadimplencia"
          rowKey="mes_referencia"
          columns={columns}
          dataSource={linhas}
          pagination={false}
        />
      </Space>
    </Card>
  );
}
