import { useEffect, useMemo, useState } from 'react';
import { Card, Col, InputNumber, Row, Segmented, Space, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api/client';

const { Title, Text } = Typography;

interface LinhaEvolucao {
  ano: number;
  mes: number;
  unidades: number;
  faturamento: number;
  receitas_taxas: number;
  receitas_outras: number;
  despesas: number;
  atrasadas: number;
  em_aberto: number;
  em_aberto_3_meses: number;
}

interface Ponto {
  chave: string;
  rotulo: string;
  ano: number;
  faturamento: number;
  receitas: number;
  despesas: number;
  saldo: number;
  pctAtraso: number;
  pctAberto: number;
}

// Cores categóricas (slots 1 e 2 da paleta de referência, validadas no tema claro).
const COR_RECEITAS = '#2a78d6';
const COR_DESPESAS = '#eb6834';
const COR_TEXTO = '#52514e';
const COR_GRADE = '#e6e5e1';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (v: number) => `${v.toFixed(1).replace('.', ',')}%`;
const mil = (v: number) => `${Math.round(v / 1000)} mil`;

function agrupar(linhas: LinhaEvolucao[], chave: (l: LinhaEvolucao) => string, rotulo: (l: LinhaEvolucao) => string): Ponto[] {
  const grupos = new Map<string, LinhaEvolucao[]>();
  for (const l of linhas) {
    const k = chave(l);
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  return [...grupos.entries()].map(([k, ls]) => {
    const soma = (f: (l: LinhaEvolucao) => number) => ls.reduce((s, l) => s + f(l), 0);
    const unidades = soma((l) => l.unidades);
    const receitas = soma((l) => l.receitas_taxas + l.receitas_outras);
    const despesas = soma((l) => l.despesas);
    return {
      chave: k,
      rotulo: rotulo(ls[0]),
      ano: ls[0].ano,
      faturamento: soma((l) => l.faturamento),
      receitas,
      despesas,
      saldo: receitas - despesas,
      pctAtraso: unidades ? (soma((l) => l.atrasadas) / unidades) * 100 : 0,
      pctAberto: unidades ? (soma((l) => l.em_aberto) / unidades) * 100 : 0,
    };
  });
}

interface GraficoProps {
  titulo: string;
  descricao: string;
  testId: string;
  dados: Ponto[];
  series: { chave: keyof Ponto; nome: string; cor: string }[];
  formatar: (v: number) => string;
  eixo: (v: number) => string;
}

function GraficoLinhas({ titulo, descricao, testId, dados, series, formatar, eixo }: GraficoProps) {
  return (
    <Card data-testid={testId}>
      <Title level={5} style={{ marginTop: 0 }}>{titulo}</Title>
      <Text type="secondary">{descricao}</Text>
      <div style={{ height: 320, marginTop: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={COR_GRADE} vertical={false} />
            <XAxis dataKey="rotulo" tick={{ fill: COR_TEXTO, fontSize: 12 }} tickLine={false} axisLine={{ stroke: COR_GRADE }} minTickGap={24} />
            <YAxis tick={{ fill: COR_TEXTO, fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={eixo} width={64} />
            <Tooltip formatter={(v) => formatar(Number(v))} />
            <Legend verticalAlign="top" height={32} />
            {series.map((s) => (
              <Line
                key={s.chave}
                type="monotone"
                dataKey={s.chave}
                name={s.nome}
                stroke={s.cor}
                strokeWidth={2}
                dot={dados.length <= 12 ? { r: 4, strokeWidth: 2, fill: '#fcfcfb' } : false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fcfcfb' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function VisualizarEvolucao() {
  const anoAtual = new Date().getFullYear();
  const [anoInicio, setAnoInicio] = useState(2020);
  const [anoFim, setAnoFim] = useState(anoAtual);
  const [visao, setVisao] = useState<'Mensal' | 'Anual'>('Mensal');
  const [linhas, setLinhas] = useState<LinhaEvolucao[]>([]);

  useEffect(() => {
    if (!anoInicio || !anoFim || anoInicio > anoFim) return;
    api
      .get<LinhaEvolucao[]>('/financeiro/resumo/evolucao', {
        params: { ano_inicio: anoInicio, ano_fim: anoFim },
      })
      .then((res) => setLinhas(res.data));
  }, [anoInicio, anoFim]);

  const mensal = useMemo(
    () => agrupar(linhas, (l) => `${l.ano}-${l.mes}`, (l) => `${MESES[l.mes - 1]}/${String(l.ano).slice(2)}`),
    [linhas]
  );
  const anual = useMemo(() => agrupar(linhas, (l) => String(l.ano), (l) => String(l.ano)), [linhas]);
  const pontos = visao === 'Mensal' ? mensal : anual;

  const ultimos12 = linhas.slice(-12);
  const receita12 = ultimos12.reduce((s, l) => s + l.receitas_taxas + l.receitas_outras, 0);
  const despesa12 = ultimos12.reduce((s, l) => s + l.despesas, 0);
  const saldo12 = receita12 - despesa12;
  const ultimoMes = linhas.at(-1);
  const atrasoAtual = ultimoMes ? (ultimoMes.atrasadas / ultimoMes.unidades) * 100 : 0;

  const colunas: ColumnsType<Ponto> = [
    { title: 'Ano', dataIndex: 'ano' },
    { title: 'Faturamento', dataIndex: 'faturamento', render: brl },
    { title: 'Em atraso no vencimento', dataIndex: 'pctAtraso', render: pct },
    { title: 'Em aberto hoje', dataIndex: 'pctAberto', render: pct },
    { title: 'Receitas', dataIndex: 'receitas', render: brl },
    { title: 'Despesas', dataIndex: 'despesas', render: brl },
    {
      title: 'Saldo',
      dataIndex: 'saldo',
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#3f8600' : '#cf1322' }}>{v >= 0 ? '▲' : '▼'} {brl(v)}</span>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space size="large" wrap>
          <div>
            <div>Ano inicial</div>
            <InputNumber value={anoInicio} min={2000} max={anoFim} onChange={(v) => setAnoInicio(Number(v))} data-testid="input-ano-inicio" />
          </div>
          <div>
            <div>Ano final</div>
            <InputNumber value={anoFim} min={anoInicio} onChange={(v) => setAnoFim(Number(v))} data-testid="input-ano-fim" />
          </div>
          <div>
            <div>Visão</div>
            <Segmented options={['Mensal', 'Anual']} value={visao} onChange={(v) => setVisao(v as 'Mensal' | 'Anual')} data-testid="segmented-visao" />
          </div>
        </Space>
      </Card>

      <Row gutter={[16, 16]} data-testid="cartoes-evolucao">
        <Col xs={12} md={8} xl={5}><Card><Statistic title="Receitas (12 meses)" value={brl(receita12)} /></Card></Col>
        <Col xs={12} md={8} xl={5}><Card><Statistic title="Despesas (12 meses)" value={brl(despesa12)} /></Card></Col>
        <Col xs={12} md={8} xl={5}>
          <Card>
            <Statistic
              title="Saldo (12 meses)"
              value={`${saldo12 >= 0 ? '▲' : '▼'} ${brl(saldo12)}`}
              styles={{ content: { color: saldo12 >= 0 ? '#3f8600' : '#cf1322' } }}
            />
          </Card>
        </Col>
        <Col xs={12} md={8} xl={5}><Card><Statistic title="Em atraso no último mês" value={pct(atrasoAtual)} /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card><Statistic title="Unidades com 3+ meses em aberto" value={ultimoMes?.em_aberto_3_meses ?? 0} /></Card></Col>
      </Row>

      <GraficoLinhas
        titulo="Receitas e despesas"
        descricao="Receitas = taxas pagas (com juros) + outras receitas, pelo mês de referência."
        testId="grafico-receitas-despesas"
        dados={pontos}
        series={[
          { chave: 'receitas', nome: 'Receitas', cor: COR_RECEITAS },
          { chave: 'despesas', nome: 'Despesas', cor: COR_DESPESAS },
        ]}
        formatar={brl}
        eixo={mil}
      />

      <GraficoLinhas
        titulo="Inadimplência"
        descricao="Percentual de unidades que pagaram depois do dia 10 ou ainda não pagaram, e das que seguem em aberto hoje."
        testId="grafico-inadimplencia"
        dados={pontos}
        series={[
          { chave: 'pctAtraso', nome: 'Em atraso no vencimento', cor: COR_RECEITAS },
          { chave: 'pctAberto', nome: 'Em aberto hoje', cor: COR_DESPESAS },
        ]}
        formatar={pct}
        eixo={(v) => `${v}%`}
      />

      <Card>
        <Title level={5} style={{ marginTop: 0 }}>Resumo anual</Title>
        <Table data-testid="tabela-evolucao" rowKey="chave" columns={colunas} dataSource={anual} pagination={false} />
      </Card>
    </Space>
  );
}
