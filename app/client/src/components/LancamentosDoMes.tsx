import { useEffect, useState } from 'react';
import { Button, Card, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api/client';
import { CancelarRestaurar } from './CancelarRestaurar';
import { ComprovanteLink } from './ComprovanteLink';
import { EditarLancamentoModal, type Lancamento } from './EditarLancamentoModal';
import { useAuth } from '../context/AuthContext';

const { Title } = Typography;

const colunas: ColumnsType<Lancamento> = [
  { title: 'Data', dataIndex: 'data' },
  {
    title: 'Descrição',
    dataIndex: 'descricao',
    render: (v: string, linha: Lancamento) =>
      linha.cancelado_em ? (
        <Tooltip title={`Motivo: ${linha.motivo_cancelamento ?? '—'}`}>
          <span>
            <Tag color="default" data-testid="tag-cancelado">Cancelado</Tag>
            <span style={{ textDecoration: 'line-through' }}>{v}</span>
          </span>
        </Tooltip>
      ) : (
        <span>
          {linha.fundo_reserva === 1 && <Tag color="gold" data-testid="tag-fundo">Fundo</Tag>}
          {v}
        </span>
      ),
  },
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
  // Só despesas têm bloco: "Geral" (dividida entre os blocos) ou o bloco da despesa.
  const colunasBase: ColumnsType<Lancamento> =
    rota === 'despesas'
      ? [
          ...colunas.slice(0, 2),
          {
            title: 'Bloco',
            dataIndex: 'bloco_numero',
            render: (v: string | null | undefined) => (v ? `Bloco ${v}` : 'Geral'),
          },
          ...colunas.slice(2),
        ]
      : colunas;
  const { usuario } = useAuth();
  const [linhas, setLinhas] = useState<Lancamento[]>([]);
  const [editando, setEditando] = useState<Lancamento | null>(null);
  const [recarregar, setRecarregar] = useState(0);
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  const ehAdmin = usuario?.role === 'admin';
  useEffect(() => {
    api
      .get<Lancamento[]>(`/financeiro/${rota}`, { params: { ano, mes, incluir_cancelados: ehAdmin && mostrarCancelados ? 'true' : undefined } })
      .then((res) => setLinhas(res.data));
  }, [rota, ano, mes, recarregar, ehAdmin, mostrarCancelados]);

  // Só o admin edita; o morador vê a lista sem a coluna de ações.
  const colunasVisiveis: ColumnsType<Lancamento> =
    ehAdmin
      ? [
          ...colunasBase,
          {
            title: 'Ações',
            key: 'acoes',
            render: (_: unknown, linha: Lancamento) => (
              <Space size={0}>
                <Button type="link" size="small" disabled={!!linha.cancelado_em} onClick={() => setEditando(linha)} data-testid="botao-editar-lancamento">
                  Editar
                </Button>
                <CancelarRestaurar
                  rota={rota as 'despesas' | 'outras-receitas'}
                  id={linha.id}
                  cancelado={!!linha.cancelado_em}
                  rotulo={rotulo.toLowerCase()}
                  onAlterado={() => setRecarregar((n) => n + 1)}
                />
              </Space>
            ),
          },
        ]
      : colunasBase;

  return (
    <Card>
      <Title level={4}>{titulo}</Title>
      {ehAdmin && (
        <Space style={{ marginBottom: 12 }}>
          <Switch size="small" checked={mostrarCancelados} onChange={setMostrarCancelados} data-testid="switch-mostrar-cancelados" />
          Mostrar cancelados
        </Space>
      )}
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
