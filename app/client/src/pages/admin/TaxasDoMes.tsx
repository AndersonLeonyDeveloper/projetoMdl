import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Button, Card, Col, Collapse, Form, InputNumber, Modal, Popconfirm, Row, Select, Space, Statistic, Switch, Table,
  Tag, Tooltip, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd';
import { api, formatarMoeda, mensagemDeErro } from '../../api/client';
import { useCondominio } from '../../context/CondominioContext';
import { CampoComprovante } from '../../components/CampoComprovante';
import { CancelarRestaurar } from '../../components/CancelarRestaurar';
import { ComprovanteLink } from '../../components/ComprovanteLink';
import { EditarTaxaModal } from '../../components/EditarTaxaModal';
import { montarFormData, validarComprovante } from '../../utils/comprovante';

const { Title, Paragraph } = Typography;

interface Bloco {
  id: number;
  numero: string;
}
interface Apartamento {
  id: number;
  bloco_id: number;
  numero: string;
  fator_taxa: number;
}
interface TaxaPadrao {
  ano: number;
  valor: number;
}
interface PreviaGeracao {
  total_apartamentos: number;
  existentes: number;
  a_criar: number;
  valor: number | null;
  com_fator_diferente: number;
}
interface Taxa {
  id: number;
  apartamento_id: number;
  bloco_numero: string;
  apartamento_numero: string;
  mes_referencia: number;
  ano_referencia: number;
  valor: number;
  juros: number;
  situacao: 'adimplente' | 'inadimplente';
  status: 'adimplente' | 'a_vencer' | 'em_atraso' | 'cancelada' | 'em_acordo' | 'quitada_acordo';
  acordo_id: number | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  juros_calculado: number | null; // cálculo atual para taxa paga
  juros_diverge: boolean; // juros gravado difere do cálculo atual
  meses_atraso: number;
  data_pagamento: string | null;
  comprovante_path: string | null;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Valores de taxa por ano (Configurações financeiras). "recarregar" atualiza depois de salvar um valor novo.
function useTaxasPadrao() {
  const [taxasPadrao, setTaxasPadrao] = useState<TaxaPadrao[]>([]);
  const recarregar = useCallback(
    () =>
      api
        .get<{ taxas_padrao: TaxaPadrao[] }>('/financeiro/configuracoes')
        .then((res) => setTaxasPadrao(res.data.taxas_padrao)),
    []
  );
  useEffect(() => {
    recarregar();
  }, [recarregar]);
  return { taxasPadrao, recarregar };
}

// Gera de uma vez a taxa do mês escolhido na tela para todos os apartamentos que ainda não têm uma.
// O valor do ano é editável aqui: se for novo ou diferente, é salvo como o padrão do ano.
function GerarTaxasDoMes({ ano, mes, taxasPadrao, recarregarPadroes, onGerado }: {
  ano: number;
  mes: number;
  taxasPadrao: TaxaPadrao[];
  recarregarPadroes: () => Promise<void>;
  onGerado: () => void;
}) {
  const { unidade } = useCondominio();
  const todos = unidade.o === 'a' ? 'todas as' : 'todos os';
  const padrao = taxasPadrao.find((t) => t.ano === ano)?.valor;
  // Valor digitado para um ano; ao trocar de ano, volta a valer o padrão daquele ano.
  const [digitado, setDigitado] = useState<{ ano: number; valor: number | null } | null>(null);
  const valor = digitado?.ano === ano ? digitado.valor : (padrao ?? null);
  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'info' | 'error'; texto: string } | null>(null);
  const [modal, contextHolder] = Modal.useModal();
  const referencia = `${String(mes).padStart(2, '0')}/${ano}`;

  async function executar(valorFinal: number) {
    setGerando(true);
    try {
      if (valorFinal !== padrao) {
        await api.put('/financeiro/configuracoes', { taxas_padrao: [{ ano, valor: valorFinal }] });
        await recarregarPadroes();
      }
      const { data } = await api.post<{ criadas: number; ignoradas: number }>('/financeiro/taxas/gerar-mes', {
        mes_referencia: mes,
        ano_referencia: ano,
      });
      setMensagem({ tipo: 'success', texto: `${data.criadas} taxa(s) criada(s) e ${data.ignoradas} ignorada(s) (já existiam) em ${referencia}.` });
      onGerado();
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemDeErro(err, 'Erro ao gerar as taxas do mês.') });
    } finally {
      setGerando(false);
    }
  }

  async function pedirConfirmacao() {
    if (valor == null || valor <= 0) return;
    setMensagem(null);
    setGerando(true);
    try {
      const { data: previa } = await api.get<PreviaGeracao>('/financeiro/taxas/gerar-mes/previa', {
        params: { mes_referencia: mes, ano_referencia: ano },
      });
      if (previa.a_criar === 0) {
        setMensagem({ tipo: 'info', texto: `Todas as ${previa.total_apartamentos} taxas de ${referencia} já existem. Nada a gerar.` });
        return;
      }
      modal.confirm({
        title: 'Gerar taxas do mês',
        okText: 'Gerar',
        cancelText: 'Cancelar',
        content: (
          <div data-testid="confirmacao-gerar-taxas">
            Vai criar <strong>{previa.a_criar}</strong> taxa(s) de <strong>{formatarMoeda(valor)}</strong> para {referencia}
            {previa.existentes > 0 ? ` (${previa.existentes} já existem e serão ignoradas)` : ''}.
            {valor !== padrao && ` O valor será salvo como o padrão de ${ano}.`}
            {previa.com_fator_diferente > 0 &&
              ` ${previa.com_fator_diferente} ${unidade.s}(s) têm fator diferente de 1,00 e terão o valor ajustado (valor × fator).`}
          </div>
        ),
        onOk: () => executar(valor),
      });
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemDeErro(err, 'Erro ao consultar as taxas do mês.') });
    } finally {
      setGerando(false);
    }
  }

  return (
    <Card data-testid="gerar-taxas-mes">
      {contextHolder}
      <Title level={5}>Gerar taxas de {referencia}</Title>
      <Paragraph type="secondary">
        Cria a taxa de {todos} {unidade.p} que ainda não têm uma no mês escolhido acima. Taxas já lançadas (inclusive as
        canceladas) não são alteradas.
      </Paragraph>
      <Space wrap align="start">
        <div>
          <div>Valor da taxa em {ano}</div>
          <InputNumber
            value={valor}
            onChange={(v) => setDigitado({ ano, valor: v })}
            min={0}
            step={0.01}
            prefix="R$"
            style={{ width: 150 }}
            data-testid="input-gerar-valor"
          />
          <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12, maxWidth: 240 }}>
            {padrao === undefined
              ? `Sem valor definido para ${ano}: informe aqui e ele passa a ser o padrão do ano.`
              : 'Mudar o valor atualiza o padrão do ano; taxas já lançadas não mudam.'}
          </div>
        </div>
        <div>
          <div>&nbsp;</div>
          <Button type="primary" loading={gerando} disabled={valor == null || valor <= 0} onClick={pedirConfirmacao} data-testid="botao-gerar-taxas">
            Gerar taxas
          </Button>
        </div>
      </Space>
      {mensagem && <Alert type={mensagem.tipo} message={mensagem.texto} showIcon style={{ marginTop: 16 }} data-testid="mensagem-gerar-taxas" />}
    </Card>
  );
}

function LancarTaxa({ taxasPadrao, ano, mes, onLancada }: { taxasPadrao: TaxaPadrao[]; ano: number; mes: number; onLancada: () => void }) {
  const { agrupador, unidade } = useCondominio();
  const [form] = Form.useForm();
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [apartamentos, setApartamentos] = useState<Apartamento[]>([]);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const [salvando, setSalvando] = useState(false);
  const anoReferencia = Form.useWatch('ano_referencia', form);
  const valorPadrao = taxasPadrao.find((t) => t.ano === anoReferencia)?.valor;

  useEffect(() => {
    api.get<Bloco[]>('/blocos').then((res) => setBlocos(res.data));
  }, []);

  // O valor da taxa vem preenchido com o configurado para o ano; continua editável.
  useEffect(() => {
    form.setFieldValue('valor', valorPadrao);
  }, [form, valorPadrao]);

  async function handleBlocoChange(blocoId: number) {
    form.setFieldValue('apartamento_id', undefined);
    const { data } = await api.get<Apartamento[]>('/apartamentos', { params: { bloco_id: blocoId } });
    setApartamentos(data);
  }

  async function handleFinish(values: {
    apartamento_id: number;
    mes_referencia: number;
    ano_referencia: number;
    valor: number;
    comprovante?: UploadFile[];
  }) {
    setMensagem(null);
    const erroArquivo = validarComprovante(values.comprovante);
    if (erroArquivo) return setMensagem({ tipo: 'error', texto: erroArquivo });
    setSalvando(true);
    try {
      const { apartamento_id, mes_referencia, ano_referencia, valor } = values;
      await api.post(
        '/financeiro/taxas',
        montarFormData({ apartamento_id, mes_referencia, ano_referencia, valor }, values.comprovante)
      );
      setMensagem({ tipo: 'success', texto: 'Taxa lançada com sucesso.' });
      form.resetFields(['valor', 'comprovante']);
      form.setFieldValue('valor', valorPadrao);
      onLancada();
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemDeErro(err, 'Erro ao lançar taxa.') });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      data-testid="form-lancar-taxa"
      initialValues={{ ano_referencia: ano, mes_referencia: mes }}
    >
      <Space wrap size="large" align="start">
        <Form.Item label={agrupador.S} name="bloco_id" rules={[{ required: true }]}>
          <Select
            style={{ width: 160 }}
            placeholder="Selecione"
            onChange={handleBlocoChange}
            data-testid="select-taxa-bloco"
            options={blocos.map((b) => ({ value: b.id, label: b.numero }))}
          />
        </Form.Item>
        <Form.Item label={unidade.S} name="apartamento_id" rules={[{ required: true }]}>
          <Select
            style={{ width: 160 }}
            placeholder="Selecione"
            onChange={(id: number) => {
              // O valor sugerido é o do ano multiplicado pelo fator do apartamento; continua editável.
              const apto = apartamentos.find((a) => a.id === id);
              if (apto && valorPadrao !== undefined) form.setFieldValue('valor', Math.round(valorPadrao * apto.fator_taxa * 100) / 100);
            }}
            data-testid="select-taxa-apartamento"
            options={apartamentos.map((a) => ({ value: a.id, label: a.numero }))}
          />
        </Form.Item>
        <Form.Item label="Mês" name="mes_referencia" rules={[{ required: true }]}>
          <Select
            style={{ width: 100 }}
            options={MESES.map((m, idx) => ({ value: idx + 1, label: m }))}
          />
        </Form.Item>
        <Form.Item label="Ano" name="ano_referencia" rules={[{ required: true }]}>
          <InputNumber style={{ width: 100 }} />
        </Form.Item>
        <Form.Item
          label="Valor"
          name="valor"
          rules={[{ required: true }]}
          extra={
            valorPadrao !== undefined
              ? `Valor padrão de ${anoReferencia}: ${formatarMoeda(valorPadrao)} (multiplicado pelo fator ${unidade.do} ${unidade.s}, se houver)`
              : 'Sem valor padrão para este ano (Configurações financeiras).'
          }
        >
          <InputNumber
            style={{ width: 140 }}
            min={0}
            step={0.01}
            prefix="R$"
            data-testid="input-valor-taxa"
          />
        </Form.Item>
        <CampoComprovante testId="upload-comprovante-taxa" />
      </Space>
      {mensagem && (
        <Alert type={mensagem.tipo} message={mensagem.texto} showIcon style={{ marginBottom: 16 }} data-testid="mensagem-taxa" />
      )}
      <Button type="primary" htmlType="submit" loading={salvando} data-testid="botao-lancar-taxa">
        Lançar
      </Button>
    </Form>
  );
}

const VISUAL_STATUS = {
  adimplente: { cor: 'success', texto: 'Adimplente' },
  a_vencer: { cor: 'processing', texto: 'A vencer' },
  em_atraso: { cor: 'error', texto: 'Em atraso' },
  cancelada: { cor: 'default', texto: 'Cancelada' },
  em_acordo: { cor: 'purple', texto: 'Em acordo' },
  quitada_acordo: { cor: 'cyan', texto: 'Quitada por acordo' },
} as const;

const soma = (taxas: Taxa[]) => taxas.reduce((s, t) => s + t.valor + t.juros, 0);

// Tela única do ciclo da taxa: resumo do mês, gerar as taxas, registrar pagamentos, editar e cancelar, e lançar uma avulsa.
export function TaxasDoMes() {
  const { agrupador, unidade } = useCondominio();
  const todos = unidade.o === 'a' ? 'todas as' : 'todos os';
  // ano, mes e apartamento_id podem vir da URL (os meses em atraso de Dados dos Moradores abrem esta tela).
  const [params, setParams] = useSearchParams();
  const apartamentoId = Number(params.get('apartamento_id')) || null;
  const [ano, setAno] = useState(Number(params.get('ano')) || new Date().getFullYear());
  const [mes, setMes] = useState(Number(params.get('mes')) || new Date().getMonth() + 1);
  const [todas, setTodas] = useState<Taxa[]>([]); // o mês inteiro, inclusive canceladas
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);
  const [editando, setEditando] = useState<Taxa | null>(null);
  const [recarregar, setRecarregar] = useState(0);
  const { taxasPadrao, recarregar: recarregarPadroes } = useTaxasPadrao();
  const recarregarLista = () => setRecarregar((n) => n + 1);

  useEffect(() => {
    api
      .get<Taxa[]>('/financeiro/taxas', { params: { ano, mes, incluir_cancelados: 'true' } })
      .then((res) => setTodas(res.data));
  }, [ano, mes, recarregar]);

  async function recalcularJuros(id: number) {
    try {
      await api.post(`/financeiro/taxas/${id}/recalcular-juros`);
      message.success('Juros recalculado.');
      recarregarLista();
    } catch (err) {
      message.error(mensagemDeErro(err, 'Não foi possível recalcular o juros.'));
    }
  }

  // Resumo do mês: sempre do mês inteiro (não muda com o filtro de apartamento); canceladas ficam de fora dos valores.
  const resumo = useMemo(() => {
    const ativas = todas.filter((t) => !t.cancelado_em);
    const por = (status: Taxa['status']) => ativas.filter((t) => t.status === status);
    return {
      geradas: ativas.length,
      adimplentes: por('adimplente'),
      aVencer: por('a_vencer'),
      emAtraso: por('em_atraso'),
      emAcordo: por('em_acordo'),
      quitadasPorAcordo: por('quitada_acordo'),
      canceladas: todas.length - ativas.length,
    };
  }, [todas]);

  const linhas = useMemo(
    () =>
      todas
        .filter((t) => (mostrarCanceladas ? true : !t.cancelado_em))
        .filter((t) => (apartamentoId ? t.apartamento_id === apartamentoId : true)),
    [todas, mostrarCanceladas, apartamentoId]
  );
  const rotuloApto = apartamentoId ? todas.find((t) => t.apartamento_id === apartamentoId) : undefined;
  const referencia = `${String(mes).padStart(2, '0')}/${ano}`;

  const colunas: ColumnsType<Taxa> = [
    {
      title: agrupador.S,
      dataIndex: 'bloco_numero',
      filters: [...new Set(todas.map((t) => t.bloco_numero))].map((b) => ({ text: `${agrupador.S} ${b}`, value: b })),
      onFilter: (value, record) => record.bloco_numero === value,
    },
    { title: unidade.S, dataIndex: 'apartamento_numero' },
    {
      title: 'Situação',
      dataIndex: 'status',
      filters: Object.entries(VISUAL_STATUS).map(([value, v]) => ({ text: v.texto, value })),
      onFilter: (value, record) => record.status === value,
      render: (status: Taxa['status'], taxa: Taxa) => (
        <Tooltip title={status === 'cancelada' ? `Motivo: ${taxa.motivo_cancelamento ?? '—'}` : undefined}>
          <Tag color={VISUAL_STATUS[status].cor} data-testid={`status-${status}`}>
            {VISUAL_STATUS[status].texto}
          </Tag>
        </Tooltip>
      ),
    },
    { title: 'Valor', dataIndex: 'valor', render: (v: number) => `R$ ${v.toFixed(2)}` },
    {
      title: 'Juros',
      dataIndex: 'juros',
      render: (v: number, taxa: Taxa) => (
        <Space size={4} wrap>
          {`R$ ${v.toFixed(2)}`}
          {taxa.juros_diverge && (
            <Popconfirm
              title="Regravar o juros com o cálculo atual?"
              description={`Gravado ${formatarMoeda(v)}; cálculo atual ${formatarMoeda(taxa.juros_calculado ?? 0)}.`}
              okText="Recalcular juros"
              cancelText="Cancelar"
              onConfirm={() => recalcularJuros(taxa.id)}
            >
              <Tag color="warning" style={{ cursor: 'pointer' }} data-testid="tag-juros-diverge">
                Difere do cálculo
              </Tag>
            </Popconfirm>
          )}
        </Space>
      ),
    },
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
        <Space size={0}>
          <Button type="link" size="small" disabled={!!taxa.cancelado_em || taxa.acordo_id !== null} onClick={() => setEditando(taxa)} data-testid="botao-editar-taxa">
            {taxa.situacao === 'inadimplente' ? 'Registrar pagamento' : 'Editar'}
          </Button>
          <CancelarRestaurar
            rota="taxas"
            id={taxa.id}
            cancelado={!!taxa.cancelado_em}
            bloqueio={
              taxa.acordo_id !== null
                ? 'Taxa em acordo: o pagamento é feito pelas parcelas (tela Acordos).'
                : taxa.data_pagamento
                  ? 'Taxa paga não pode ser cancelada. Remova o pagamento antes (Editar).'
                  : null
            }
            rotulo="taxa"
            onAlterado={recarregarLista}
          />
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }} data-testid="taxas-do-mes">
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

      <Row gutter={[16, 16]} data-testid="resumo-taxas-do-mes">
        <Col xs={12} md={6} xl={5}>
          <Card><Statistic title={`Geradas em ${referencia}`} value={resumo.geradas} /></Card>
        </Col>
        <Col xs={12} md={6} xl={5}>
          <Card>
            <Statistic title="Adimplentes" value={resumo.adimplentes.length} suffix={<small>{formatarMoeda(soma(resumo.adimplentes))}</small>} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={12} md={6} xl={5}>
          <Card>
            <Statistic title="A vencer" value={resumo.aVencer.length} suffix={<small>{formatarMoeda(soma(resumo.aVencer))}</small>} />
          </Card>
        </Col>
        <Col xs={12} md={6} xl={5}>
          <Card>
            <Statistic title="Em atraso" value={resumo.emAtraso.length} suffix={<small>{formatarMoeda(soma(resumo.emAtraso))}</small>} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        {(resumo.emAcordo.length > 0 || resumo.quitadasPorAcordo.length > 0) && (
          <Col xs={12} md={6} xl={5}>
            <Card>
              <Statistic
                title="Em acordo"
                value={resumo.emAcordo.length}
                suffix={<small>{formatarMoeda(soma(resumo.emAcordo))}{resumo.quitadasPorAcordo.length > 0 ? ` · ${resumo.quitadasPorAcordo.length} quitada(s)` : ''}</small>}
                data-testid="resumo-em-acordo"
              />
            </Card>
          </Col>
        )}
        {resumo.canceladas > 0 && (
          <Col xs={12} md={6} xl={4}>
            <Card><Statistic title="Canceladas" value={resumo.canceladas} /></Card>
          </Col>
        )}
      </Row>

      <GerarTaxasDoMes
        ano={ano}
        mes={mes}
        taxasPadrao={taxasPadrao}
        recarregarPadroes={recarregarPadroes}
        onGerado={recarregarLista}
      />

      <Card>
        <Title level={4}>Taxas de {referencia}</Title>
        <Space style={{ marginBottom: 12 }}>
          <Switch size="small" checked={mostrarCanceladas} onChange={setMostrarCanceladas} data-testid="switch-mostrar-canceladas" />
          Mostrar canceladas
        </Space>
        {apartamentoId && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            data-testid="aviso-filtro-apartamento"
            message={
              rotuloApto
                ? `Mostrando só as taxas ${unidade.do} ${unidade.s} ${rotuloApto.bloco_numero}/${rotuloApto.apartamento_numero}.`
                : `Mostrando só as taxas de ${unidade.um} ${unidade.s} (nenhuma neste mês).`
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
                Ver {todos} {unidade.p}
              </Button>
            }
          />
        )}
        <Table
          data-testid="tabela-taxas"
          rowKey="id"
          columns={colunas}
          dataSource={linhas}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [5, 10, 20, 50] }}
          locale={{ emptyText: 'Nenhuma taxa neste mês. Use "Gerar taxas" acima.' }}
        />
      </Card>

      <Collapse
        items={[
          {
            key: 'individual',
            label: 'Lançar taxa individual (avulsa)',
            children: <LancarTaxa taxasPadrao={taxasPadrao} ano={ano} mes={mes} onLancada={recarregarLista} />,
          },
        ]}
        data-testid="lancar-taxa-individual"
      />

      <EditarTaxaModal taxa={editando} onFechar={() => setEditando(null)} onSalvo={recarregarLista} />
    </Space>
  );
}
