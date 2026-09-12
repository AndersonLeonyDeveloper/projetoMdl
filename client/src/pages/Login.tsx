import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card, Form, Input, Button, Alert, Typography } from 'antd';
import { useAuth } from '../context/AuthContext';

const { Title } = Typography;

interface LoginFormValues {
  email: string;
  senha: string;
}

export function Login() {
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleFinish(values: LoginFormValues) {
    setErro(null);
    setCarregando(true);
    try {
      await login(values.email, values.senha);
      navigate('/');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          setErro('E-mail ou senha inválidos.');
        } else if (!err.response) {
          setErro('Não foi possível conectar ao servidor. Verifique se a API está rodando.');
        } else {
          setErro(`Erro inesperado (${err.response.status}). Veja o console para detalhes.`);
        }
        console.error('Falha no login:', err);
      } else {
        setErro('Erro inesperado ao entrar.');
        console.error(err);
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="page-login">
      <Card style={{ width: 360 }}>
        <Title level={3} style={{ textAlign: 'center' }}>
          Condomínio Morada da Lagoa
        </Title>
        <Form<LoginFormValues>
          layout="vertical"
          onFinish={handleFinish}
          data-testid="login-form"
          requiredMark={false}
        >
          <Form.Item
            label="E-mail"
            name="email"
            rules={[{ required: true, message: 'Informe o e-mail.' }, { type: 'email', message: 'E-mail inválido.' }]}
          >
            <Input data-testid="login-email" autoComplete="username" />
          </Form.Item>
          <Form.Item
            label="Senha"
            name="senha"
            rules={[{ required: true, message: 'Informe a senha.' }]}
          >
            <Input.Password data-testid="login-senha" autoComplete="current-password" />
          </Form.Item>
          {erro && (
            <Form.Item>
              <Alert type="error" message={erro} showIcon data-testid="login-erro" />
            </Form.Item>
          )}
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={carregando}
              data-testid="login-submit"
            >
              Entrar
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          <Link to="/esqueci-senha" data-testid="link-esqueci-senha">
            Esqueceu a senha?
          </Link>
        </div>
      </Card>
    </div>
  );
}
