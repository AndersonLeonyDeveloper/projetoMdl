import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Form, Input, Button, Alert, Typography } from 'antd';
import { api } from '../api/client';

const { Title } = Typography;

interface EsqueciSenhaValues {
  email: string;
}

export function EsqueciSenha() {
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleFinish(values: EsqueciSenhaValues) {
    setCarregando(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: values.email });
      setMensagem(data.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="page-esqueci-senha">
      <Card style={{ width: 360 }}>
        <Title level={4} style={{ textAlign: 'center' }}>
          Informe o seu e-mail
        </Title>
        <Form<EsqueciSenhaValues>
          layout="vertical"
          onFinish={handleFinish}
          data-testid="esqueci-senha-form"
          requiredMark={false}
        >
          <Form.Item
            label="E-mail"
            name="email"
            rules={[{ required: true, message: 'Informe o e-mail.' }, { type: 'email', message: 'E-mail inválido.' }]}
          >
            <Input data-testid="esqueci-senha-email" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={carregando}
              data-testid="esqueci-senha-solicitar"
            >
              Solicitar
            </Button>
          </Form.Item>
        </Form>
        {mensagem && (
          <Alert
            type="success"
            message={mensagem}
            showIcon
            style={{ marginBottom: 16 }}
            data-testid="esqueci-senha-mensagem"
          />
        )}
        <div style={{ textAlign: 'center' }}>
          <Link to="/login">Voltar ao login</Link>
        </div>
      </Card>
    </div>
  );
}
