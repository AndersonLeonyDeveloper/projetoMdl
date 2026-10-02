import { useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Space, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api, formatarMoeda } from '../api/client';

const { Title, Paragraph, Text } = Typography;

interface Movimento {
  ano: number;
  mes: number;
  aportes: number;
  retiradas: number;
  saldo: number; // acumulado ao fim do mês
}
interface Obra {
  id: number;
  descricao: string;
  valor: number;
  data: string;
  bloco_numero: string | null;
}
interface Fundo {
  saldo_inicial: number;
  aportes_total: number;
  retiradas_total: number;
  saldo_atual: number;
  percentuais: { ano: number; percentual: number }[];
  movimentos: Movimento[];
  obras: Obra[];
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Fundo de reserva: saldo, aportes (percentual da taxa paga) e retiradas (despesas pagas pelo fundo). Usada por todos os perfis.
export function FundoDeReserva() {
  const [fundo, setFundo] = useState<Fundo | null>(null);

  useEffect(() => {
    api.get<Fundo>('/financeiro/fundo-reserva').then((res) => setFundo(res.data));
  }, []);

  const porAno = useMemo(() => {
    const anos = new Map<number, { ano: number; aportes: number; retiradas: number; saldo: number }>();
    for (const m of fundo?.movimentos ?? []) {
      const atual = anos.get(m.ano) ?? { ano: m.ano, aportes: 0, retiradas: 0, saldo: 0 };
      anos.set(m.ano, { ano: m.ano, aportes: atual.aportes + m.aportes, retiradas: atual.retiradas + m.retiradas, saldo: m.saldo });
    }
    return [...anos.values()].sort((a, b) => b.ano - a.ano);
  }, [fundo]);

  if (!fundo) return null;

  const colunasAno: ColumnsType<(typeof porAno)[number]> = [
    { title: 'Ano', dataIndex: 'ano' },
    { title: 'Aportes', dataIndex: 'aportes', render: formatarMoeda },
    { title: 'Retiradas', dataIndex: 'retiradas', render: formatarMoeda },
    { title: 'Saldo no fim do ano', dataIndex: 'saldo', render: formatarMoeda },
  ];
  const colunasMes: ColumnsType<Movimento> = [
    { title: 'Mês', key: 'mes', render: (_: unknown, m) => `${MESES[m.mes - 1]}/${m.ano}` },
    { title: 'Aportes', dataIndex: 'aportes', render: formatarMoeda },
    { title: 'Retiradas', dataIndex: 'retiradas', render: formatarMoeda },
    { title: 'Saldo acumulado', dataIndex: 'saldo', render: formatarMoeda },
  ];
  const colunasObras: ColumnsType<Obra> = [
    { title: 'Data', dataIndex: 'data' },
    { title: 'Obra ou despesa', dataIndex: 'descricao' },
    { title: 'Bloco', dataIndex: 'bloco_numero', render: (v: string | null) => (v ? `Bloco ${v}` : 'Geral') },
    { title: 'Valor', dataIndex: 'valor', render: formatarMoeda },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Title level={4}>Fundo de reserva</Title>
        <Paragraph type="secondary">
          Cada taxa paga reserva uma parte do seu valor (sem juros) para o fundo, no mês do pagamento. As obras e despesas
          marcadas como pagas pelo fundo saem do saldo. O fundo é uma parte do dinheiro do condomínio, e não um valor a mais.
        </Paragraph>
        <Row gutter={[16, 16]} data-testid="cartoes-fundo">
          <Col xs={12} md={6}><Statistic title="Saldo atual" value={formatarMoeda(fundo.saldo_atual)} valueStyle={{ color: fundo.saldo_atual >= 0 ? '#3f8600' : '#cf1322' }} data-testid="saldo-fundo" /></Col>
          <Col xs={12} md={6}><Statistic title="Saldo inicial" value={formatarMoeda(fundo.saldo_inicial)} /></Col>
          <Col xs={12} md={6}><Statistic title="Aportes (total)" value={formatarMoeda(fundo.aportes_total)} /></Col>
          <Col xs={12} md={6}><Statistic title="Retiradas (total)" value={formatarMoeda(fundo.retiradas_total)} /></Col>
        </Row>
        <Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
          <Text type="secondary" data-testid="percentuais-fundo">
            Percentual da taxa por ano: {fundo.percentuais.map((p) => `${p.ano}: ${p.percentual}%`).join(' · ')}
          </Text>
        </Paragraph>
      </Card>

      <Card>
        <Title level={5}>Obras e despesas pagas com o fundo</Title>
        <Table
          data-testid="tabela-obras-fundo"
          rowKey="id"
          columns={colunasObras}
          dataSource={fundo.obras}
          pagination={{ pageSize: 5 }}
          locale={{ emptyText: 'Nenhuma despesa foi paga com o fundo.' }}
        />
      </Card>

      <Card>
        <Title level={5}>Resumo por ano</Title>
        <Table data-testid="tabela-fundo-ano" rowKey="ano" columns={colunasAno} dataSource={porAno} pagination={false} />
      </Card>

      <Card>
        <Title level={5}>Movimento mensal</Title>
        <Table
          data-testid="tabela-fundo-mes"
          rowKey={(m) => `${m.ano}-${m.mes}`}
          columns={colunasMes}
          dataSource={[...fundo.movimentos].reverse()}
          pagination={{ pageSize: 12, showSizeChanger: false }}
        />
      </Card>
    </Space>
  );
}
