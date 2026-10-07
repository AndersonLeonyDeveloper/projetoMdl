import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Radio, Space, Typography, message } from 'antd';
import { api } from '../../api/client';
import { useCondominio } from '../../context/CondominioContext';

const { Title, Paragraph } = Typography;

// Nomes exibidos em todo o sistema. A estrutura e os números das unidades não mudam aqui.
export function NomesDoCondominio() {
  const [form] = Form.useForm();
  const { condominio, agrupador, unidade, recarregar } = useCondominio();
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    form.setFieldsValue(condominio);
  }, [condominio, form]);

  async function salvar(valores: Record<string, unknown>) {
    setSalvando(true);
    try {
      await api.put('/condominio/rotulos', valores);
      await recarregar();
      message.success('Nomes atualizados.');
    } catch (e) {
      const erro = e as { response?: { data?: { error?: string } } };
      message.error(erro.response?.data?.error ?? 'Não foi possível salvar os nomes.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div data-testid="pagina-nomes">
      <Title level={3}>Nomes do condomínio</Title>
      <Paragraph>
        Como {agrupador.p} e {unidade.p} aparecem nas telas, nos textos de ajuda e no histórico. Trocar um nome não altera
        os números já cadastrados. O histórico de alterações já gravado mantém a abreviação da época.
      </Paragraph>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={`${condominio.total_de_agrupadores} ${agrupador.p} e ${condominio.total_de_unidades} ${unidade.p} cadastrad${unidade.o}s.`}
      />
      <Form form={form} layout="vertical" onFinish={salvar} requiredMark={false}>
        <Form.Item label="Nome do condomínio" name="nome" rules={[{ required: true, message: 'Informe o nome.' }]}>
          <Input maxLength={80} style={{ maxWidth: 420 }} data-testid="input-nome-condominio" />
        </Form.Item>
        <Space align="start" wrap size="large">
          <Card size="small" title="Prédio ou grupo" style={{ width: 360 }}>
            <Form.Item label="Singular" name="agrupador_singular" rules={[{ required: true, message: 'Informe o nome.' }]}>
              <Input maxLength={30} data-testid="input-agrupador-singular" />
            </Form.Item>
            <Form.Item label="Plural" name="agrupador_plural" rules={[{ required: true, message: 'Informe o plural.' }]}>
              <Input maxLength={30} data-testid="input-agrupador-plural" />
            </Form.Item>
            <Form.Item label="Abreviação" name="agrupador_abrev" rules={[{ required: true, message: 'Informe a abreviação.' }]}>
              <Input maxLength={6} style={{ width: 100 }} data-testid="input-agrupador-abrev" />
            </Form.Item>
            <Form.Item label="Gênero" name="agrupador_genero">
              <Radio.Group>
                <Radio value="m">Masculino (o)</Radio>
                <Radio value="f">Feminino (a)</Radio>
              </Radio.Group>
            </Form.Item>
          </Card>
          <Card size="small" title="Unidade" style={{ width: 360 }}>
            <Form.Item label="Singular" name="unidade_singular" rules={[{ required: true, message: 'Informe o nome.' }]}>
              <Input maxLength={30} data-testid="input-unidade-singular" />
            </Form.Item>
            <Form.Item label="Plural" name="unidade_plural" rules={[{ required: true, message: 'Informe o plural.' }]}>
              <Input maxLength={30} data-testid="input-unidade-plural" />
            </Form.Item>
            <Form.Item label="Abreviação" name="unidade_abrev" rules={[{ required: true, message: 'Informe a abreviação.' }]}>
              <Input maxLength={6} style={{ width: 100 }} data-testid="input-unidade-abrev" />
            </Form.Item>
            <Form.Item label="Gênero" name="unidade_genero">
              <Radio.Group>
                <Radio value="m">Masculino (o)</Radio>
                <Radio value="f">Feminino (a)</Radio>
              </Radio.Group>
            </Form.Item>
          </Card>
        </Space>
        {!condominio.sem_andares && (
          <Form.Item label="Nome do primeiro andar (térreo)" name="rotulo_terreo" style={{ marginTop: 16 }}>
            <Input maxLength={30} style={{ maxWidth: 200 }} data-testid="input-rotulo-terreo" />
          </Form.Item>
        )}
        <Button type="primary" htmlType="submit" loading={salvando} data-testid="botao-salvar-nomes">
          Salvar nomes
        </Button>
      </Form>
    </div>
  );
}
