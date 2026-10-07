import { useEffect, useState } from 'react';
import { Alert, Button, Card, Divider, Form, Input, InputNumber, Radio, Select, Space, Switch, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useCondominio } from '../../context/CondominioContext';

const { Title, Paragraph, Text } = Typography;

interface Previa {
  agrupadores: number;
  unidades_por_agrupador: number;
  total_de_unidades: number;
  exemplo_agrupadores: string[];
  exemplo_andares: { andar: string | null; numeros: string[] }[];
}

interface Valores {
  nome: string;
  agrupador_singular: string;
  agrupador_plural: string;
  agrupador_genero: 'm' | 'f';
  agrupador_abrev: string;
  unidade_singular: string;
  unidade_plural: string;
  unidade_genero: 'm' | 'f';
  unidade_abrev: string;
  agrupadores: number;
  sem_andares: boolean;
  andares: number;
  tem_terreo: boolean;
  rotulo_terreo: string;
  unidades_por_andar: number;
  formato_numeracao: 'andar_sequencia' | 'sequencia';
  nova_senha_admin?: string;
}

// Atalhos para os nomes mais comuns; tudo continua editável.
const MODELOS: Record<string, { rotulo: string; valores: Partial<Valores> }> = {
  bloco: {
    rotulo: 'Blocos de apartamentos',
    valores: { agrupador_singular: 'Bloco', agrupador_plural: 'Blocos', agrupador_genero: 'm', agrupador_abrev: 'Bl.', unidade_singular: 'Apartamento', unidade_plural: 'Apartamentos', unidade_genero: 'm', unidade_abrev: 'Ap.', sem_andares: false },
  },
  torre: {
    rotulo: 'Torres de apartamentos',
    valores: { agrupador_singular: 'Torre', agrupador_plural: 'Torres', agrupador_genero: 'f', agrupador_abrev: 'To.', unidade_singular: 'Apartamento', unidade_plural: 'Apartamentos', unidade_genero: 'm', unidade_abrev: 'Ap.', sem_andares: false },
  },
  edificio: {
    rotulo: 'Edifícios de apartamentos',
    valores: { agrupador_singular: 'Edifício', agrupador_plural: 'Edifícios', agrupador_genero: 'm', agrupador_abrev: 'Ed.', unidade_singular: 'Apartamento', unidade_plural: 'Apartamentos', unidade_genero: 'm', unidade_abrev: 'Ap.', sem_andares: false },
  },
  rua: {
    rotulo: 'Casas em ruas (sem andares)',
    valores: { agrupador_singular: 'Rua', agrupador_plural: 'Ruas', agrupador_genero: 'f', agrupador_abrev: 'R.', unidade_singular: 'Casa', unidade_plural: 'Casas', unidade_genero: 'f', unidade_abrev: 'Ca.', sem_andares: true },
  },
  quadra: {
    rotulo: 'Casas em quadras (sem andares)',
    valores: { agrupador_singular: 'Quadra', agrupador_plural: 'Quadras', agrupador_genero: 'f', agrupador_abrev: 'Q.', unidade_singular: 'Casa', unidade_plural: 'Casas', unidade_genero: 'f', unidade_abrev: 'Ca.', sem_andares: true },
  },
};

const INICIAL: Valores = {
  ...(MODELOS.bloco.valores as Valores),
  nome: '',
  agrupadores: 2,
  andares: 5,
  tem_terreo: false,
  rotulo_terreo: 'Térreo',
  unidades_por_andar: 4,
  formato_numeracao: 'andar_sequencia',
};

function montarCorpo(v: Valores) {
  return {
    ...v,
    sem_andares: Boolean(v.sem_andares),
    tem_terreo: Boolean(v.tem_terreo),
    nova_senha_admin: v.nova_senha_admin || undefined,
  };
}

// Primeiro acesso do administrador: define como o condomínio é chamado e gera a estrutura. Só acontece uma vez.
export function ConfiguracaoInicial() {
  const [form] = Form.useForm<Valores>();
  const valores = Form.useWatch([], form) as Valores | undefined;
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { recarregar } = useCondominio();
  const navigate = useNavigate();

  // Prévia ao vivo (com uma pequena espera para não chamar a API a cada tecla).
  useEffect(() => {
    if (!valores) return;
    const timer = setTimeout(() => {
      api
        .post<Previa>('/condominio/previa', montarCorpo(valores))
        .then(({ data }) => {
          setPrevia(data);
          setErroPrevia(null);
        })
        .catch((e) => {
          setPrevia(null);
          setErroPrevia(e.response?.data?.error ?? 'Não foi possível calcular a prévia.');
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [valores]);

  const semAndares = Boolean(valores?.sem_andares);
  const agr = valores?.agrupador_singular?.toLowerCase() || 'agrupador';
  const agrP = valores?.agrupador_plural?.toLowerCase() || 'agrupadores';
  const uniP = valores?.unidade_plural?.toLowerCase() || 'unidades';

  function aplicarModelo(chave: string) {
    form.setFieldsValue(MODELOS[chave].valores);
  }

  async function salvar(v: Valores) {
    setSalvando(true);
    try {
      await api.post('/condominio', montarCorpo(v));
      message.success('Estrutura criada.');
      await recarregar();
      navigate('/admin', { replace: true });
    } catch (e) {
      const erro = e as { response?: { data?: { error?: string } } };
      message.error(erro.response?.data?.error ?? 'Não foi possível criar a estrutura.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: '32px auto', padding: '0 16px' }} data-testid="configuracao-inicial">
      <Title level={2}>Configuração inicial</Title>
      <Paragraph>
        Bem-vindo! Antes de usar o sistema, diga como o seu condomínio é organizado. Isso é feito uma única vez: depois
        só é possível acrescentar {agrP} e {uniP} e mudar os nomes exibidos — os existentes não são removidos nem renumerados.
      </Paragraph>

      <Form form={form} layout="vertical" initialValues={INICIAL} onFinish={salvar} requiredMark={false}>
        <Card title="1. Nomes" style={{ marginBottom: 16 }}>
          <Form.Item label="Nome do condomínio" name="nome">
            <Input placeholder="Ex.: Edifício Sol Nascente" maxLength={80} data-testid="input-nome-condominio" />
          </Form.Item>
          <Form.Item label="Modelo de partida (você pode ajustar depois)">
            <Select
              placeholder="Escolha um modelo"
              defaultValue="bloco"
              onChange={aplicarModelo}
              options={Object.entries(MODELOS).map(([value, m]) => ({ value, label: m.rotulo }))}
              data-testid="select-modelo"
            />
          </Form.Item>
          <Space align="start" wrap size="large">
            <Card size="small" title="Como chama cada prédio ou grupo" style={{ width: 360 }}>
              <Form.Item label="Singular" name="agrupador_singular" rules={[{ required: true, message: 'Informe o nome.' }]}>
                <Input maxLength={30} placeholder="Bloco, Torre, Rua..." data-testid="input-agrupador-singular" />
              </Form.Item>
              <Form.Item label="Plural" name="agrupador_plural" rules={[{ required: true, message: 'Informe o plural.' }]}>
                <Input maxLength={30} data-testid="input-agrupador-plural" />
              </Form.Item>
              <Form.Item label="Abreviação" name="agrupador_abrev" rules={[{ required: true, message: 'Informe a abreviação.' }]}>
                <Input maxLength={6} style={{ width: 100 }} data-testid="input-agrupador-abrev" />
              </Form.Item>
              <Form.Item label="Gênero" name="agrupador_genero">
                <Radio.Group data-testid="radio-agrupador-genero">
                  <Radio value="m">Masculino (o)</Radio>
                  <Radio value="f">Feminino (a)</Radio>
                </Radio.Group>
              </Form.Item>
            </Card>
            <Card size="small" title="Como chama cada unidade" style={{ width: 360 }}>
              <Form.Item label="Singular" name="unidade_singular" rules={[{ required: true, message: 'Informe o nome.' }]}>
                <Input maxLength={30} placeholder="Apartamento, Casa, Sala..." data-testid="input-unidade-singular" />
              </Form.Item>
              <Form.Item label="Plural" name="unidade_plural" rules={[{ required: true, message: 'Informe o plural.' }]}>
                <Input maxLength={30} data-testid="input-unidade-plural" />
              </Form.Item>
              <Form.Item label="Abreviação" name="unidade_abrev" rules={[{ required: true, message: 'Informe a abreviação.' }]}>
                <Input maxLength={6} style={{ width: 100 }} data-testid="input-unidade-abrev" />
              </Form.Item>
              <Form.Item label="Gênero" name="unidade_genero">
                <Radio.Group data-testid="radio-unidade-genero">
                  <Radio value="m">Masculino (o)</Radio>
                  <Radio value="f">Feminino (a)</Radio>
                </Radio.Group>
              </Form.Item>
            </Card>
          </Space>
        </Card>

        <Card title="2. Estrutura" style={{ marginBottom: 16 }}>
          <Form.Item label={`Quantos ${agrP} existem?`} name="agrupadores" rules={[{ required: true, message: 'Informe a quantidade.' }]}>
            <InputNumber min={1} max={200} precision={0} data-testid="input-agrupadores" />
          </Form.Item>
          <Form.Item label="Sem andares (ex.: casas, só uma lista de unidades)" name="sem_andares" valuePropName="checked">
            <Switch data-testid="switch-sem-andares" />
          </Form.Item>
          {!semAndares && (
            <>
              <Form.Item label="Quantos andares (sem contar o térreo)?" name="andares">
                <InputNumber min={0} max={100} precision={0} data-testid="input-andares" />
              </Form.Item>
              <Space align="end" wrap>
                <Form.Item label="O primeiro andar tem unidades e se chama…" name="tem_terreo" valuePropName="checked">
                  <Switch checkedChildren="Com térreo" unCheckedChildren="Sem térreo" data-testid="switch-terreo" />
                </Form.Item>
                <Form.Item name="rotulo_terreo" label=" ">
                  <Input maxLength={30} style={{ width: 160 }} disabled={!valores?.tem_terreo} data-testid="input-rotulo-terreo" />
                </Form.Item>
              </Space>
            </>
          )}
          <Form.Item
            label={semAndares ? `Quantas ${uniP} por ${agr}?` : `Quantas ${uniP} por andar?`}
            name="unidades_por_andar"
            rules={[{ required: true, message: 'Informe a quantidade.' }]}
          >
            <InputNumber min={1} max={200} precision={0} data-testid="input-unidades-por-andar" />
          </Form.Item>
          {!semAndares && (
            <Form.Item label="Numeração" name="formato_numeracao">
              <Radio.Group data-testid="radio-numeracao">
                <Radio value="andar_sequencia">Pelo andar (101, 102… 201, 202…)</Radio>
                <Radio value="sequencia">Sequencial (01, 02, 03…)</Radio>
              </Radio.Group>
            </Form.Item>
          )}
        </Card>

        <Card title="3. Prévia" style={{ marginBottom: 16 }} data-testid="previa-estrutura">
          {erroPrevia && <Alert type="warning" showIcon message={erroPrevia} />}
          {previa && (
            <>
              <Paragraph>
                Serão criados <Text strong>{previa.agrupadores}</Text> {agrP} e{' '}
                <Text strong data-testid="previa-total">{previa.total_de_unidades}</Text> {uniP} ({previa.unidades_por_agrupador} por {agr}).
              </Paragraph>
              <Paragraph>
                {valores?.agrupador_plural}: {previa.exemplo_agrupadores.join(', ')}
                {previa.agrupadores > previa.exemplo_agrupadores.length ? '…' : ''}
              </Paragraph>
              {previa.exemplo_andares.map((a) => (
                <div key={a.andar ?? 'todas'}>
                  <Text type="secondary">{a.andar ?? valores?.unidade_plural}: </Text>
                  {a.numeros.join(', ')}…
                </div>
              ))}
            </>
          )}
        </Card>

        <Card title="4. Segurança (opcional)" style={{ marginBottom: 16 }}>
          <Form.Item
            label="Nova senha do administrador"
            name="nova_senha_admin"
            extra="O administrador novo começa com a senha padrão. Recomendamos trocá-la agora (mínimo de 6 caracteres)."
            rules={[{ min: 6, message: 'Use ao menos 6 caracteres.' }]}
          >
            <Input.Password autoComplete="new-password" data-testid="input-nova-senha" />
          </Form.Item>
        </Card>

        <Divider />
        <Button type="primary" htmlType="submit" size="large" loading={salvando} disabled={!previa} data-testid="botao-criar-estrutura">
          Criar estrutura
        </Button>
      </Form>
    </div>
  );
}
