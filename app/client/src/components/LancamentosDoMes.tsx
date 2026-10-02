import { useEffect, useState } from 'react';
import { Button, Card, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api/client';
import { ComprovanteLink } from './ComprovanteLink';
import { EditarLancamentoModal, type Lancamento } from './EditarLancamentoModal';
import { useAuth } from '../context/AuthContext';

const { Title } = Typography;

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

function TabelaLancamentos({ titulo, rotulo, rota, ano, mes, testId }: {
  titulo: string; rotulo: string; rota: string; ano: number; mes: number; testId: string;
}) {
  const { usuario } = useAuth();
  const [linhas, setLinhas] = useState<Lancamento[]>([]);
  const [editando, setEditando] = useState<Lancamento | null>(null);
  const [recarregar, setRecarregar] = useState(0);
  useEffect(() => {
    api.get<Lancamento[]>(`/financeiro/${rota}`, { params: { ano, mes } }).then((res) => setLinhas(res.data));
  }, [rota, ano, mes, recarregar]);

  // Só o admin edita; o morador vê a lista sem a coluna de ações.
  const colunasVisiveis: ColumnsType<Lancamento> =
    usuario?.role === 'admin'
      ? [
          ...colunas,
          {
            title: 'Ações',
            key: 'acoes',
            render: (_: unknown, linha: Lancamento) => (
              <Button type="link" size="small" onClick={() => setEditando(linha)} data-testid="botao-editar-lancamento">
                Editar
              </Button>
            ),
          },
        ]
      : colunas;

  return (
    <Card>
      <Title level={4}>{titulo}</Title>
      <Table
        data-testid={testId}
        rowKey="id"
        columns={colunasVisiveis}
        dataSource={linhas}
        pagination={{ pageSize: 5 }}
      />
      <EditarLancamentoModal
        rota={rota}
        rotulo={rotulo}
        lancamento={editando}
        onFechar={() => setEditando(null)}
        onSalvo={() => setRecarregar((n) => n + 1)}
      />
    </Card>
  );
}

// Receitas e despesas do mês, com acesso ao comprovante. Usada pelos dois perfis.
export function LancamentosDoMes({ ano, mes }: { ano: number; mes: number }) {
  return (
    <>
      <TabelaLancamentos titulo="Outras receitas" rotulo="Receita" rota="outras-receitas" ano={ano} mes={mes} testId="tabela-outras-receitas" />
      <TabelaLancamentos titulo="Despesas" rotulo="Despesa" rota="despesas" ano={ano} mes={mes} testId="tabela-despesas" />
    </>
  );
}
