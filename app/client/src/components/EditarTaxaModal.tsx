import { useEffect, useState } from 'react';
import { useCondominio } from '../context/CondominioContext';
import { Alert, Button, Checkbox, DatePicker, Descriptions, Form, InputNumber, Modal, Space } from 'antd';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
import { api, formatarMoeda, mensagemDeErro } from '../api/client';
import { CampoComprovante } from './CampoComprovante';
import { montarFormData, validarComprovante } from '../utils/comprovante';
import { ComprovanteLink } from './ComprovanteLink';

export interface TaxaEditavel {
  id: number;
  bloco_numero: string;
  apartamento_numero: string;
  mes_referencia: number;
  ano_referencia: number;
  valor: number;
  juros: number;
  situacao: 'adimplente' | 'inadimplente';
  data_pagamento: string | null;
  comprovante_path: string | null;
}

interface Calculo {
  vencimento: string;
  dias_em_atraso: number;
  multa: number;
  juros: number;
  total: number;
}

interface Valores {
  valor: number;
  data_pagamento: dayjs.Dayjs | null;
  juros: number | null;
  remover_comprovante?: boolean;
  comprovante?: UploadFile[];
}

// Edita uma taxa e registra o pagamento: valor, data de pagamento, juros (calculado, com ajuste manual) e comprovante.
// Apartamento e mês/ano não mudam.
export function EditarTaxaModal({ taxa, onFechar, onSalvo }: {
  taxa: TaxaEditavel | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const { agrupador, unidade } = useCondominio();
  const [form] = Form.useForm<Valores>();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [calculo, setCalculo] = useState<Calculo | null>(null);
  const valor = Form.useWatch('valor', form);
  const dataPagamento = Form.useWatch('data_pagamento', form);
  const juros = Form.useWatch('juros', form);
  const novoArquivo = Form.useWatch('comprovante', form);

  // Prévia do cálculo sempre que muda a data de pagamento ou o valor.
  const dataTexto = dataPagamento ? dataPagamento.format('YYYY-MM-DD') : null;
  useEffect(() => {
    if (!taxa || !dataTexto || valor == null) return;
    let atual = true;
    api
      .get<Calculo>(`/financeiro/taxas/${taxa.id}/calculo-juros`, { params: { data_pagamento: dataTexto, valor } })
      .then((res) => atual && setCalculo(res.data))
      .catch(() => atual && setCalculo(null));
    return () => {
      atual = false;
    };
  }, [taxa, dataTexto, valor]);

  // Ao escolher uma data de pagamento diferente da gravada, o juros passa a ser o calculado (editável).
  function aoMudarData(nova: dayjs.Dayjs | null) {
    if (!taxa) return;
    if (!nova) return form.setFieldValue('juros', null);
    if (nova.format('YYYY-MM-DD') === taxa.data_pagamento) return form.setFieldValue('juros', taxa.juros);
    api
      .get<Calculo>(`/financeiro/taxas/${taxa.id}/calculo-juros`, {
        params: { data_pagamento: nova.format('YYYY-MM-DD'), valor: form.getFieldValue('valor') },
      })
      .then((res) => form.setFieldValue('juros', res.data.juros));
  }

  async function salvar(values: Valores) {
    if (!taxa) return;
    setErro(null);
    const erroArquivo = validarComprovante(values.comprovante);
    if (erroArquivo) return setErro(erroArquivo);
    setSalvando(true);
    try {
      const campos: Record<string, string | number> = {
        valor: values.valor,
        data_pagamento: values.data_pagamento ? values.data_pagamento.format('YYYY-MM-DD') : '',
      };
      if (values.data_pagamento && values.juros != null) campos.juros = values.juros;
      if (values.remover_comprovante) campos.remover_comprovante = 'true';
      await api.put(`/financeiro/taxas/${taxa.id}`, montarFormData(campos, values.comprovante));
      onSalvo();
      onFechar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Erro ao salvar a taxa.'));
    } finally {
      setSalvando(false);
    }
  }

  const previa = dataTexto && valor != null ? calculo : null; // sem data, a prévia anterior não vale
  const divergente = previa && juros != null && Math.abs(previa.juros - juros) >= 0.005;
  const total = (valor ?? 0) + (dataPagamento ? juros ?? 0 : 0);

  return (
    <Modal
      title="Editar taxa / registrar pagamento"
      open={!!taxa}
      onCancel={onFechar}
      onOk={() => form.submit()}
      okText="Salvar"
      cancelText="Cancelar"
      confirmLoading={salvando}
      destroyOnHidden
      afterOpenChange={(aberto) => aberto && setErro(null)}
      data-testid="modal-editar-taxa"
    >
      {taxa && (
        <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
          <Descriptions.Item label={agrupador.S}>{taxa.bloco_numero}</Descriptions.Item>
          <Descriptions.Item label={unidade.S}>{taxa.apartamento_numero}</Descriptions.Item>
          <Descriptions.Item label="Referência">
            {String(taxa.mes_referencia).padStart(2, '0')}/{taxa.ano_referencia}
          </Descriptions.Item>
          <Descriptions.Item label="Vencimento">{previa ? previa.vencimento.split('-').reverse().join('/') : '—'}</Descriptions.Item>
        </Descriptions>
      )}
      <Form
        key={taxa?.id}
        form={form}
        layout="vertical"
        onFinish={salvar}
        preserve={false}
        initialValues={
          taxa
            ? {
                valor: taxa.valor,
                data_pagamento: taxa.data_pagamento ? dayjs(taxa.data_pagamento) : null,
                juros: taxa.data_pagamento ? taxa.juros : null,
                remover_comprovante: false,
                comprovante: [],
              }
            : undefined
        }
        data-testid="form-editar-taxa"
      >
        <Space size="large" align="start" wrap>
          <Form.Item label="Valor" name="valor" rules={[{ required: true }]}>
            <InputNumber style={{ width: 150 }} min={0} step={0.01} prefix="R$" data-testid="input-editar-taxa-valor" />
          </Form.Item>
          <Form.Item label="Data de pagamento" name="data_pagamento" extra="Limpar volta a taxa para inadimplente.">
            <DatePicker
              style={{ width: 160 }}
              format="DD/MM/YYYY"
              allowClear
              onChange={aoMudarData}
              data-testid="input-editar-taxa-data-pagamento"
            />
          </Form.Item>
          <Form.Item label="Juros (multa + atraso)" name="juros">
            <InputNumber
              style={{ width: 150 }}
              min={0}
              step={0.01}
              prefix="R$"
              disabled={!dataPagamento}
              data-testid="input-editar-taxa-juros"
            />
          </Form.Item>
        </Space>

        {previa && (
          <Alert
            type={divergente ? 'warning' : 'info'}
            showIcon
            style={{ marginBottom: 16 }}
            data-testid="previa-juros"
            message={
              previa.dias_em_atraso === 0
                ? 'Pagamento em dia: sem multa nem juros.'
                : `${previa.dias_em_atraso} dia(s) de atraso: multa e juros calculados de ${formatarMoeda(previa.juros)} (total ${formatarMoeda(previa.total)}).`
            }
            description={divergente ? `O juros informado (${formatarMoeda(juros ?? 0)}) difere do calculado.` : undefined}
            action={
              divergente ? (
                <Button size="small" onClick={() => form.setFieldValue('juros', previa.juros)} data-testid="botao-recalcular-juros">
                  Recalcular juros
                </Button>
              ) : undefined
            }
          />
        )}
        {dataPagamento && (
          <p data-testid="total-taxa">
            Total pago pelo morador: <strong>{formatarMoeda(total)}</strong>
          </p>
        )}

        {taxa?.comprovante_path && (
          <Form.Item label="Comprovante atual">
            <Space>
              <ComprovanteLink arquivo={taxa.comprovante_path} />
              <Form.Item name="remover_comprovante" valuePropName="checked" noStyle>
                <Checkbox disabled={(novoArquivo?.length ?? 0) > 0} data-testid="checkbox-remover-comprovante">
                  Remover comprovante
                </Checkbox>
              </Form.Item>
            </Space>
          </Form.Item>
        )}
        <CampoComprovante
          testId="upload-editar-taxa-comprovante"
          label={taxa?.comprovante_path ? 'Substituir comprovante (opcional)' : 'Comprovante (opcional)'}
        />
        {erro && <Alert type="error" message={erro} showIcon data-testid="mensagem-editar-taxa" />}
      </Form>
    </Modal>
  );
}
