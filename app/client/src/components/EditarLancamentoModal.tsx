import { useState } from 'react';
import { Alert, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Space } from 'antd';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
import { api, mensagemDeErro } from '../api/client';
import { CampoComprovante } from './CampoComprovante';
import { montarFormData, validarComprovante } from '../utils/comprovante';
import { ComprovanteLink } from './ComprovanteLink';

export interface Lancamento {
  id: number;
  descricao: string;
  valor: number;
  data: string;
  comprovante_path: string | null;
}

interface Valores {
  descricao: string;
  valor: number;
  data: dayjs.Dayjs;
  remover_comprovante?: boolean;
  comprovante?: UploadFile[];
}

// Edita uma despesa ou outra receita: descrição, valor, data e comprovante (manter, trocar ou remover).
export function EditarLancamentoModal({ rota, rotulo, lancamento, onFechar, onSalvo }: {
  rota: string;
  rotulo: string;
  lancamento: Lancamento | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [form] = Form.useForm<Valores>();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const novoArquivo = Form.useWatch('comprovante', form);

  async function salvar(values: Valores) {
    if (!lancamento) return;
    setErro(null);
    const erroArquivo = validarComprovante(values.comprovante);
    if (erroArquivo) return setErro(erroArquivo);
    setSalvando(true);
    try {
      const campos: Record<string, string | number> = {
        descricao: values.descricao,
        valor: values.valor,
        data: values.data.format('YYYY-MM-DD'),
      };
      if (values.remover_comprovante) campos.remover_comprovante = 'true';
      await api.put(`/financeiro/${rota}/${lancamento.id}`, montarFormData(campos, values.comprovante));
      onSalvo();
      onFechar();
    } catch (err) {
      setErro(mensagemDeErro(err, `Erro ao salvar ${rotulo.toLowerCase()}.`));
    } finally {
      setSalvando(false);
    }
  }

  const temNovoArquivo = (novoArquivo?.length ?? 0) > 0;

  return (
    <Modal
      title={`Editar ${rotulo.toLowerCase()}`}
      open={!!lancamento}
      onCancel={onFechar}
      onOk={() => form.submit()}
      okText="Salvar"
      cancelText="Cancelar"
      confirmLoading={salvando}
      destroyOnHidden
      afterOpenChange={(aberto) => aberto && setErro(null)}
      data-testid="modal-editar-lancamento"
    >
      <Form
        key={lancamento?.id}
        form={form}
        layout="vertical"
        onFinish={salvar}
        preserve={false}
        initialValues={
          lancamento ? {
            descricao: lancamento.descricao,
            valor: lancamento.valor,
            data: dayjs(lancamento.data),
            remover_comprovante: false,
            comprovante: [],
          } : undefined
        }
        data-testid="form-editar-lancamento"
      >
        <Form.Item label="Descrição" name="descricao" rules={[{ required: true, whitespace: true }]}>
          <Input data-testid="input-editar-descricao" />
        </Form.Item>
        <Space size="large" align="start" wrap>
          <Form.Item label="Valor" name="valor" rules={[{ required: true }]}>
            <InputNumber style={{ width: 160 }} min={0} step={0.01} prefix="R$" data-testid="input-editar-valor" />
          </Form.Item>
          <Form.Item label="Data" name="data" rules={[{ required: true }]}>
            <DatePicker style={{ width: 160 }} format="DD/MM/YYYY" data-testid="input-editar-data" />
          </Form.Item>
        </Space>
        {lancamento?.comprovante_path && (
          <Form.Item label="Comprovante atual">
            <Space>
              <ComprovanteLink arquivo={lancamento.comprovante_path} />
              <Form.Item name="remover_comprovante" valuePropName="checked" noStyle>
                <Checkbox disabled={temNovoArquivo} data-testid="checkbox-remover-comprovante">
                  Remover comprovante
                </Checkbox>
              </Form.Item>
            </Space>
          </Form.Item>
        )}
        <CampoComprovante
          testId="upload-editar-comprovante"
          label={lancamento?.comprovante_path ? 'Substituir comprovante (opcional)' : 'Comprovante (opcional)'}
        />
        {erro && <Alert type="error" message={erro} showIcon data-testid="mensagem-editar-lancamento" />}
      </Form>
    </Modal>
  );
}
