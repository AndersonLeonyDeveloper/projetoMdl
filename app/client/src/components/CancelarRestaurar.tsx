import { useState } from 'react';
import { Button, Input, Modal, Popconfirm, Tooltip, message } from 'antd';
import { api, mensagemDeErro } from '../api/client';

// Cancelar (exclusão lógica, com motivo) e restaurar um lançamento. Usado nas listas de taxas, despesas e outras receitas.
export function CancelarRestaurar({ rota, id, cancelado, bloqueio, rotulo, onAlterado }: {
  rota: 'taxas' | 'despesas' | 'outras-receitas';
  id: number;
  cancelado: boolean;
  bloqueio?: string | null; // texto quando não pode cancelar (ex.: taxa já paga)
  rotulo: string; // "taxa", "despesa" ou "receita"
  onAlterado: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function chamar(acao: 'cancelar' | 'restaurar', corpo?: { motivo: string }) {
    setSalvando(true);
    try {
      await api.post(`/financeiro/${rota}/${id}/${acao}`, corpo);
      message.success(acao === 'cancelar' ? `Cancelada: ${rotulo}.` : `Restaurada: ${rotulo}.`);
      setAberto(false);
      setMotivo('');
      onAlterado();
    } catch (err) {
      message.error(mensagemDeErro(err, `Não foi possível ${acao} a ${rotulo}.`));
    } finally {
      setSalvando(false);
    }
  }

  if (cancelado) {
    return (
      <Popconfirm
        title={`Restaurar esta ${rotulo}?`}
        description="Ela volta às listas e aos totais."
        okText="Restaurar"
        cancelText="Voltar"
        onConfirm={() => chamar('restaurar')}
      >
        <Button type="link" size="small" loading={salvando} data-testid="botao-restaurar">
          Restaurar
        </Button>
      </Popconfirm>
    );
  }

  return (
    <>
      <Tooltip title={bloqueio ?? undefined}>
        <span>
          <Button type="link" danger size="small" disabled={!!bloqueio} onClick={() => setAberto(true)} data-testid="botao-cancelar">
            Cancelar
          </Button>
        </span>
      </Tooltip>
      <Modal
        title={`Cancelar ${rotulo}`}
        open={aberto}
        onCancel={() => setAberto(false)}
        onOk={() => chamar('cancelar', { motivo })}
        okText="Cancelar lançamento"
        okButtonProps={{ danger: true, disabled: motivo.trim().length < 3 }}
        cancelText="Voltar"
        confirmLoading={salvando}
        destroyOnHidden
        data-testid="modal-cancelar"
      >
        <p>
          A {rotulo} sai das listas e dos totais, mas continua guardada e pode ser restaurada. Informe o motivo (de 3 a 200
          caracteres).
        </p>
        <Input.TextArea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={200}
          showCount
          rows={3}
          placeholder="Ex.: lançado em duplicidade"
          data-testid="input-motivo-cancelamento"
        />
      </Modal>
    </>
  );
}
