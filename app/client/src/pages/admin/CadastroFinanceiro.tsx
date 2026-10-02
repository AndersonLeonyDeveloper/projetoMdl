import { useEffect, useState } from 'react';
import type { UploadFile } from 'antd';
import { Card, Form, Input, Select, InputNumber, DatePicker, Button, Alert, Tabs, Space, Divider, Typography } from 'antd';
import dayjs from 'dayjs';
import { api, formatarMoeda, mensagemDeErro } from '../../api/client';
import { CampoComprovante } from '../../components/CampoComprovante';
import { montarFormData, validarComprovante } from '../../utils/comprovante';

interface Bloco {
  id: number;
  numero: string;
}
interface Apartamento {
  id: number;
  bloco_id: number;
  numero: string;
}

const MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

interface TaxaPadrao {
  ano: number;
  valor: number;
}

// Valores de taxa por ano, configurados em "Configurações financeiras".
function useTaxasPadrao() {
  const [taxasPadrao, setTaxasPadrao] = useState<TaxaPadrao[]>([]);
  useEffect(() => {
    api
      .get<{ taxas_padrao: TaxaPadrao[] }>('/financeiro/configuracoes')
      .then((res) => setTaxasPadrao(res.data.taxas_padrao));
  }, []);
  return taxasPadrao;
}

// Gera de uma vez a taxa do mês para todos os apartamentos que ainda não têm uma.
function GerarTaxasDoMes({ taxasPadrao }: { taxasPadrao: TaxaPadrao[] }) {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const padrao = taxasPadrao.find((t) => t.ano === ano);

  async function gerar() {
    setMensagem(null);
    setGerando(true);
    try {
      const { data } = await api.post<{ criadas: number; ignoradas: number }>('/financeiro/taxas/gerar-mes', {
        mes_referencia: mes,
        ano_referencia: ano,
      });
      setMensagem({
        tipo: 'success',
        texto: `${data.criadas} taxa(s) criada(s) e ${data.ignoradas} ignorada(s) (já existiam).`,
      });
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemDeErro(err, 'Erro ao gerar as taxas do mês.') });
    } finally {
      setGerando(false);
    }
  }

  return (
    <div data-testid="gerar-taxas-mes">
      <Typography.Title level={5}>Gerar taxas do mês</Typography.Title>
      <Typography.Paragraph type="secondary">
        Cria a taxa de todos os apartamentos que ainda não têm uma no mês, com o valor configurado para o ano
        {padrao ? ` (${formatarMoeda(padrao.valor)} em ${ano})` : ' (sem valor configurado para este ano)'}.
        Taxas já lançadas não são alteradas.
      </Typography.Paragraph>
      <Space wrap align="end">
        <div>
          <div>Mês</div>
          <Select
            value={mes}
            onChange={setMes}
            style={{ width: 100 }}
            data-testid="select-gerar-mes"
            options={MESES.map((m, idx) => ({ value: idx + 1, label: m }))}
          />
        </div>
        <div>
          <div>Ano</div>
          <InputNumber value={ano} onChange={(v) => setAno(Number(v))} style={{ width: 100 }} data-testid="input-gerar-ano" />
        </div>
        <Button type="primary" loading={gerando} disabled={!padrao} onClick={gerar} data-testid="botao-gerar-taxas">
          Gerar taxas
        </Button>
      </Space>
      {mensagem && (
        <Alert type={mensagem.tipo} message={mensagem.texto} showIcon style={{ marginTop: 16 }} data-testid="mensagem-gerar-taxas" />
      )}
    </div>
  );
}

function LancarTaxa({ taxasPadrao }: { taxasPadrao: TaxaPadrao[] }) {
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
      initialValues={{ ano_referencia: new Date().getFullYear(), mes_referencia: new Date().getMonth() + 1 }}
    >
      <Space wrap size="large" align="start">
        <Form.Item label="Bloco" name="bloco_id" rules={[{ required: true }]}>
          <Select
            style={{ width: 160 }}
            placeholder="Selecione"
            onChange={handleBlocoChange}
            data-testid="select-taxa-bloco"
            options={blocos.map((b) => ({ value: b.id, label: b.numero }))}
          />
        </Form.Item>
        <Form.Item label="Apartamento" name="apartamento_id" rules={[{ required: true }]}>
          <Select
            style={{ width: 160 }}
            placeholder="Selecione"
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
              ? `Valor padrão de ${anoReferencia}: ${formatarMoeda(valorPadrao)}`
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

function TaxaDeCondominio() {
  const taxasPadrao = useTaxasPadrao();
  return (
    <>
      <LancarTaxa taxasPadrao={taxasPadrao} />
      <Divider />
      <GerarTaxasDoMes taxasPadrao={taxasPadrao} />
    </>
  );
}

function LancarOutraReceita() {
  const [form] = Form.useForm();
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const [salvando, setSalvando] = useState(false);

  async function handleFinish(values: {
    descricao: string;
    valor: number;
    data: dayjs.Dayjs;
    comprovante?: UploadFile[];
  }) {
    setMensagem(null);
    const erroArquivo = validarComprovante(values.comprovante);
    if (erroArquivo) return setMensagem({ tipo: 'error', texto: erroArquivo });
    setSalvando(true);
    try {
      await api.post(
        '/financeiro/outras-receitas',
        montarFormData(
          { descricao: values.descricao, valor: values.valor, data: values.data.format('YYYY-MM-DD') },
          values.comprovante
        )
      );
      setMensagem({ tipo: 'success', texto: 'Receita lançada com sucesso.' });
      form.resetFields();
    } catch {
      setMensagem({ tipo: 'error', texto: 'Erro ao lançar receita.' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish} data-testid="form-outra-receita">
      <Space wrap size="large" align="start">
        <Form.Item label="Descrição" name="descricao" rules={[{ required: true }]}>
          <Input style={{ width: 240 }} data-testid="input-descricao-receita" />
        </Form.Item>
        <Form.Item label="Valor" name="valor" rules={[{ required: true }]}>
          <InputNumber style={{ width: 140 }} min={0} step={0.01} prefix="R$" data-testid="input-valor-receita" />
        </Form.Item>
        <Form.Item label="Data" name="data" rules={[{ required: true }]}>
          <DatePicker style={{ width: 160 }} format="DD/MM/YYYY" data-testid="input-data-receita" />
        </Form.Item>
        <CampoComprovante testId="upload-comprovante-receita" />
      </Space>
      {mensagem && (
        <Alert type={mensagem.tipo} message={mensagem.texto} showIcon style={{ marginBottom: 16 }} data-testid="mensagem-receita" />
      )}
      <Button type="primary" htmlType="submit" loading={salvando} data-testid="botao-lancar-receita">
        Salvar
      </Button>
    </Form>
  );
}

function LancarDespesa() {
  const [form] = Form.useForm();
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const [salvando, setSalvando] = useState(false);

  async function handleFinish(values: {
    descricao: string;
    valor: number;
    data: dayjs.Dayjs;
    comprovante?: UploadFile[];
  }) {
    setMensagem(null);
    const erroArquivo = validarComprovante(values.comprovante);
    if (erroArquivo) return setMensagem({ tipo: 'error', texto: erroArquivo });
    setSalvando(true);
    try {
      await api.post(
        '/financeiro/despesas',
        montarFormData(
          { descricao: values.descricao, valor: values.valor, data: values.data.format('YYYY-MM-DD') },
          values.comprovante
        )
      );
      setMensagem({ tipo: 'success', texto: 'Despesa lançada com sucesso.' });
      form.resetFields();
    } catch {
      setMensagem({ tipo: 'error', texto: 'Erro ao lançar despesa.' });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Form form={form} layout="vertical" onFinish={handleFinish} data-testid="form-despesa">
      <Space wrap size="large" align="start">
        <Form.Item label="Descrição" name="descricao" rules={[{ required: true }]}>
          <Input style={{ width: 240 }} data-testid="input-descricao-despesa" />
        </Form.Item>
        <Form.Item label="Valor" name="valor" rules={[{ required: true }]}>
          <InputNumber style={{ width: 140 }} min={0} step={0.01} prefix="R$" data-testid="input-valor-despesa" />
        </Form.Item>
        <Form.Item label="Data" name="data" rules={[{ required: true }]}>
          <DatePicker style={{ width: 160 }} format="DD/MM/YYYY" data-testid="input-data-despesa" />
        </Form.Item>
        <CampoComprovante testId="upload-comprovante-despesa" />
      </Space>
      {mensagem && (
        <Alert type={mensagem.tipo} message={mensagem.texto} showIcon style={{ marginBottom: 16 }} data-testid="mensagem-despesa" />
      )}
      <Button type="primary" htmlType="submit" loading={salvando} data-testid="botao-lancar-despesa">
        Salvar
      </Button>
    </Form>
  );
}

export function CadastroFinanceiro() {
  return (
    <Card>
      <Tabs
        data-testid="tabs-cadastro-financeiro"
        items={[
          { key: 'taxa', label: 'Taxa de Condomínio', children: <TaxaDeCondominio /> },
          { key: 'outras-receitas', label: 'Outras Receitas', children: <LancarOutraReceita /> },
          { key: 'despesas', label: 'Despesas', children: <LancarDespesa /> },
        ]}
      />
    </Card>
  );
}
