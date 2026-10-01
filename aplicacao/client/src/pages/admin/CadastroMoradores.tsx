import { useEffect, useState } from 'react';
import { Card, Form, Input, Select, Button, Alert, Typography, Space } from 'antd';
import { api } from '../../api/client';

const { Title } = Typography;

interface Bloco {
  id: number;
  numero: string;
}
interface Apartamento {
  id: number;
  bloco_id: number;
  numero: string;
}

interface FormValues {
  bloco_id: number;
  apartamento_id: number;
  tipo: 'proprietario' | 'inquilino';
  nome: string;
  telefone: string;
  cpf?: string;
  email: string;
  confirmarEmail: string;
}

export function CadastroMoradores() {
  const [form] = Form.useForm<FormValues>();
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [apartamentos, setApartamentos] = useState<Apartamento[]>([]);
  const [tipoSelecionado, setTipoSelecionado] = useState<'proprietario' | 'inquilino'>(
    'proprietario'
  );
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.get<Bloco[]>('/blocos').then((res) => setBlocos(res.data));
  }, []);

  async function handleBlocoChange(blocoId: number) {
    form.setFieldValue('apartamento_id', undefined);
    const { data } = await api.get<Apartamento[]>('/apartamentos', { params: { bloco_id: blocoId } });
    setApartamentos(data);
  }

  async function handleSubmit(values: FormValues) {
    setErro(null);
    setSucesso(null);
    if (values.email !== values.confirmarEmail) {
      setErro('Confirmação de e-mail não confere.');
      return;
    }
    setSalvando(true);
    try {
      await api.post('/moradores', {
        apartamento_id: values.apartamento_id,
        tipo: values.tipo,
        nome: values.nome,
        telefone: values.telefone,
        cpf: values.cpf || null,
        email: values.email,
      });
      setSucesso('Morador cadastrado com sucesso.');
      form.resetFields();
      setApartamentos([]);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        'Erro ao cadastrar morador.';
      setErro(message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <Title level={4}>Cadastro de Morador</Title>
      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        data-testid="form-cadastro-morador"
      >
        <Space wrap size="large" align="start">
          <Form.Item
            label="Bloco"
            name="bloco_id"
            rules={[{ required: true, message: 'Selecione o bloco.' }]}
          >
            <Select
              style={{ width: 160 }}
              placeholder="Selecione"
              onChange={handleBlocoChange}
              data-testid="select-bloco"
              options={blocos.map((b) => ({ value: b.id, label: b.numero }))}
            />
          </Form.Item>
          <Form.Item
            label="Apartamento"
            name="apartamento_id"
            rules={[{ required: true, message: 'Selecione o apartamento.' }]}
          >
            <Select
              style={{ width: 160 }}
              placeholder="Selecione"
              data-testid="select-apartamento"
              options={apartamentos.map((a) => ({ value: a.id, label: a.numero }))}
            />
          </Form.Item>
          <Form.Item label="Tipo morador" name="tipo" initialValue="proprietario">
            <Select
              style={{ width: 160 }}
              data-testid="select-tipo"
              onChange={setTipoSelecionado}
              options={[
                { value: 'proprietario', label: 'Proprietário' },
                { value: 'inquilino', label: 'Inquilino' },
              ]}
            />
          </Form.Item>
        </Space>
        <Space wrap size="large" align="start">
          <Form.Item
            label="Nome"
            name="nome"
            rules={[{ required: true, message: 'Informe o nome.' }]}
          >
            <Input style={{ width: 220 }} data-testid="input-nome" />
          </Form.Item>
          <Form.Item
            label="Telefone"
            name="telefone"
            rules={[{ required: true, message: 'Informe o telefone.' }]}
          >
            <Input style={{ width: 180 }} placeholder="(85) 99999-9999" data-testid="input-telefone" />
          </Form.Item>
          {tipoSelecionado === 'proprietario' && (
            <Form.Item
              label="CPF"
              name="cpf"
              rules={[{ required: true, message: 'Informe o CPF.' }]}
            >
              <Input style={{ width: 180 }} placeholder="000.000.000-00" data-testid="input-cpf" />
            </Form.Item>
          )}
        </Space>
        <Space wrap size="large" align="start">
          <Form.Item
            label="E-mail"
            name="email"
            rules={[{ required: true, message: 'Informe o e-mail.' }, { type: 'email', message: 'E-mail inválido.' }]}
          >
            <Input style={{ width: 260 }} data-testid="input-email" />
          </Form.Item>
          <Form.Item
            label="Confirmar e-mail"
            name="confirmarEmail"
            rules={[{ required: true, message: 'Confirme o e-mail.' }]}
          >
            <Input style={{ width: 260 }} data-testid="input-confirmar-email" />
          </Form.Item>
        </Space>
        {erro && (
          <Alert type="error" message={erro} showIcon style={{ marginBottom: 16 }} data-testid="erro-cadastro-morador" />
        )}
        {sucesso && (
          <Alert type="success" message={sucesso} showIcon style={{ marginBottom: 16 }} data-testid="sucesso-cadastro-morador" />
        )}
        <Button type="primary" htmlType="submit" loading={salvando} data-testid="botao-salvar-morador">
          Salvar
        </Button>
      </Form>
    </Card>
  );
}
