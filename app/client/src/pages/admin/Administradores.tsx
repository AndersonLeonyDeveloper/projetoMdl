import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Popconfirm, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../../api/client';

const { Title, Paragraph } = Typography;

interface Administrador {
  id: number;
  email: string;
  ativo: boolean;
  created_at: string; // UTC, "AAAA-MM-DD HH:MM:SS"
  eu: boolean;
}

const erroDa = (e: unknown, padrao: string) =>
  (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? padrao;
const dataBr = (utc: string) => utc.slice(0, 10).split('-').reverse().join('/');
const REGRA_SENHA = [{ min: 6, message: 'Use ao menos 6 caracteres.' }];

// Contas de administrador do condomínio. Quem entra aqui já é administrador; não existe perfil acima dele.
export function Administradores() {
  const [admins, setAdmins] = useState<Administrador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novoAberto, setNovoAberto] = useState(false);
  const [minhaSenhaAberta, setMinhaSenhaAberta] = useState(false);
  const [redefinindo, setRedefinindo] = useState<Administrador | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formNovo] = Form.useForm();
  const [formMinha] = Form.useForm();
  const [formRedefinir] = Form.useForm();

  // O efeito só busca; recarregar() pede uma nova busca (contador) a partir de um evento.
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let ativo = true;
    api
      .get<Administrador[]>('/administradores')
      .then(({ data }) => ativo && setAdmins(data))
      .catch((e) => ativo && message.error(erroDa(e, 'Não foi possível carregar os administradores.')))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [versao]);
  const recarregar = () => {
    setCarregando(true);
    setVersao((v) => v + 1);
  };

  async function executar(acao: () => Promise<unknown>, sucesso: string, aoTerminar?: () => void) {
    setSalvando(true);
    try {
      await acao();
      message.success(sucesso);
      aoTerminar?.();
      recarregar();
    } catch (e) {
      message.error(erroDa(e, 'Não foi possível concluir a operação.'));
    } finally {
      setSalvando(false);
    }
  }

  const criar = (v: { email: string; senha: string }) =>
    executar(() => api.post('/administradores', { email: v.email, senha: v.senha }), 'Administrador criado.', () => {
      setNovoAberto(false);
      formNovo.resetFields();
    });

  const alterarAtivo = (a: Administrador, ativo: boolean) =>
    executar(() => api.put(`/administradores/${a.id}/ativo`, { ativo }), ativo ? 'Conta reativada.' : 'Conta desativada.');

  const redefinir = (v: { nova_senha: string }) =>
    executar(() => api.put(`/administradores/${redefinindo!.id}/senha`, { nova_senha: v.nova_senha }), 'Senha redefinida.', () => {
      setRedefinindo(null);
      formRedefinir.resetFields();
    });

  const trocarMinha = (v: { senha_atual: string; nova_senha: string }) =>
    executar(() => api.post('/auth/trocar-senha', { senha_atual: v.senha_atual, nova_senha: v.nova_senha }), 'Senha alterada.', () => {
      setMinhaSenhaAberta(false);
      formMinha.resetFields();
    });

  const colunas: ColumnsType<Administrador> = [
    {
      title: 'E-mail',
      dataIndex: 'email',
      render: (email: string, a) => (
        <Space>
          {email}
          {a.eu && <Tag color="blue">você</Tag>}
        </Space>
      ),
    },
    {
      title: 'Situação',
      dataIndex: 'ativo',
      render: (ativo: boolean) => (ativo ? <Tag color="green">Ativo</Tag> : <Tag color="red">Desativado</Tag>),
    },
    { title: 'Criado em', dataIndex: 'created_at', render: dataBr },
    {
      title: 'Ações',
      render: (_, a) => (
        <Space>
          {a.ativo ? (
            <Tooltip title={a.eu ? 'Você não pode desativar a própria conta.' : ''}>
              <Popconfirm
                title="Desativar esta conta?"
                description="A pessoa perde o acesso na hora. Você pode reativar depois."
                okText="Desativar"
                cancelText="Cancelar"
                disabled={a.eu}
                onConfirm={() => alterarAtivo(a, false)}
              >
                <Button size="small" danger disabled={a.eu} data-testid={`botao-desativar-${a.id}`}>
                  Desativar
                </Button>
              </Popconfirm>
            </Tooltip>
          ) : (
            <Button size="small" onClick={() => alterarAtivo(a, true)} data-testid={`botao-reativar-${a.id}`}>
              Reativar
            </Button>
          )}
          <Tooltip title={a.eu ? 'Para trocar a sua senha use "Minha senha".' : ''}>
            <Button size="small" disabled={a.eu} onClick={() => setRedefinindo(a)} data-testid={`botao-redefinir-senha-${a.id}`}>
              Redefinir senha
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="pagina-administradores">
      <Title level={3}>Administradores</Title>
      <Paragraph>
        Quem pode administrar o condomínio. Uma conta desativada perde o acesso na hora, mas continua registrada no histórico de
        alterações. O último administrador ativo nunca pode ser desativado.
      </Paragraph>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="As senhas nunca aparecem aqui nem no histórico. Ao redefinir a senha de alguém, combine com a pessoa como ela vai recebê-la e peça que a troque em seguida."
      />
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => setNovoAberto(true)} data-testid="botao-novo-admin">
          Novo administrador
        </Button>
        <Button onClick={() => setMinhaSenhaAberta(true)} data-testid="botao-minha-senha">
          Minha senha
        </Button>
      </Space>
      <Table<Administrador>
        rowKey="id"
        size="middle"
        loading={carregando}
        columns={colunas}
        dataSource={admins}
        pagination={false}
        data-testid="tabela-administradores"
      />

      <Modal title="Novo administrador" open={novoAberto} onCancel={() => setNovoAberto(false)} footer={null} destroyOnClose>
        <Form form={formNovo} layout="vertical" onFinish={criar} requiredMark={false}>
          <Form.Item label="E-mail" name="email" rules={[{ required: true, type: 'email', message: 'Informe um e-mail válido.' }]}>
            <Input autoComplete="off" data-testid="input-admin-email" />
          </Form.Item>
          <Form.Item label="Senha inicial" name="senha" rules={[{ required: true, message: 'Informe a senha.' }, ...REGRA_SENHA]}>
            <Input.Password autoComplete="new-password" data-testid="input-admin-senha" />
          </Form.Item>
          <Form.Item
            label="Confirmar senha"
            name="confirmar"
            dependencies={['senha']}
            rules={[
              { required: true, message: 'Confirme a senha.' },
              ({ getFieldValue }) => ({
                validator: (_, v) => (!v || getFieldValue('senha') === v ? Promise.resolve() : Promise.reject(new Error('As senhas não conferem.'))),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" data-testid="input-admin-confirmar" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={salvando} data-testid="botao-salvar-admin">
            Criar administrador
          </Button>
        </Form>
      </Modal>

      <Modal title="Minha senha" open={minhaSenhaAberta} onCancel={() => setMinhaSenhaAberta(false)} footer={null} destroyOnClose>
        <Form form={formMinha} layout="vertical" onFinish={trocarMinha} requiredMark={false}>
          <Form.Item label="Senha atual" name="senha_atual" rules={[{ required: true, message: 'Informe a senha atual.' }]}>
            <Input.Password autoComplete="current-password" data-testid="input-senha-atual" />
          </Form.Item>
          <Form.Item label="Nova senha" name="nova_senha" rules={[{ required: true, message: 'Informe a nova senha.' }, ...REGRA_SENHA]}>
            <Input.Password autoComplete="new-password" data-testid="input-nova-senha-propria" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={salvando} data-testid="botao-salvar-minha-senha">
            Trocar senha
          </Button>
        </Form>
      </Modal>

      <Modal
        title={redefinindo ? `Redefinir a senha de ${redefinindo.email}` : ''}
        open={redefinindo !== null}
        onCancel={() => setRedefinindo(null)}
        footer={null}
        destroyOnClose
      >
        <Form form={formRedefinir} layout="vertical" onFinish={redefinir} requiredMark={false}>
          <Form.Item label="Nova senha" name="nova_senha" rules={[{ required: true, message: 'Informe a nova senha.' }, ...REGRA_SENHA]}>
            <Input.Password autoComplete="new-password" data-testid="input-redefinir-senha" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={salvando} data-testid="botao-salvar-redefinir">
            Redefinir senha
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
