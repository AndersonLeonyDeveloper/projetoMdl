import { useEffect, useState } from 'react';
import { Form, Select } from 'antd';
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
