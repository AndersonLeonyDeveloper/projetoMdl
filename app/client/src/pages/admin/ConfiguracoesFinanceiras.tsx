import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Form, InputNumber, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api, formatarMoeda, mensagemDeErro } from '../../api/client';

const { Title, Paragraph } = Typography;

interface TaxaPadrao {
  ano: number;
  valor: number;
}
interface Configuracao {
  multa_percentual: number;
  juros_mensal_percentual: number;
  dia_vencimento: number;
  taxas_padrao: TaxaPadrao[];
}
type Mensagem = { tipo: 'success' | 'error'; texto: string } | null;

interface Bloco {
  id: number;
  numero: string;
}
interface ApartamentoComFator {
  id: number;
  bloco_id: number;
  numero: string;
  fator_taxa: number;
}

// Fator da taxa por apartamento: multiplica o valor-base do ano na geração das taxas do mês (1 = valor-base).
function FatorPorApartamento() {
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [apartamentos, setApartamentos] = useState<ApartamentoComFator[]>([]);
  const [blocoId, setBlocoId] = useState<number>();
  const [valores, setValores] = useState<Record<number, number>>({});
  const [fatorDoBloco, setFatorDoBloco] = useState<number | null>(1);
  const [mensagem, setMensagem] = useState<Mensagem>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    Promise.all([api.get<Bloco[]>('/blocos'), api.get<ApartamentoComFator[]>('/apartamentos')]).then(([b, a]) => {
      setBlocos(b.data);
      setApartamentos(a.data);
      setValores(Object.fromEntries(a.data.map((x) => [x.id, x.fator_taxa])));
      setBlocoId((atual) => atual ?? b.data[0]?.id);
    });
  }, [versao]);

  const diferentes = apartamentos.filter((a) => a.fator_taxa !== 1).length;
  const doBloco = apartamentos.filter((a) => a.bloco_id === blocoId);
  const blocoAtual = blocos.find((b) => b.id === blocoId);

  async function salvar(id: number) {
    setMensagem(null);
    try {
      await api.put(`/apartamentos/${id}/fator-taxa`, { fator: valores[id] });
      setMensagem({ tipo: 'success', texto: 'Fator salvo. Vale para as próximas taxas geradas; as já lançadas não mudam.' });
      setVersao((v) => v + 1);
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemDeErro(err, 'Erro ao salvar o fator.') });
    }
  }

  async function aplicarAoBloco() {
    if (!blocoId || fatorDoBloco == null) return;
    setMensagem(null);
    try {
      const { data } = await api.post<{ alterados: number }>(`/blocos/${blocoId}/fator-taxa`, { fator: fatorDoBloco });
      setMensagem({ tipo: 'success', texto: `Fator ${fatorDoBloco} aplicado ao bloco ${blocoAtual?.numero}: ${data.alterados} apartamento(s) alterado(s).` });
      setVersao((v) => v + 1);
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemDeErro(err, 'Erro ao aplicar o fator ao bloco.') });
    }
  }

  const colunas: ColumnsType<ApartamentoComFator> = [
    { title: 'Apartamento', dataIndex: 'numero' },
    {
      title: 'Fator',
      dataIndex: 'fator_taxa',
      render: (_: number, linha) => (
        <InputNumber
          value={valores[linha.id]}
          min={0.1}
          max={5}
          step={0.05}
          onChange={(v) => setValores((atual) => ({ ...atual, [linha.id]: Number(v) }))}
          data-testid={`input-fator-${linha.id}`}
        />
      ),
    },
    {
      title: 'Ações',
      key: 'acoes',
      render: (_: unknown, linha) => (
        <Button
          type="link"
          size="small"
          disabled={valores[linha.id] === undefined || valores[linha.id] === linha.fator_taxa}
          onClick={() => salvar(linha.id)}
          data-testid={`botao-salvar-fator-${linha.id}`}
        >
          Salvar
        </Button>
      ),
    },
  ];

  return (
    <Card data-testid="fator-por-apartamento">
      <Title level={4}>Fator da taxa por apartamento</Title>
      <Paragraph type="secondary">
        O valor da taxa de cada apartamento é o valor do ano multiplicado pelo fator (1,00 = valor padrão; por exemplo, 1,20
        para uma cobertura). O fator só vale para as taxas geradas daqui para a frente; taxas já lançadas não mudam.{' '}
        <strong data-testid="resumo-fatores">
          {diferentes === 0 ? 'Todos os apartamentos usam o fator 1,00.' : `${diferentes} apartamento(s) com fator diferente de 1,00.`}
        </strong>
      </Paragraph>
      <Space wrap style={{ marginBottom: 16 }} align="end">
        <div>
          <div>Bloco</div>
          <Select
            style={{ width: 120 }}
            value={blocoId}
            onChange={setBlocoId}
            options={blocos.map((b) => ({ value: b.id, label: b.numero }))}
            data-testid="select-fator-bloco"
          />
        </div>
        <div>
          <div>Aplicar a todo o bloco</div>
          <Space.Compact>
            <InputNumber value={fatorDoBloco} onChange={setFatorDoBloco} min={0.1} max={5} step={0.05} data-testid="input-fator-bloco" />
            <Button onClick={aplicarAoBloco} data-testid="botao-aplicar-fator-bloco">Aplicar</Button>
          </Space.Compact>
        </div>
      </Space>
      <Table data-testid="tabela-fatores" rowKey="id" columns={colunas} dataSource={doBloco} pagination={false} size="small" />
      {mensagem && <Alert type={mensagem.tipo} message={mensagem.texto} showIcon style={{ marginTop: 16 }} data-testid="mensagem-fator" />}
    </Card>
  );
}

export function ConfiguracoesFinanceiras() {
  const [parametros] = Form.useForm();
  const [novaTaxa] = Form.useForm<TaxaPadrao>();
  const [taxasPadrao, setTaxasPadrao] = useState<TaxaPadrao[]>([]);
  const [valores, setValores] = useState<Record<number, number>>({});
  const [msgParametros, setMsgParametros] = useState<Mensagem>(null);
  const [msgTaxas, setMsgTaxas] = useState<Mensagem>(null);
  const [salvando, setSalvando] = useState(false);

  const aplicar = useCallback(
    (config: Configuracao) => {
      parametros.setFieldsValue(config);
      setTaxasPadrao(config.taxas_padrao);
      setValores(Object.fromEntries(config.taxas_padrao.map((t) => [t.ano, t.valor])));
    },
    [parametros]
  );

  useEffect(() => {
    api.get<Configuracao>('/financeiro/configuracoes').then((res) => aplicar(res.data));
  }, [aplicar]);

  async function salvarParametros(values: Omit<Configuracao, 'taxas_padrao'>) {
    setMsgParametros(null);
    setSalvando(true);
    try {
      const { data } = await api.put<Configuracao>('/financeiro/configuracoes', values);
      aplicar(data);
      setMsgParametros({ tipo: 'success', texto: 'Parâmetros salvos. Valem para os próximos pagamentos registrados.' });
    } catch (err) {
      setMsgParametros({ tipo: 'error', texto: mensagemDeErro(err, 'Erro ao salvar os parâmetros.') });
    } finally {
      setSalvando(false);
    }
  }

  async function salvarTaxa(item: TaxaPadrao) {
    setMsgTaxas(null);
    try {
      const { data } = await api.put<Configuracao>('/financeiro/configuracoes', { taxas_padrao: [item] });
      aplicar(data);
      setMsgTaxas({
        tipo: 'success',
        texto: `Taxa de ${item.ano} salva (${formatarMoeda(item.valor)}). Taxas já lançadas não foram alteradas.`,
      });
      return true;
    } catch (err) {
      setMsgTaxas({ tipo: 'error', texto: mensagemDeErro(err, 'Erro ao salvar o valor da taxa.') });
      return false;
    }
  }

  const colunas: ColumnsType<TaxaPadrao> = [
    { title: 'Ano', dataIndex: 'ano' },
    {
      title: 'Valor da taxa',
      dataIndex: 'valor',
      render: (_: number, linha) => (
        <InputNumber
          value={valores[linha.ano]}
          min={0}
          step={0.01}
          prefix="R$"
          onChange={(v) => setValores((atual) => ({ ...atual, [linha.ano]: Number(v) }))}
          data-testid={`input-taxa-ano-${linha.ano}`}
        />
      ),
    },
    {
      title: 'Ações',
      key: 'acoes',
      render: (_: unknown, linha) => (
        <Button
          type="link"
          size="small"
          disabled={valores[linha.ano] === undefined || valores[linha.ano] === linha.valor}
          onClick={() => salvarTaxa({ ano: linha.ano, valor: valores[linha.ano] })}
          data-testid={`botao-salvar-taxa-ano-${linha.ano}`}
        >
          Salvar
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Title level={4}>Multa, juros e vencimento</Title>
        <Paragraph type="secondary">
          Usados no cálculo do juros por atraso quando um pagamento é registrado: multa única mais juros simples ao mês,
          proporcional aos dias. Pagamentos já registrados não são recalculados.
        </Paragraph>
        <Form form={parametros} layout="vertical" onFinish={salvarParametros} data-testid="form-parametros-financeiros">
          <Space wrap size="large" align="start">
            <Form.Item
              label="Multa por atraso (%)"
              name="multa_percentual"
              extra="Máximo de 2% (Código Civil)."
              rules={[{ required: true }]}
            >
              <InputNumber min={0} max={2} step={0.1} style={{ width: 160 }} data-testid="input-multa" />
            </Form.Item>
            <Form.Item label="Juros ao mês (%)" name="juros_mensal_percentual" rules={[{ required: true }]}>
              <InputNumber min={0} step={0.1} style={{ width: 160 }} data-testid="input-juros-mensal" />
            </Form.Item>
            <Form.Item label="Dia de vencimento" name="dia_vencimento" extra="De 1 a 28." rules={[{ required: true }]}>
              <InputNumber min={1} max={28} precision={0} style={{ width: 160 }} data-testid="input-dia-vencimento" />
            </Form.Item>
          </Space>
          {msgParametros && (
            <Alert type={msgParametros.tipo} message={msgParametros.texto} showIcon style={{ marginBottom: 16 }} data-testid="mensagem-parametros" />
          )}
          <Button type="primary" htmlType="submit" loading={salvando} data-testid="botao-salvar-parametros">
            Salvar parâmetros
          </Button>
        </Form>
      </Card>

      <Card>
        <Title level={4}>Valor da taxa de condomínio por ano</Title>
        <Paragraph type="secondary">
          O valor do ano já vem preenchido ao lançar uma taxa e é usado em "Gerar taxas do mês". Alterar um valor não
          muda taxas já lançadas.
        </Paragraph>
        <Table
          data-testid="tabela-taxas-padrao"
          rowKey="ano"
          columns={colunas}
          dataSource={taxasPadrao}
          pagination={false}
          size="small"
        />
        <Form
          form={novaTaxa}
          layout="inline"
          style={{ marginTop: 16 }}
          onFinish={async (item) => {
            if (await salvarTaxa(item)) novaTaxa.resetFields();
          }}
          data-testid="form-nova-taxa-ano"
        >
          <Form.Item name="ano" rules={[{ required: true, message: 'Informe o ano' }]}>
            <InputNumber placeholder="Ano" min={1900} max={2999} precision={0} data-testid="input-novo-ano" />
          </Form.Item>
          <Form.Item name="valor" rules={[{ required: true, message: 'Informe o valor' }]}>
            <InputNumber placeholder="Valor" min={0} step={0.01} prefix="R$" data-testid="input-novo-valor" />
          </Form.Item>
          <Button htmlType="submit" data-testid="botao-adicionar-ano">
            Adicionar / atualizar ano
          </Button>
        </Form>
        {msgTaxas && (
          <Alert type={msgTaxas.tipo} message={msgTaxas.texto} showIcon style={{ marginTop: 16 }} data-testid="mensagem-taxas-padrao" />
        )}
      </Card>

      <FatorPorApartamento />
    </Space>
  );
}
