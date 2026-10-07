import { useEffect, useState } from 'react';
import { useCondominio } from '../../context/CondominioContext';
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
  const { agrupador, unidade } = useCondominio();
  const [apartamentos, setApartamentos] = useState<MeuApartamento[]>([]);

  useEffect(() => {
    api.get<MeuApartamento[]>('/moradores/meus-apartamentos').then((res) => {
      setApartamentos(res.data);
    });
  }, []);

  return (
    <Card>
      <Title level={4}>{`${unidade.o === 'a' ? 'Minhas' : 'Meus'} ${unidade.P}`}</Title>
      <List
        data-testid="lista-meus-apartamentos"
        dataSource={apartamentos}
        locale={{ emptyText: <Empty description={`Nenhum${unidade.o === 'a' ? 'a' : ''} ${unidade.s} vinculad${unidade.o}.`} data-testid="lista-vazia" /> }}
        renderItem={(apto) => (
          <List.Item data-testid="item-apartamento">
            <List.Item.Meta
              avatar={<HomeOutlined style={{ fontSize: 20 }} />}
              title={`${agrupador.S} ${apto.bloco_numero} / ${unidade.S} ${apto.apartamento_numero}`}
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
