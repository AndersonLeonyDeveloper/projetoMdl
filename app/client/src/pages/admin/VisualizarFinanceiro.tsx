import { useEffect, useState } from 'react';
import { Alert, Button, Card, Select, InputNumber, Table, Typography, Space, Statistic, Row, Col, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ComprovanteLink } from '../../components/ComprovanteLink';
import { LancamentosDoMes } from '../../components/LancamentosDoMes';
import { EditarTaxaModal } from '../../components/EditarTaxaModal';

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
  comprovante_path: string | null;
}

const MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export function VisualizarFinanceiro() {
  // ano, mes e apartamento_id podem vir da URL (links "Ver taxas do mês" e os meses em atraso de Dados dos Moradores).
  const [params, setParams] = useSearchParams();
  const apartamentoId = Number(params.get('apartamento_id')) || null;
  const [ano, setAno] = useState(Number(params.get('ano')) || new Date().getFullYear());
  const [mes, setMes] = useState(Number(params.get('mes')) || new Date().getMonth() + 1);
  const [resumoMensal, setResumoMensal] = useState<ResumoMensal | null>(null);
  const [resumoBlocos, setResumoBlocos] = useState<ResumoBloco[]>([]);
  const [taxas, setTaxas] = useState<Taxa[]>([]);
  const [editando, setEditando] = useState<Taxa | null>(null);
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    api.get<ResumoMensal>('/financeiro/resumo/mensal', { params: { ano, mes } }).then((res) =>
      setResumoMensal(res.data)
    );
    api.get<ResumoBloco[]>('/financeiro/resumo/blocos', { params: { ano, mes } }).then((res) =>
      setResumoBlocos(res.data)
    );
    api
      .get<Taxa[]>('/financeiro/taxas', { params: { ano, mes, apartamento_id: apartamentoId ?? undefined } })
      .then((res) => setTaxas(res.data));
  }, [ano, mes, apartamentoId, recarregar]);

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
    {
      title: 'Comprovante',
      dataIndex: 'comprovante_path',
      render: (arquivo: string | null) => <ComprovanteLink arquivo={arquivo} />,
    },
    {
      title: 'Ações',
      key: 'acoes',
      render: (_: unknown, taxa: Taxa) => (
        <Button type="link" size="small" onClick={() => setEditando(taxa)} data-testid="botao-editar-taxa">
          {taxa.situacao === 'inadimplente' ? 'Registrar pagamento' : 'Editar'}
        </Button>
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
        {apartamentoId && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            data-testid="aviso-filtro-apartamento"
            message={
              taxas.length > 0
                ? `Mostrando só as taxas do apartamento ${taxas[0].bloco_numero}/${taxas[0].apartamento_numero}.`
                : 'Mostrando só as taxas de um apartamento (nenhuma neste mês).'
            }
            action={
              <Button
                size="small"
                onClick={() => {
                  const novos = new URLSearchParams(params);
                  novos.delete('apartamento_id');
                  setParams(novos);
                }}
                data-testid="botao-limpar-filtro-apartamento"
              >
                Ver todos os apartamentos
              </Button>
            }
          />
        )}
        <Table
          data-testid="tabela-taxas"
          rowKey="id"
          columns={colunasTaxas}
          dataSource={taxas}
          pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: [5, 10, 20] }}
        />
      </Card>

      <EditarTaxaModal
        taxa={editando}
        onFechar={() => setEditando(null)}
        onSalvo={() => setRecarregar((n) => n + 1)}
      />

      <LancamentosDoMes ano={ano} mes={mes} />
    </Space>
  );
}
