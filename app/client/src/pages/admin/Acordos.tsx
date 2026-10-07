import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Button, Card, DatePicker, Descriptions, Drawer, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { api, formatarMoeda, mensagemDeErro } from '../../api/client';
import { useCondominio } from '../../context/CondominioContext';

const { Title, Paragraph } = Typography;

type StatusAcordo = 'ativo' | 'quitado' | 'descumprido' | 'cancelado';
interface Acordo {
  id: number;
  apartamento_id: number;
  bloco_numero: string;
  apartamento_numero: string;
  status: StatusAcordo;
  valor_total: number;
  desconto: number;
  entrada: number;
  total_parcelas: number;
  parcelas_pagas: number;
  valor_pago: number;
  proximo_vencimento: string | null;
  criado_em: string;
  encerrado_em: string | null;
}
interface Parcela {
  id: number;
  numero: number;
  vencimento: string;
  valor: number;
  data_pagamento: string | null;
}
interface TaxaDoAcordo {
  id: number;
  mes_referencia: number;
  ano_referencia: number;
  valor: number;
  juros_calculado: number;
}
interface Detalhe extends Acordo {
  observacao: string | null;
  motivo_cancelamento: string | null;
  carencia_dias: number;
  valor_taxas: number;
  juros: number;
  taxas: TaxaDoAcordo[];
  parcelas: Parcela[];
}
interface Elegivel {
  id: number;
  mes_referencia: number;
  ano_referencia: number;
  valor: number;
  juros: number;
  dias_em_atraso: number;
  total: number;
}
interface Simulacao {
  valor_taxas: number;
  juros: number;
  desconto: number;
  valor_total: number;
  entrada: number;
  parcelas: { numero: number; vencimento: string; valor: number }[];
}
interface Bloco {
  id: number;
  numero: string;
}
interface Apartamento {
  id: number;
  bloco_id: number;
  numero: string;
}

const STATUS: Record<StatusAcordo, { cor: string; texto: string }> = {
  ativo: { cor: 'processing', texto: 'Ativo' },
  quitado: { cor: 'success', texto: 'Quitado' },
  descumprido: { cor: 'error', texto: 'Descumprido' },
  cancelado: { cor: 'default', texto: 'Cancelado' },
};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const data = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const dataHora = (utc: string) => new Date(`${utc.replace(' ', 'T')}Z`).toLocaleString('pt-BR');
const mesAno = (t: { mes_referencia: number; ano_referencia: number }) => `${MESES[t.mes_referencia - 1]}/${t.ano_referencia}`;

// ---------- Novo acordo ----------

function NovoAcordoModal({ aberto, onFechar, onCriado }: { aberto: boolean; onFechar: () => void; onCriado: () => void }) {
  const { agrupador, unidade } = useCondominio();
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [apartamentos, setApartamentos] = useState<Apartamento[]>([]);
  const [blocoId, setBlocoId] = useState<number>();
  const [apartamentoId, setApartamentoId] = useState<number>();
  const [elegiveis, setElegiveis] = useState<Elegivel[]>([]);
  const [selecionadas, setSelecionadas] = useState<number[]>([]);
  const [parcelas, setParcelas] = useState<number | null>(6);
  const [primeiroVencimento, setPrimeiroVencimento] = useState(dayjs().add(30, 'day'));
  const [entrada, setEntrada] = useState<number | null>(0);
  const [desconto, setDesconto] = useState<number | null>(0);
  const [observacao, setObservacao] = useState('');
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) api.get<Bloco[]>('/blocos').then((res) => setBlocos(res.data));
  }, [aberto]);

  function escolherBloco(id: number) {
    setBlocoId(id);
    setApartamentoId(undefined);
    setElegiveis([]);
    setSelecionadas([]);
    api.get<Apartamento[]>('/apartamentos', { params: { bloco_id: id } }).then((res) => setApartamentos(res.data));
  }

  function escolherApartamento(id: number) {
    setApartamentoId(id);
    api.get<Elegivel[]>('/financeiro/acordos/elegiveis', { params: { apartamento_id: id } }).then((res) => {
      setElegiveis(res.data);
      setSelecionadas(res.data.map((t) => t.id));
    });
  }

  const corpo = {
    apartamento_id: apartamentoId,
    taxa_ids: selecionadas,
    parcelas,
    primeiro_vencimento: primeiroVencimento.format('YYYY-MM-DD'),
    entrada: entrada ?? 0,
    desconto: desconto ?? 0,
    observacao,
  };
  const chave = JSON.stringify(corpo);

  // Refaz a simulação sempre que algo muda (com uma pequena espera ao digitar).
  useEffect(() => {
    if (!aberto || !apartamentoId || selecionadas.length === 0) return;
    const espera = setTimeout(() => {
      api
        .post<Simulacao>('/financeiro/acordos/simular', JSON.parse(chave))
        .then((res) => {
          setSimulacao(res.data);
          setErro(null);
        })
        .catch((err) => {
          setSimulacao(null);
          setErro(mensagemDeErro(err, 'Não foi possível simular o acordo.'));
        });
    }, 300);
    return () => clearTimeout(espera);
  }, [aberto, apartamentoId, selecionadas.length, chave]);

  async function criar() {
    setSalvando(true);
    try {
      await api.post('/financeiro/acordos', corpo);
      message.success('Acordo criado.');
      onCriado();
      onFechar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Erro ao criar o acordo.'));
    } finally {
      setSalvando(false);
    }
  }

  const colunas: ColumnsType<Elegivel> = [
    { title: 'Mês', key: 'mes', render: (_: unknown, t) => mesAno(t) },
    { title: 'Valor', dataIndex: 'valor', render: formatarMoeda },
    { title: 'Dias em atraso', dataIndex: 'dias_em_atraso' },
    { title: 'Multa e juros até hoje', dataIndex: 'juros', render: formatarMoeda },
    { title: 'Total', dataIndex: 'total', render: formatarMoeda },
  ];

  return (
    <Modal
      title="Novo acordo"
      open={aberto}
      onCancel={onFechar}
      onOk={criar}
      okText="Criar acordo"
      cancelText="Cancelar"
      okButtonProps={{ disabled: !simulacao || !!erro }}
      confirmLoading={salvando}
      width={760}
      destroyOnHidden
      data-testid="modal-novo-acordo"
    >
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 130 }}
          placeholder={agrupador.S}
          value={blocoId}
          onChange={escolherBloco}
          options={blocos.map((b) => ({ value: b.id, label: `${agrupador.S} ${b.numero}` }))}
          data-testid="select-acordo-bloco"
        />
        <Select
          style={{ width: 160 }}
          placeholder={unidade.S}
          value={apartamentoId}
          onChange={escolherApartamento}
          disabled={!blocoId}
          options={apartamentos.map((a) => ({ value: a.id, label: `${unidade.S} ${a.numero}` }))}
          data-testid="select-acordo-apartamento"
        />
      </Space>

      {apartamentoId && elegiveis.length === 0 && (
        <Alert type="info" showIcon message={`${unidade.este[0].toUpperCase()}${unidade.este.slice(1)} ${unidade.s} não tem taxas em atraso disponíveis para acordo.`} />
      )}
      {elegiveis.length > 0 && (
        <>
          <Paragraph type="secondary">Escolha as taxas em atraso que entram no acordo (por padrão, todas).</Paragraph>
          <Table
            data-testid="tabela-taxas-elegiveis"
            rowKey="id"
            size="small"
            columns={colunas}
            dataSource={elegiveis}
            pagination={false}
            rowSelection={{ selectedRowKeys: selecionadas, onChange: (chaves) => setSelecionadas(chaves as number[]) }}
          />
          <Space wrap align="start" style={{ margin: '16px 0' }}>
            <div>
              <div>Nº de parcelas</div>
              <InputNumber min={1} max={60} precision={0} value={parcelas} onChange={setParcelas} data-testid="input-acordo-parcelas" />
            </div>
            <div>
              <div>Primeiro vencimento</div>
              <DatePicker
                format="DD/MM/YYYY"
                value={primeiroVencimento}
                allowClear={false}
                disabledDate={(d) => d.isBefore(dayjs(), 'day')}
                onChange={(d) => d && setPrimeiroVencimento(d)}
                data-testid="input-acordo-vencimento"
              />
            </div>
            <div>
              <div>Entrada (R$)</div>
              <InputNumber min={0} step={0.01} prefix="R$" value={entrada} onChange={setEntrada} data-testid="input-acordo-entrada" />
            </div>
            <div>
              <div>Desconto (R$)</div>
              <InputNumber min={0} step={0.01} prefix="R$" value={desconto} onChange={setDesconto} data-testid="input-acordo-desconto" />
            </div>
          </Space>
          <Input.TextArea
            placeholder="Observação (opcional)"
            maxLength={300}
            showCount
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            data-testid="input-acordo-observacao"
          />
        </>
      )}

      {erro && <Alert type="error" showIcon message={erro} style={{ marginTop: 16 }} data-testid="erro-acordo" />}
      {simulacao && !erro && (
        <Card size="small" style={{ marginTop: 16 }} data-testid="simulacao-acordo">
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="Valor das taxas">{formatarMoeda(simulacao.valor_taxas)}</Descriptions.Item>
            <Descriptions.Item label="Multa e juros até hoje">{formatarMoeda(simulacao.juros)}</Descriptions.Item>
            <Descriptions.Item label="Desconto">{formatarMoeda(simulacao.desconto)}</Descriptions.Item>
            <Descriptions.Item label="Total do acordo"><strong data-testid="total-acordo">{formatarMoeda(simulacao.valor_total)}</strong></Descriptions.Item>
          </Descriptions>
          <Table
            size="small"
            rowKey="numero"
            pagination={false}
            dataSource={simulacao.parcelas}
            columns={[
              { title: 'Parcela', dataIndex: 'numero', render: (n: number) => (n === 0 ? 'Entrada' : n) },
              { title: 'Vencimento', dataIndex: 'vencimento', render: data },
              { title: 'Valor', dataIndex: 'valor', render: formatarMoeda },
            ]}
            scroll={{ y: 180 }}
          />
        </Card>
      )}
    </Modal>
  );
}

// ---------- Detalhe ----------

function DetalheDoAcordo({ id, onFechar, onAlterado }: { id: number | null; onFechar: () => void; onAlterado: () => void }) {
  const { rotuloDaUnidade } = useCondominio();
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [versao, setVersao] = useState(0);
  const [pagando, setPagando] = useState<Parcela | null>(null);
  const [dataPagamento, setDataPagamento] = useState(dayjs());
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (id === null) return;
    api.get<Detalhe>(`/financeiro/acordos/${id}`).then((res) => setDetalhe(res.data));
  }, [id, versao]);

  function recarregar() {
    setVersao((v) => v + 1);
    onAlterado();
  }

  async function registrarPagamento() {
    if (!pagando || !detalhe) return;
    try {
      await api.post(`/financeiro/acordos/${detalhe.id}/parcelas/${pagando.id}/pagamento`, {
        data_pagamento: dataPagamento.format('YYYY-MM-DD'),
      });
      message.success('Pagamento registrado.');
      setPagando(null);
      recarregar();
    } catch (err) {
      message.error(mensagemDeErro(err, 'Não foi possível registrar o pagamento.'));
    }
  }

  async function cancelarAcordo() {
    if (!detalhe) return;
    try {
      await api.post(`/financeiro/acordos/${detalhe.id}/cancelar`, { motivo });
      message.success('Acordo cancelado.');
      setCancelando(false);
      setMotivo('');
      recarregar();
    } catch (err) {
      message.error(mensagemDeErro(err, 'Não foi possível cancelar o acordo.'));
    }
  }

  const aceitaPagamento = detalhe && ['ativo', 'descumprido'].includes(detalhe.status);
  const colunasParcelas: ColumnsType<Parcela> = [
    { title: 'Parcela', dataIndex: 'numero', render: (n: number) => (n === 0 ? 'Entrada' : n) },
    { title: 'Vencimento', dataIndex: 'vencimento', render: data },
    { title: 'Valor', dataIndex: 'valor', render: formatarMoeda },
    { title: 'Pago em', dataIndex: 'data_pagamento', render: (v: string | null) => (v ? data(v) : '—') },
    {
      title: 'Ações',
      key: 'acoes',
      render: (_: unknown, p) =>
        !p.data_pagamento && aceitaPagamento ? (
          <Button type="link" size="small" onClick={() => { setPagando(p); setDataPagamento(dayjs()); }} data-testid="botao-pagar-parcela">
            Registrar pagamento
          </Button>
        ) : null,
    },
  ];

  return (
    <Drawer
      title={detalhe ? `Acordo ${detalhe.id} · ${rotuloDaUnidade(detalhe.bloco_numero, detalhe.apartamento_numero)}` : 'Acordo'}
      open={id !== null}
      onClose={() => { onFechar(); setDetalhe(null); }}
      size="large"
      destroyOnHidden
      data-testid="detalhe-acordo"
    >
      {detalhe && (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="Situação"><Tag color={STATUS[detalhe.status].cor}>{STATUS[detalhe.status].texto}</Tag></Descriptions.Item>
            <Descriptions.Item label="Criado em">{dataHora(detalhe.criado_em)}</Descriptions.Item>
            <Descriptions.Item label="Valor das taxas">{formatarMoeda(detalhe.valor_taxas)}</Descriptions.Item>
            <Descriptions.Item label="Multa e juros">{formatarMoeda(detalhe.juros)}</Descriptions.Item>
            <Descriptions.Item label="Desconto">{formatarMoeda(detalhe.desconto)}</Descriptions.Item>
            <Descriptions.Item label="Total do acordo">{formatarMoeda(detalhe.valor_total)}</Descriptions.Item>
            <Descriptions.Item label="Já recebido">{formatarMoeda(detalhe.valor_pago)}</Descriptions.Item>
            <Descriptions.Item label="Falta receber">{formatarMoeda(Math.max(0, detalhe.valor_total - detalhe.valor_pago))}</Descriptions.Item>
            {detalhe.observacao && <Descriptions.Item label="Observação" span={2}>{detalhe.observacao}</Descriptions.Item>}
            {detalhe.motivo_cancelamento && <Descriptions.Item label="Motivo do cancelamento" span={2}>{detalhe.motivo_cancelamento}</Descriptions.Item>}
          </Descriptions>
          {detalhe.status === 'descumprido' && (
            <Alert
              type="error"
              showIcon
              message={`Acordo descumprido: há parcela vencida há mais de ${detalhe.carencia_dias} dias. As taxas voltaram a contar como em atraso. Registrar o pagamento da parcela atrasada retoma o acordo.`}
            />
          )}
          <div>
            <Title level={5}>Taxas incluídas</Title>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={detalhe.taxas}
              columns={[
                { title: 'Mês', key: 'mes', render: (_: unknown, t: TaxaDoAcordo) => mesAno(t) },
                { title: 'Valor', dataIndex: 'valor', render: formatarMoeda },
                { title: 'Multa e juros na data do acordo', dataIndex: 'juros_calculado', render: formatarMoeda },
              ]}
            />
          </div>
          <div>
            <Title level={5}>Parcelas</Title>
            <Table data-testid="tabela-parcelas" size="small" rowKey="id" pagination={false} dataSource={detalhe.parcelas} columns={colunasParcelas} />
          </div>
          {aceitaPagamento && (
            <Button danger onClick={() => setCancelando(true)} data-testid="botao-cancelar-acordo">Cancelar acordo</Button>
          )}
        </Space>
      )}

      <Modal title="Registrar pagamento da parcela" open={!!pagando} onCancel={() => setPagando(null)} onOk={registrarPagamento} okText="Registrar" cancelText="Voltar" destroyOnHidden>
        <p>{pagando && `${pagando.numero === 0 ? 'Entrada' : `Parcela ${pagando.numero}`}: ${formatarMoeda(pagando.valor)}`}</p>
        <DatePicker format="DD/MM/YYYY" value={dataPagamento} allowClear={false} onChange={(d) => d && setDataPagamento(d)} data-testid="input-data-parcela" />
      </Modal>
      <Modal
        title="Cancelar acordo"
        open={cancelando}
        onCancel={() => setCancelando(false)}
        onOk={cancelarAcordo}
        okText="Cancelar acordo"
        okButtonProps={{ danger: true, disabled: motivo.trim().length < 3 }}
        cancelText="Voltar"
        destroyOnHidden
      >
        <p>As taxas voltam a valer como estavam (em atraso). O que já foi recebido continua como receita. Informe o motivo (3 a 200 caracteres).</p>
        <Input.TextArea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} showCount rows={3} data-testid="input-motivo-acordo" />
      </Modal>
    </Drawer>
  );
}

// ---------- Lista ----------

export function Acordos() {
  const { unidade, rotuloDaUnidade } = useCondominio();
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [status, setStatus] = useState<string>();
  const [novo, setNovo] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    api.get<Acordo[]>('/financeiro/acordos', { params: { status } }).then((res) => setAcordos(res.data));
  }, [status, versao]);

  const colunas: ColumnsType<Acordo> = [
    { title: unidade.S, key: 'apto', render: (_: unknown, a) => rotuloDaUnidade(a.bloco_numero, a.apartamento_numero) },
    { title: 'Situação', dataIndex: 'status', render: (s: StatusAcordo) => <Tag color={STATUS[s].cor} data-testid={`status-acordo-${s}`}>{STATUS[s].texto}</Tag> },
    { title: 'Total', dataIndex: 'valor_total', render: formatarMoeda },
    { title: 'Recebido', dataIndex: 'valor_pago', render: formatarMoeda },
    { title: 'Parcelas pagas', key: 'parcelas', render: (_: unknown, a) => `${a.parcelas_pagas}/${a.total_parcelas}` },
    { title: 'Próximo vencimento', dataIndex: 'proximo_vencimento', render: (v: string | null) => data(v) },
    { title: 'Criado em', dataIndex: 'criado_em', render: dataHora },
    {
      title: 'Ações',
      key: 'acoes',
      render: (_: unknown, a) => <Button type="link" size="small" onClick={() => setAberto(a.id)} data-testid="botao-ver-acordo">Ver detalhes</Button>,
    },
  ];

  return (
    <Card>
      <Title level={4}>Acordos de dívida</Title>
      <Paragraph type="secondary">
        Um acordo renegocia taxas em atraso {unidade.do} {unidade.s} em parcelas. Enquanto está ativo ou quitado, as taxas deixam de contar
        como atraso; o dinheiro entra como receita no mês em que cada parcela é paga. Uma parcela vencida há mais de 5 dias sem
        pagamento torna o acordo descumprido, e as taxas voltam a contar como atraso.
      </Paragraph>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setNovo(true)} data-testid="botao-novo-acordo">Novo acordo</Button>
        <Select
          allowClear
          placeholder="Todas as situações"
          style={{ width: 200 }}
          value={status}
          onChange={setStatus}
          options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.texto }))}
          data-testid="filtro-status-acordo"
        />
      </Space>
      <Table
        data-testid="tabela-acordos"
        rowKey="id"
        columns={colunas}
        dataSource={acordos}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: 'Nenhum acordo. Use "Novo acordo" para renegociar taxas em atraso.' }}
      />
      <NovoAcordoModal aberto={novo} onFechar={() => setNovo(false)} onCriado={recarregar} />
      <DetalheDoAcordo id={aberto} onFechar={() => setAberto(null)} onAlterado={recarregar} />
    </Card>
  );
}
