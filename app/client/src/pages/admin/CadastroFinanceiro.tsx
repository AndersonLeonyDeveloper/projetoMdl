import { useState } from 'react';
import type { UploadFile } from 'antd';
import { Card, Form, Input, InputNumber, DatePicker, Button, Alert, Tabs, Space } from 'antd';
import dayjs from 'dayjs';
import { api } from '../../api/client';
import { CampoBlocoDespesa, CampoFundoReserva } from '../../components/CampoBlocoDespesa';
import { CampoComprovante } from '../../components/CampoComprovante';
import { montarFormData, validarComprovante } from '../../utils/comprovante';

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
    bloco_id?: number;
    fundo_reserva?: boolean;
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
          { descricao: values.descricao, valor: values.valor, data: values.data.format('YYYY-MM-DD'), bloco_id: values.bloco_id ?? '', fundo_reserva: values.fundo_reserva ? 'true' : 'false' },
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
        <CampoBlocoDespesa testId="select-bloco-despesa" />
        <CampoFundoReserva testId="checkbox-fundo-despesa" />
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
          { key: 'outras-receitas', label: 'Outras Receitas', children: <LancarOutraReceita /> },
          { key: 'despesas', label: 'Despesas', children: <LancarDespesa /> },
        ]}
      />
    </Card>
  );
}
