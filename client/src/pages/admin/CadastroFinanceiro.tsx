import { useEffect, useState } from 'react';
import { Card, Form, Input, Select, InputNumber, DatePicker, Button, Alert, Tabs, Space } from 'antd';
import dayjs from 'dayjs';
import { api } from '../../api/client';

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

function LancarTaxa() {
  const [form] = Form.useForm();
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [apartamentos, setApartamentos] = useState<Apartamento[]>([]);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.get<Bloco[]>('/blocos').then((res) => setBlocos(res.data));
  }, []);

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
  }) {
    setMensagem(null);
    setSalvando(true);
    try {
      await api.post('/financeiro/taxas', values);
      setMensagem({ tipo: 'success', texto: 'Taxa lançada com sucesso.' });
      form.resetFields(['valor']);
    } catch (err) {
      const texto =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        'Erro ao lançar taxa.';
      setMensagem({ tipo: 'error', texto });
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
        <Form.Item label="Valor" name="valor" rules={[{ required: true }]}>
          <InputNumber
            style={{ width: 140 }}
            min={0}
            step={0.01}
            prefix="R$"
            data-testid="input-valor-taxa"
          />
        </Form.Item>
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

function LancarOutraReceita() {
  const [form] = Form.useForm();
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const [salvando, setSalvando] = useState(false);

  async function handleFinish(values: { descricao: string; valor: number; data: dayjs.Dayjs }) {
    setMensagem(null);
    setSalvando(true);
    try {
      await api.post('/financeiro/outras-receitas', {
        descricao: values.descricao,
        valor: values.valor,
        data: values.data.format('YYYY-MM-DD'),
      });
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

  async function handleFinish(values: { descricao: string; valor: number; data: dayjs.Dayjs }) {
    setMensagem(null);
    setSalvando(true);
    try {
      await api.post('/financeiro/despesas', {
        descricao: values.descricao,
        valor: values.valor,
        data: values.data.format('YYYY-MM-DD'),
      });
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
          { key: 'taxa', label: 'Taxa de Condomínio', children: <LancarTaxa /> },
          { key: 'outras-receitas', label: 'Outras Receitas', children: <LancarOutraReceita /> },
          { key: 'despesas', label: 'Despesas', children: <LancarDespesa /> },
        ]}
      />
    </Card>
  );
}
