import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Form, InputNumber, Space, Table, Typography } from 'antd';
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
    </Space>
  );
}
