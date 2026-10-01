import { useEffect, useState } from 'react';
import { Card, Table, Typography, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../../api/client';

const { Title } = Typography;

interface Bloco {
  id: number;
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
