import { useEffect, useState } from 'react';
import { Card, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api/client';
import { ComprovanteLink } from './ComprovanteLink';

const { Title } = Typography;

interface Lancamento {
  id: number;
  descricao: string;
  valor: number;
  data: string;
  comprovante_path: string | null;
}

const colunas: ColumnsType<Lancamento> = [
  { title: 'Data', dataIndex: 'data' },
  { title: 'Descrição', dataIndex: 'descricao' },
  { title: 'Valor', dataIndex: 'valor', render: (v: number) => `R$ ${v.toFixed(2)}` },
  {
    title: 'Comprovante',
    dataIndex: 'comprovante_path',
    render: (arquivo: string | null) => <ComprovanteLink arquivo={arquivo} />,
  },
];

function TabelaLancamentos({ titulo, rota, ano, mes, testId }: {
  titulo: string; rota: string; ano: number; mes: number; testId: string;
}) {
  const [linhas, setLinhas] = useState<Lancamento[]>([]);
  useEffect(() => {
    api.get<Lancamento[]>(rota, { params: { ano, mes } }).then((res) => setLinhas(res.data));
  }, [rota, ano, mes]);

  return (
    <Card>
      <Title level={4}>{titulo}</Title>
      <Table
        data-testid={testId}
        rowKey="id"
        columns={colunas}
        dataSource={linhas}
        pagination={{ pageSize: 5 }}
      />
    </Card>
  );
}

// Receitas e despesas do mês, com acesso ao comprovante. Usada pelos dois perfis.
export function LancamentosDoMes({ ano, mes }: { ano: number; mes: number }) {
  return (
    <>
      <TabelaLancamentos titulo="Outras receitas" rota="/financeiro/outras-receitas" ano={ano} mes={mes} testId="tabela-outras-receitas" />
      <TabelaLancamentos titulo="Despesas" rota="/financeiro/despesas" ano={ano} mes={mes} testId="tabela-despesas" />
    </>
  );
}
