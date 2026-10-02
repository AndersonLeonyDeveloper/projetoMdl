import { Button, Collapse, Drawer, Empty, Space, Tabs, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AJUDA_POR_ROTA, GUIAS } from './conteudo';
import { useAjuda } from './AjudaContext';

const { Paragraph, Text } = Typography;

// Painel lateral aberto pelo ícone "?": explica a tela atual e lista os guias por tarefa do perfil.
export function PainelAjuda() {
  const { usuario } = useAuth();
  const { ativa, painelAberto, fecharPainel, iniciarTour } = useAjuda();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const ajuda = AJUDA_POR_ROTA[pathname];
  const guias = GUIAS[usuario?.role === 'admin' ? 'admin' : 'morador'];

  if (!ativa) return null;

  return (
    <Drawer title="Ajuda" open={painelAberto} onClose={fecharPainel} size="default" data-testid="painel-ajuda">
      <Tabs
        items={[
          {
            key: 'tela',
            label: 'Nesta tela',
            children: ajuda ? (
              <>
                <Paragraph data-testid="ajuda-resumo-tela">{ajuda.resumo}</Paragraph>
                <Button type="primary" onClick={iniciarTour} data-testid="botao-iniciar-tour">
                  Iniciar tour da tela
                </Button>
              </>
            ) : (
              <Empty description="Esta tela ainda não tem tour." />
            ),
          },
          {
            key: 'guias',
            label: 'Como fazer…',
            children: (
              <Collapse
                data-testid="lista-guias"
                items={guias.map((guia) => ({
                  key: guia.id,
                  label: guia.titulo,
                  children: (
                    <>
                      <Text type="secondary">{guia.descricao}</Text>
                      <Space direction="vertical" size="small" style={{ width: '100%', marginTop: 12 }}>
                        {guia.passos.map((passo, i) => (
                          <div key={i}>
                            <Text>
                              <strong>{i + 1}.</strong> {passo.texto}
                            </Text>
                            {passo.rota && (
                              <div>
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => {
                                    fecharPainel();
                                    navigate(passo.rota!);
                                  }}
                                  data-testid="botao-ir-para-tela"
                                >
                                  Ir para a tela
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </Space>
                    </>
                  ),
                }))}
              />
            ),
          },
        ]}
      />
    </Drawer>
  );
}
