import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Alert, Typography, Space, Spin } from 'antd';
import { api } from '../../api/client';

const { Title } = Typography;

interface Pessoa {
  id: number;
  nome: string;
  telefone: string;
  cpf: string | null;
  email: string;
}

interface FormValues {
  nome: string;
  telefone: string;
  email: string;
  confirmarEmail: string;
}

export function MeusDados() {
  const [form] = Form.useForm<FormValues>();
  const [carregado, setCarregado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.get<Pessoa>('/pessoas/me').then((res) => {
      form.setFieldsValue({
        nome: res.data.nome,
        telefone: res.data.telefone,
        email: res.data.email,
        confirmarEmail: res.data.email,
      });
      setCarregado(true);
    });
  }, [form]);

  async function handleFinish(values: FormValues) {
    setErro(null);
    setMensagem(null);
    setSalvando(true);
    try {
      await api.put('/pessoas/me', values);
      setMensagem('Dados atualizados com sucesso.');
    } catch (err) {
      setErro(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          'Erro ao atualizar dados.'
      );
    } finally {
      setSalvando(false);
    }
  }

  if (!carregado) return <Spin />;

  return (
    <Card>
      <Title level={4}>Meus Dados</Title>
      <Form<FormValues> form={form} layout="vertical" onFinish={handleFinish} data-testid="form-meus-dados">
        <Space wrap size="large" align="start">
          <Form.Item label="Nome" name="nome" rules={[{ required: true }]}>
            <Input style={{ width: 240 }} data-testid="input-nome" />
          </Form.Item>
          <Form.Item label="Telefone" name="telefone" rules={[{ required: true }]}>
            <Input style={{ width: 200 }} data-testid="input-telefone" />
          </Form.Item>
        </Space>
        <Space wrap size="large" align="start">
          <Form.Item
            label="E-mail"
            name="email"
            rules={[{ required: true }, { type: 'email', message: 'E-mail inválido.' }]}
          >
            <Input style={{ width: 260 }} data-testid="input-email" />
          </Form.Item>
          <Form.Item label="Confirmar e-mail" name="confirmarEmail" rules={[{ required: true }]}>
            <Input style={{ width: 260 }} data-testid="input-confirmar-email" />
          </Form.Item>
        </Space>
        {erro && (
          <Alert type="error" message={erro} showIcon style={{ marginBottom: 16 }} data-testid="erro-meus-dados" />
        )}
        {mensagem && (
          <Alert type="success" message={mensagem} showIcon style={{ marginBottom: 16 }} data-testid="sucesso-meus-dados" />
        )}
        <Button type="primary" htmlType="submit" loading={salvando} data-testid="botao-salvar-meus-dados">
          Salvar
        </Button>
      </Form>
    </Card>
  );
}
