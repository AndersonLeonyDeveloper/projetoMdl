import { useState } from 'react';
import { Layout, Menu, Button, Typography, Space, Avatar } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { MenuProps } from 'antd';
import { useAuth } from '../context/AuthContext';

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
          {collapsed ? 'CML' : 'Morada da Lagoa'}
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
            <Avatar icon={<UserOutlined />} size="small" />
            <Text data-testid="usuario-logado">{usuario?.email}</Text>
            <Button icon={<LogoutOutlined />} onClick={logout} data-testid="botao-logout">
              Sair
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
