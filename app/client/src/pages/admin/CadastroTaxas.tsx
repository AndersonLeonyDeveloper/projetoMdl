import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Form, Select, InputNumber, Button, Alert, Space, Divider, Typography, Modal } from 'antd';
import type { UploadFile } from 'antd';
import { api, formatarMoeda, mensagemDeErro } from '../../api/client';
import { CampoComprovante } from '../../components/CampoComprovante';
import { montarFormData, validarComprovante } from '../../utils/comprovante';

interface Bloco {
  id: number;
  numero: string;
}
interface Apartamento {
  id: number;
  bloco_id: number;
  numero: string;
}

const MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

interface TaxaPadrao {
  ano: number;
  valor: number;
}
interface PreviaGeracao {
  total_apartamentos: number;
  existentes: number;
  a_criar: number;
  valor: number | null;
}

// Valores de taxa por ano (Configurações financeiras). "recarregar" atualiza depois de salvar um valor novo.
function useTaxasPadrao() {
  const [taxasPadrao, setTaxasPadrao] = useState<TaxaPadrao[]>([]);
  const recarregar = useCallback(
    () =>
      api
        .get<{ taxas_padrao: TaxaPadrao[] }>('/financeiro/configuracoes')
        .then((res) => setTaxasPadrao(res.data.taxas_padrao)),
    []
  );
  useEffect(() => {
    recarregar();
  }, [recarregar]);
  return { taxasPadrao, recarregar };
}

// Gera de uma vez a taxa do mês para todos os apartamentos que ainda não têm uma.
// O valor do ano é editável aqui: se for novo ou diferente, é salvo como o padrão do ano.
function GerarTaxasDoMes({ taxasPadrao, recarregar }: { taxasPadrao: TaxaPadrao[]; recarregar: () => Promise<void> }) {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());
  const padrao = taxasPadrao.find((t) => t.ano === ano)?.valor;
  // Valor digitado para um ano; ao trocar de ano, volta a valer o padrão daquele ano.
  const [digitado, setDigitado] = useState<{ ano: number; valor: number | null } | null>(null);
  const valor = digitado?.ano === ano ? digitado.valor : (padrao ?? null);
  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'info' | 'error'; texto: React.ReactNode } | null>(null);
  const [modal, contextHolder] = Modal.useModal();

  const referencia = `${String(mes).padStart(2, '0')}/${ano}`;

  async function executar(valorFinal: number) {
    setGerando(true);
    try {
      if (valorFinal !== padrao) {
        await api.put('/financeiro/configuracoes', { taxas_padrao: [{ ano, valor: valorFinal }] });
        await recarregar();
      }
      const { data } = await api.post<{ criadas: number; ignoradas: number }>('/financeiro/taxas/gerar-mes', {
        mes_referencia: mes,
        ano_referencia: ano,
      });
      setMensagem({
        tipo: 'success',
        texto: (
          <>
            {data.criadas} taxa(s) criada(s) e {data.ignoradas} ignorada(s) (já existiam).{' '}
            <Link to={`/admin/visualizar/financeiro?ano=${ano}&mes=${mes}`} data-testid="link-ver-taxas-do-mes">
              Ver taxas do mês
            </Link>{' '}
            (registrar pagamentos).
          </>
        ),
      });
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemDeErro(err, 'Erro ao gerar as taxas do mês.') });
    } finally {
      setGerando(false);
    }
  }

  async function pedirConfirmacao() {
    if (valor == null || valor <= 0) return;
    setMensagem(null);
    setGerando(true);
    try {
      const { data: previa } = await api.get<PreviaGeracao>('/financeiro/taxas/gerar-mes/previa', {
        params: { mes_referencia: mes, ano_referencia: ano },
      });
      if (previa.a_criar === 0) {
        setMensagem({
          tipo: 'info',
          texto: `Todas as ${previa.total_apartamentos} taxas de ${referencia} já existem. Nada a gerar.`,
        });
        return;
      }
      modal.confirm({
        title: 'Gerar taxas do mês',
        okText: 'Gerar',
        cancelText: 'Cancelar',
        content: (
          <div data-testid="confirmacao-gerar-taxas">
            Vai criar <strong>{previa.a_criar}</strong> taxa(s) de <strong>{formatarMoeda(valor)}</strong> para{' '}
            {referencia}
            {previa.existentes > 0 ? ` (${previa.existentes} já existem e serão ignoradas)` : ''}.
            {valor !== padrao && ` O valor será salvo como o padrão de ${ano}.`}
          </div>
        ),
        onOk: () => executar(valor),
      });
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemDeErro(err, 'Erro ao consultar as taxas do mês.') });
    } finally {
      setGerando(false);
    }
  }

  return (
    <div data-testid="gerar-taxas-mes">
      {contextHolder}
      <Typography.Title level={5}>Gerar taxas do mês</Typography.Title>
      <Typography.Paragraph type="secondary">
        Cria a taxa de todos os apartamentos que ainda não têm uma no mês. Taxas já lançadas não são alteradas.
        Depois, registre os pagamentos em Visualizar → Financeiro.
      </Typography.Paragraph>
      <Space wrap align="start">
        <div>
          <div>Mês</div>
          <Select
            value={mes}
            onChange={setMes}
            style={{ width: 100 }}
            data-testid="select-gerar-mes"
            options={MESES.map((m, idx) => ({ value: idx + 1, label: m }))}
          />
        </div>
        <div>
          <div>Ano</div>
          <InputNumber value={ano} onChange={(v) => setAno(Number(v))} style={{ width: 100 }} data-testid="input-gerar-ano" />
        </div>
        <div>
          <div>Valor da taxa em {ano}</div>
          <InputNumber
            value={valor}
            onChange={(v) => setDigitado({ ano, valor: v })}
            min={0}
            step={0.01}
            prefix="R$"
            style={{ width: 150 }}
            data-testid="input-gerar-valor"
          />
          <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12, maxWidth: 220 }}>
            {padrao === undefined
              ? `Sem valor definido para ${ano}: informe aqui e ele passa a ser o padrão do ano.`
              : 'Mudar o valor atualiza o padrão do ano; taxas já lançadas não mudam.'}
          </div>
        </div>
        <div>
          <div>&nbsp;</div>
          <Button
            type="primary"
            loading={gerando}
            disabled={valor == null || valor <= 0}
            onClick={pedirConfirmacao}
            data-testid="botao-gerar-taxas"
          >
            Gerar taxas
          </Button>
        </div>
      </Space>
      {mensagem && (
        <Alert type={mensagem.tipo} message={mensagem.texto} showIcon style={{ marginTop: 16 }} data-testid="mensagem-gerar-taxas" />
      )}
    </div>
  );
}

function LancarTaxa({ taxasPadrao }: { taxasPadrao: TaxaPadrao[] }) {
  const [form] = Form.useForm();
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [apartamentos, setApartamentos] = useState<Apartamento[]>([]);
  const [mensagem, setMensagem] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(
    null
  );
  const [salvando, setSalvando] = useState(false);
  const anoReferencia = Form.useWatch('ano_referencia', form);
  const valorPadrao = taxasPadrao.find((t) => t.ano === anoReferencia)?.valor;

  useEffect(() => {
    api.get<Bloco[]>('/blocos').then((res) => setBlocos(res.data));
  }, []);

  // O valor da taxa vem preenchido com o configurado para o ano; continua editável.
  useEffect(() => {
    form.setFieldValue('valor', valorPadrao);
  }, [form, valorPadrao]);

  async function handleBlocoChange(blocoId: number) {
    form.setFieldValue('apartamento_id', undefined);
    const { data } = await api.get<Apartamento[]>('/apartamentos', { params: { bloco_id: blocoId } });
    setApartamentos(data);
  }

  async function handleFinish(values: {
    apartamento_id: number;
    mes_referencia: number;
    ano_referencia: number;
    valor: number;
    comprovante?: UploadFile[];
  }) {
    setMensagem(null);
    const erroArquivo = validarComprovante(values.comprovante);
    if (erroArquivo) return setMensagem({ tipo: 'error', texto: erroArquivo });
    setSalvando(true);
    try {
      const { apartamento_id, mes_referencia, ano_referencia, valor } = values;
      await api.post(
        '/financeiro/taxas',
        montarFormData({ apartamento_id, mes_referencia, ano_referencia, valor }, values.comprovante)
      );
      setMensagem({ tipo: 'success', texto: 'Taxa lançada com sucesso.' });
      form.resetFields(['valor', 'comprovante']);
      form.setFieldValue('valor', valorPadrao);
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemDeErro(err, 'Erro ao lançar taxa.') });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      data-testid="form-lancar-taxa"
      initialValues={{ ano_referencia: new Date().getFullYear(), mes_referencia: new Date().getMonth() + 1 }}
    >
      <Space wrap size="large" align="start">
        <Form.Item label="Bloco" name="bloco_id" rules={[{ required: true }]}>
          <Select
            style={{ width: 160 }}
            placeholder="Selecione"
            onChange={handleBlocoChange}
            data-testid="select-taxa-bloco"
            options={blocos.map((b) => ({ value: b.id, label: b.numero }))}
          />
        </Form.Item>
        <Form.Item label="Apartamento" name="apartamento_id" rules={[{ required: true }]}>
          <Select
            style={{ width: 160 }}
            placeholder="Selecione"
            data-testid="select-taxa-apartamento"
            options={apartamentos.map((a) => ({ value: a.id, label: a.numero }))}
          />
        </Form.Item>
        <Form.Item label="Mês" name="mes_referencia" rules={[{ required: true }]}>
          <Select
            style={{ width: 100 }}
            options={MESES.map((m, idx) => ({ value: idx + 1, label: m }))}
          />
        </Form.Item>
        <Form.Item label="Ano" name="ano_referencia" rules={[{ required: true }]}>
          <InputNumber style={{ width: 100 }} />
        </Form.Item>
        <Form.Item
          label="Valor"
          name="valor"
          rules={[{ required: true }]}
          extra={
            valorPadrao !== undefined
              ? `Valor padrão de ${anoReferencia}: ${formatarMoeda(valorPadrao)}`
              : 'Sem valor padrão para este ano (Configurações financeiras).'
          }
        >
          <InputNumber
            style={{ width: 140 }}
            min={0}
            step={0.01}
            prefix="R$"
            data-testid="input-valor-taxa"
          />
        </Form.Item>
        <CampoComprovante testId="upload-comprovante-taxa" />
      </Space>
      {mensagem && (
        <Alert type={mensagem.tipo} message={mensagem.texto} showIcon style={{ marginBottom: 16 }} data-testid="mensagem-taxa" />
      )}
      <Button type="primary" htmlType="submit" loading={salvando} data-testid="botao-lancar-taxa">
        Lançar
      </Button>
    </Form>
  );
}


export function CadastroTaxas() {
  const { taxasPadrao, recarregar } = useTaxasPadrao();
  return (
    <Card data-testid="cadastro-taxas">
      <GerarTaxasDoMes taxasPadrao={taxasPadrao} recarregar={recarregar} />
      <Divider />
      <Typography.Title level={5}>Lançar taxa individual</Typography.Title>
      <LancarTaxa taxasPadrao={taxasPadrao} />
    </Card>
  );
}
