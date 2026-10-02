import { useEffect, useState } from 'react';
import { Card, DatePicker, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { api } from '../../api/client';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface Registro {
  id: number;
  entidade: 'taxa' | 'despesa' | 'outra_receita' | 'configuracao' | 'apartamento' | 'acordo';
  entidade_id: number | null;
  acao: string;
  usuario_email: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  detalhe: string | null;
  criado_em: string; // UTC, "AAAA-MM-DD HH:MM:SS"
}
interface Resposta {
  total: number;
  itens: Registro[];
}

const ENTIDADES: Record<Registro['entidade'], string> = {
  taxa: 'Taxa',
  despesa: 'Despesa',
  outra_receita: 'Outra receita',
  configuracao: 'Configuração',
  apartamento: 'Apartamento',
  acordo: 'Acordo',
};
const ACOES: Record<string, { texto: string; cor: string }> = {
  criar: { texto: 'Criado', cor: 'green' },
  editar: { texto: 'Editado', cor: 'blue' },
  editar_bloco: { texto: 'Editado (bloco)', cor: 'blue' },
  pagar: { texto: 'Pagamento registrado', cor: 'cyan' },
  gerar_mes: { texto: 'Taxas geradas', cor: 'geekblue' },
  recalcular_juros: { texto: 'Juros recalculado', cor: 'purple' },
  cancelar: { texto: 'Cancelado', cor: 'red' },
  restaurar: { texto: 'Restaurado', cor: 'orange' },
};
const CAMPOS: Record<string, string> = {
  apartamento_id: 'Apartamento (id)',
  mes_referencia: 'Mês de referência',
  ano_referencia: 'Ano de referência',
  valor: 'Valor',
  juros: 'Juros',
  data_pagamento: 'Data de pagamento',
  situacao: 'Situação',
  comprovante_path: 'Comprovante',
  cancelado_em: 'Cancelado em',
  motivo_cancelamento: 'Motivo do cancelamento',
  descricao: 'Descrição',
  data: 'Data',
  multa_percentual: 'Multa (%)',
  juros_mensal_percentual: 'Juros ao mês (%)',
  dia_vencimento: 'Dia de vencimento',
  fundo_saldo_inicial: 'Saldo inicial do fundo de reserva',
  fundo_reserva: 'Paga pelo fundo de reserva (1 = sim)',
  bloco_id: 'Bloco (id)',
  fator_taxa: 'Fator da taxa',
  bloco: 'Bloco',
  apartamentos_alterados: 'Apartamentos alterados',
  apartamentos_com_fator_diferente: 'Apartamentos com fator diferente de 1',
  criadas: 'Taxas criadas',
  ignoradas: 'Ignoradas (já existiam)',
};

// Achata objetos aninhados (ex.: valor da taxa por ano) em "taxas_padrao.2026".
function achatar(objeto: Record<string, unknown> | null, prefixo = ''): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(objeto ?? {})) {
    const nome = prefixo ? `${prefixo}.${chave}` : chave;
    if (valor && typeof valor === 'object') Object.assign(saida, achatar(valor as Record<string, unknown>, nome));
    else saida[nome] = valor;
  }
  return saida;
}
const rotuloDoCampo = (campo: string) =>
  campo.startsWith('taxas_padrao.')
    ? `Taxa de ${campo.split('.')[1]}`
    : campo.startsWith('fundo_percentuais.')
      ? `Fundo de reserva (%) de ${campo.split('.')[1]}`
      : (CAMPOS[campo] ?? campo);
const mostrar = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const emHorarioLocal = (utc: string) => new Date(`${utc.replace(' ', 'T')}Z`).toLocaleString('pt-BR');

function Diferenca({ registro }: { registro: Registro }) {
  const antes = achatar(registro.antes);
  const depois = achatar(registro.depois);
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter(
    (c) => registro.antes === null || String(antes[c]) !== String(depois[c])
  );
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }} data-testid="detalhe-alteracao">
      {campos.map((c) => (
        <li key={c}>
          <strong>{rotuloDoCampo(c)}:</strong>{' '}
          {registro.antes === null ? mostrar(depois[c]) : `${mostrar(antes[c])} → ${mostrar(depois[c])}`}
        </li>
      ))}
    </ul>
  );
}

const TAMANHO_PAGINA = 20;

export function HistoricoAlteracoes() {
  const [entidade, setEntidade] = useState<string>();
  const [acao, setAcao] = useState<string>();
  const [periodo, setPeriodo] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [usuario, setUsuario] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Resposta>({ total: 0, itens: [] });
  const [carregando, setCarregando] = useState(false);

  const de = periodo?.[0]?.format('YYYY-MM-DD');
  const ate = periodo?.[1]?.format('YYYY-MM-DD');

  useEffect(() => {
    // Espera um instante ao digitar o usuário, para não consultar a cada tecla.
    const espera = setTimeout(() => {
      setCarregando(true);
      api
        .get<Resposta>('/financeiro/auditoria', {
          params: { entidade, acao, usuario: usuario || undefined, de, ate, pagina, limite: TAMANHO_PAGINA },
        })
        .then((res) => setDados(res.data))
        .finally(() => setCarregando(false));
    }, 250);
    return () => clearTimeout(espera);
  }, [entidade, acao, usuario, de, ate, pagina]);

  const colunas: ColumnsType<Registro> = [
    { title: 'Data e hora', dataIndex: 'criado_em', render: emHorarioLocal },
    { title: 'Quem', dataIndex: 'usuario_email', render: (v: string | null) => v ?? '—' },
    { title: 'O quê', dataIndex: 'entidade', render: (e: Registro['entidade']) => ENTIDADES[e] },
    {
      title: 'Ação',
      dataIndex: 'acao',
      render: (a: string) => <Tag color={ACOES[a]?.cor}>{ACOES[a]?.texto ?? a}</Tag>,
    },
    { title: 'Resumo', dataIndex: 'detalhe', render: (v: string | null) => v ?? '—' },
  ];

  return (
    <Card>
      <Title level={4}>Histórico de alterações</Title>
      <Text type="secondary">
        Registro de quem alterou o quê nos dados financeiros (taxas, despesas, outras receitas e configurações). Não pode ser editado nem apagado.
      </Text>
      <Space wrap size="middle" style={{ margin: '16px 0' }}>
        <Select
          allowClear
          placeholder="O quê"
          style={{ width: 170 }}
          value={entidade}
          onChange={(v) => { setEntidade(v); setPagina(1); }}
          options={Object.entries(ENTIDADES).map(([value, label]) => ({ value, label }))}
          data-testid="filtro-entidade"
        />
        <Select
          allowClear
          placeholder="Ação"
          style={{ width: 200 }}
          value={acao}
          onChange={(v) => { setAcao(v); setPagina(1); }}
          options={Object.entries(ACOES).map(([value, a]) => ({ value, label: a.texto }))}
          data-testid="filtro-acao"
        />
        <RangePicker
          format="DD/MM/YYYY"
          value={periodo as [Dayjs, Dayjs] | null}
          onChange={(v) => { setPeriodo(v); setPagina(1); }}
          data-testid="filtro-periodo"
        />
        <Input
          allowClear
          placeholder="Usuário (e-mail)"
          style={{ width: 220 }}
          value={usuario}
          onChange={(e) => { setUsuario(e.target.value); setPagina(1); }}
          data-testid="filtro-usuario"
        />
      </Space>
      <Table
        data-testid="tabela-historico"
        rowKey="id"
        columns={colunas}
        dataSource={dados.itens}
        loading={carregando}
        expandable={{ expandedRowRender: (r) => <Diferenca registro={r} />, rowExpandable: (r) => r.antes !== null || r.depois !== null }}
        pagination={{ current: pagina, pageSize: TAMANHO_PAGINA, total: dados.total, showSizeChanger: false, onChange: setPagina }}
        locale={{ emptyText: 'Nenhuma alteração registrada para esse filtro.' }}
      />
    </Card>
  );
}
