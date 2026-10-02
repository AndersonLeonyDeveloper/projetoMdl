import { useEffect, useState } from 'react';
import { Checkbox, Form, Select } from 'antd';
import { api } from '../api/client';

interface Bloco {
  id: number;
  numero: string;
}

// Bloco da despesa (opcional): vazio = despesa geral, dividida igualmente entre os blocos; preenchido = só desse bloco.
export function CampoBlocoDespesa({ testId }: { testId: string }) {
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  useEffect(() => {
    api.get<Bloco[]>('/blocos').then((res) => setBlocos(res.data));
  }, []);
  return (
    <Form.Item
      label="Bloco (opcional)"
      name="bloco_id"
      extra="Sem bloco = despesa geral, dividida por igual entre os blocos."
    >
      <Select
        allowClear
        style={{ width: 240 }}
        placeholder="Geral (todos os blocos)"
        options={blocos.map((b) => ({ value: b.id, label: `Bloco ${b.numero}` }))}
        data-testid={testId}
      />
    </Form.Item>
  );
}

// Marca a despesa como paga com o fundo de reserva (uma obra, por exemplo): ela sai do saldo do fundo.
export function CampoFundoReserva({ testId }: { testId: string }) {
  return (
    <Form.Item name="fundo_reserva" valuePropName="checked" extra="Marque para uma obra paga com o fundo: ela é descontada do saldo do fundo.">
      <Checkbox data-testid={testId}>Paga pelo fundo de reserva</Checkbox>
    </Form.Item>
  );
}
