import { useEffect, useState } from 'react';
import { Alert, Button, Card, Popover, Space, Table, Typography, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router-dom';
import { api, formatarMoeda } from '../../api/client';
import { useCondominio } from '../../context/CondominioContext';

const { Title } = Typography;

interface Bloco {
  id: number;
  numero: string;
}
const MESES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

interface MesEmAtraso {
  id: number;
  mes_referencia: number;
  ano_referencia: number;
  valor: number;
  dias_em_atraso: number;
  juros: number; // multa + juros até hoje, como se o pagamento fosse hoje
  total: number;
}
interface DadoMorador {
  apartamento_id: number;
  bloco: string;
  apartamento: string;
  tipo: 'proprietario' | 'inquilino' | null;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  sem_proprietario: boolean; // apartamento sem proprietário ativo (vazio ou só com inquilinos)
  // Proprietário, ou qualquer linha de apartamento sem proprietário: mensalidades vencidas e não pagas do
  // apartamento (vazia = em dia). null nas linhas de inquilino de apartamento com proprietário.
  taxas_em_atraso: MesEmAtraso[] | null;
  taxas_em_acordo: number | null; // taxas do apartamento cobertas por acordo ativo
}

// Situação das mensalidades de uma linha: Em dia, Sem proprietário ou "N em atraso" (com o detalhe ao clicar), mais a
// etiqueta "N em acordo" quando há taxas cobertas por acordo ativo.
function MensalidadesDoApartamento({ atrasos, linha }: { atrasos: DadoMorador['taxas_em_atraso']; linha: DadoMorador }) {
  const emAcordo = linha.taxas_em_acordo ?? 0;
  const etiquetaDeAcordo = emAcordo > 0 && (
    <Tag color="purple" data-testid="tag-em-acordo">{emAcordo} em acordo</Tag>
  );
  if (atrasos === null) return <>—</>;
  const situacao = (() => {
    if (atrasos.length === 0) {
      return linha.sem_proprietario ? (
        <Tag color="warning" data-testid="tag-sem-proprietario">Sem proprietário</Tag>
      ) : (
        <Tag color="success" data-testid="tag-em-dia">Em dia</Tag>
      );
    }
    const totalDevido = atrasos.reduce((soma, t) => soma + t.total, 0);
    return (
      <Popover
        trigger="click"
        title="Mensalidades em atraso"
        content={
          <div style={{ maxWidth: 360 }}>
            <ul style={{ margin: 0, paddingLeft: 18 }} data-testid="lista-meses-em-atraso">
              {atrasos.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/admin/taxas?ano=${t.ano_referencia}&mes=${t.mes_referencia}&apartamento_id=${linha.apartamento_id}`}
                    data-testid="link-taxa-em-atraso"
                  >
                    {MESES[t.mes_referencia - 1]}/{t.ano_referencia}
                  </Link>{' '}
                  · {formatarMoeda(t.valor)} + {formatarMoeda(t.juros)} = <strong>{formatarMoeda(t.total)}</strong>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 8 }} data-testid="total-devido">
              Total devido hoje: <strong>{formatarMoeda(totalDevido)}</strong>
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Juros calculados até hoje; o valor final é calculado na data do pagamento. Clique em um mês para
              abrir a taxa.
            </Typography.Text>
          </div>
        }
      >
        <Tag color="error" style={{ cursor: 'pointer' }} data-testid="tag-em-atraso">
          {atrasos.length} em atraso{linha.sem_proprietario ? ' · sem proprietário' : ''}
        </Tag>
      </Popover>
    );
  })();
  return (
    <Space size={4} wrap>
      {situacao}
      {etiquetaDeAcordo}
    </Space>
  );
}

export function VisualizarMoradores() {
  const { agrupador, unidade } = useCondominio();
  const [dados, setDados] = useState<DadoMorador[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [soSemProprietario, setSoSemProprietario] = useState(false);

  useEffect(() => {
    api.get<DadoMorador[]>('/dados-moradores').then((res) => setDados(res.data));
    api.get<Bloco[]>('/blocos').then((res) => setBlocos(res.data));
  }, []);

  const columns: ColumnsType<DadoMorador> = [
    {
      title: agrupador.S,
      dataIndex: 'bloco',
      filters: blocos.map((b) => ({ text: `${agrupador.S} ${b.numero}`, value: b.numero })),
      onFilter: (value, record) => record.bloco === value,
      sorter: (a, b) => a.bloco.localeCompare(b.bloco, 'pt-BR', { numeric: true }),
    },
    {
      title: unidade.S,
      dataIndex: 'apartamento',
      sorter: (a, b) => a.apartamento.localeCompare(b.apartamento, 'pt-BR', { numeric: true }),
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
      render: (atrasos: DadoMorador['taxas_em_atraso'], linha: DadoMorador) => (
        <MensalidadesDoApartamento atrasos={atrasos} linha={linha} />
      ),
    },
  ];

  // Apartamentos sem proprietário ativo: vazios e só com inquilinos (cada apartamento conta uma vez).
  const semDono = new Map<number, DadoMorador[]>();
  dados.filter((d) => d.sem_proprietario).forEach((d) => semDono.set(d.apartamento_id, [...(semDono.get(d.apartamento_id) ?? []), d]));
  const vazios = [...semDono.values()].filter((linhas) => linhas.every((l) => l.tipo === null)).length;
  const comAtraso = [...semDono.values()].filter((linhas) => (linhas[0].taxas_em_atraso?.length ?? 0) > 0);
  const totalDevido = comAtraso.reduce(
    (soma, linhas) => soma + (linhas[0].taxas_em_atraso ?? []).reduce((s, t) => s + t.total, 0),
    0
  );
  const linhasVisiveis = soSemProprietario ? dados.filter((d) => d.sem_proprietario) : dados;

  return (
    <Card>
      <Title level={4}>Dados dos Moradores</Title>
      {semDono.size > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          data-testid="aviso-sem-proprietario"
          message={`${semDono.size} ${unidade.s}(s) sem proprietário (${vazios} vazio(s), ${semDono.size - vazios} só com inquilinos).`}
          description={
            comAtraso.length > 0
              ? `${comAtraso.length} ${unidade.o === 'a' ? 'delas' : 'deles'} com mensalidades em atraso (total devido hoje: ${formatarMoeda(totalDevido)}).`
              : undefined
          }
          action={
            <Button size="small" onClick={() => setSoSemProprietario((v) => !v)} data-testid="botao-filtrar-sem-proprietario">
              {soSemProprietario ? 'Mostrar todos' : 'Mostrar apenas esses'}
            </Button>
          }
        />
      )}
      <Table
        data-testid="tabela-visualizar-moradores"
        rowKey={(r) => `${r.bloco}-${r.apartamento}-${r.tipo}-${r.email}`}
        columns={columns}
        dataSource={linhasVisiveis}
        pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: [5, 10, 20] }}
      />
    </Card>
  );
}
