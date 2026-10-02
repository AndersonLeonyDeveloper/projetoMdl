import { useEffect, useState } from 'react';
import { Card, Popover, Table, Typography, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../../api/client';

const { Title } = Typography;

interface Bloco {
  id: number;
  numero: string;
}
const MESES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

interface MesEmAtraso {
  mes_referencia: number;
  ano_referencia: number;
}
interface DadoMorador {
  bloco: string;
  apartamento: string;
  tipo: 'proprietario' | 'inquilino' | null;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  // Só nas linhas de proprietário: mensalidades vencidas e não pagas (vazia = em dia). null nas demais.
  taxas_em_atraso: MesEmAtraso[] | null;
}

export function VisualizarMoradores() {
  const [dados, setDados] = useState<DadoMorador[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);

  useEffect(() => {
    api.get<DadoMorador[]>('/dados-moradores').then((res) => setDados(res.data));
    api.get<Bloco[]>('/blocos').then((res) => setBlocos(res.data));
  }, []);

  const columns: ColumnsType<DadoMorador> = [
    {
      title: 'Bloco',
      dataIndex: 'bloco',
      filters: blocos.map((b) => ({ text: `Bloco ${b.numero}`, value: b.numero })),
      onFilter: (value, record) => record.bloco === value,
      sorter: (a, b) => a.bloco.localeCompare(b.bloco),
    },
    {
      title: 'Apartamento',
      dataIndex: 'apartamento',
      sorter: (a, b) => a.apartamento.localeCompare(b.apartamento),
    },
    {
      title: 'Tipo',
      dataIndex: 'tipo',
      filters: [
        { text: 'Proprietário', value: 'proprietario' },
        { text: 'Inquilino', value: 'inquilino' },
      ],
      onFilter: (value, record) => record.tipo === value,
      render: (tipo: DadoMorador['tipo']) =>
        tipo ? <Tag color={tipo === 'proprietario' ? 'blue' : 'green'}>{tipo}</Tag> : <Tag>vazio</Tag>,
    },
    { title: 'Nome', dataIndex: 'nome', render: (v) => v ?? '—' },
    { title: 'Telefone', dataIndex: 'telefone', render: (v) => v ?? '—' },
    { title: 'E-mail', dataIndex: 'email', render: (v) => v ?? '—' },
    {
      title: 'Mensalidades',
      dataIndex: 'taxas_em_atraso',
      sorter: (a, b) => (a.taxas_em_atraso?.length ?? -1) - (b.taxas_em_atraso?.length ?? -1),
      filters: [
        { text: 'Em atraso', value: 'atraso' },
        { text: 'Em dia', value: 'dia' },
      ],
      onFilter: (value, record) =>
        record.taxas_em_atraso !== null &&
        (value === 'atraso' ? record.taxas_em_atraso.length > 0 : record.taxas_em_atraso.length === 0),
      render: (atrasos: DadoMorador['taxas_em_atraso']) => {
        if (atrasos === null) return '—';
        if (atrasos.length === 0) return <Tag color="success" data-testid="tag-em-dia">Em dia</Tag>;
        return (
          <Popover
            trigger="click"
            title="Mensalidades em atraso"
            content={
              <ul style={{ margin: 0, paddingLeft: 18 }} data-testid="lista-meses-em-atraso">
                {atrasos.map((t) => (
                  <li key={`${t.ano_referencia}-${t.mes_referencia}`}>
                    {MESES[t.mes_referencia - 1]}/{t.ano_referencia}
                  </li>
                ))}
              </ul>
            }
          >
            <Tag color="error" style={{ cursor: 'pointer' }} data-testid="tag-em-atraso">
              {atrasos.length} em atraso
            </Tag>
          </Popover>
        );
      },
    },
  ];

  return (
    <Card>
      <Title level={4}>Dados dos Moradores</Title>
      <Table
        data-testid="tabela-visualizar-moradores"
        rowKey={(r) => `${r.bloco}-${r.apartamento}-${r.tipo}-${r.email}`}
        columns={columns}
        dataSource={dados}
        pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: [5, 10, 20] }}
      />
    </Card>
  );
}
