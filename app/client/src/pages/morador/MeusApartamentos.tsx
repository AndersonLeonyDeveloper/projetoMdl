import { useEffect, useState } from 'react';
import { Card, List, Tag, Typography, Empty } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import { api } from '../../api/client';

const { Title } = Typography;

interface MeuApartamento {
  tipo: 'proprietario' | 'inquilino';
  apartamento_id: number;
  apartamento_numero: string;
  bloco_numero: string;
}

export function MeusApartamentos() {
  const [apartamentos, setApartamentos] = useState<MeuApartamento[]>([]);

  useEffect(() => {
    api.get<MeuApartamento[]>('/moradores/meus-apartamentos').then((res) => {
      setApartamentos(res.data);
    });
  }, []);

  return (
    <Card>
      <Title level={4}>Meus Apartamentos</Title>
      <List
        data-testid="lista-meus-apartamentos"
        dataSource={apartamentos}
        locale={{ emptyText: <Empty description="Nenhum apartamento vinculado." data-testid="lista-vazia" /> }}
        renderItem={(apto) => (
          <List.Item data-testid="item-apartamento">
            <List.Item.Meta
              avatar={<HomeOutlined style={{ fontSize: 20 }} />}
              title={`Bloco ${apto.bloco_numero} / Apto ${apto.apartamento_numero}`}
              description={
                <Tag color={apto.tipo === 'proprietario' ? 'blue' : 'green'}>{apto.tipo}</Tag>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
