import { Suspense, useState } from 'react';
import { Layout, Menu, Button, Typography, Space, Avatar, Spin, Tooltip } from 'antd';
import { LogoutOutlined, QuestionCircleOutlined, UserOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { MenuProps } from 'antd';
import { useAuth } from '../context/AuthContext';
import { useAjuda } from '../ajuda/AjudaContext';
import { useCondominio } from '../context/CondominioContext';
import { PainelAjuda } from '../ajuda/PainelAjuda';
import { TourDaTela } from '../ajuda/TourDaTela';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export function AppLayout({
  title,
  items,
}: {
  title: string;
  items: MenuProps['items'];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { usuario, logout } = useAuth();
  const { abrirPainel } = useAjuda();
  const { condominio } = useCondominio();
  // Sigla do menu recolhido: iniciais das (até 3) primeiras palavras do nome.
  const sigla = condominio.nome.split(/\s+/).filter((p) => p.length > 2).slice(0, 3).map((p) => p[0].toUpperCase()).join('') || 'CD';
  const location = useLocation();
  const navigate = useNavigate();

  const openKeys = (items ?? [])
    .filter((item): item is NonNullable<MenuProps['items']>[number] & { key: string } => !!item)
    .filter((item) => 'children' in item && item.children)
    .map((item) => String(item.key));

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark">
        <div
          style={{
            height: 48,
            margin: 12,
            color: 'white',
            fontWeight: 'bold',
            fontSize: collapsed ? 14 : 16,
            textAlign: 'center',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          {collapsed ? sigla : condominio.nome}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={openKeys}
          items={items}
          onClick={({ key }) => navigate(key)}
          data-testid="menu-principal"
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingInline: 24,
          }}
        >
          <Text strong style={{ fontSize: 18 }}>
            {title}
          </Text>
          <Space>
            <Tooltip title="Como usar esta tela">
              <Button
                shape="circle"
                icon={<QuestionCircleOutlined />}
                onClick={abrirPainel}
                aria-label="Abrir ajuda"
                data-testid="botao-ajuda"
              />
            </Tooltip>
            <Avatar icon={<UserOutlined />} size="small" />
            <Text data-testid="usuario-logado">{usuario?.email}</Text>
            <Button icon={<LogoutOutlined />} onClick={logout} data-testid="botao-logout">
              Sair
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <Suspense fallback={<Spin size="large" style={{ display: 'block', margin: '80px auto' }} data-testid="carregando-tela" />}>
            <Outlet />
          </Suspense>
        </Content>
        <PainelAjuda />
        <TourDaTela />
      </Layout>
    </Layout>
  );
}
