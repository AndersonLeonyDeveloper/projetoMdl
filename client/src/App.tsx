import { Navigate, Route, Routes } from 'react-router-dom';
import type { MenuProps } from 'antd';
import {
  UserAddOutlined,
  DollarCircleOutlined,
  EyeOutlined,
  HomeOutlined,
  IdcardOutlined,
  WarningOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import './App.css';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { Login } from './pages/Login';
import { EsqueciSenha } from './pages/EsqueciSenha';
import { Home } from './pages/Home';
import { CadastroMoradores } from './pages/admin/CadastroMoradores';
import { CadastroFinanceiro } from './pages/admin/CadastroFinanceiro';
import { VisualizarFinanceiro } from './pages/admin/VisualizarFinanceiro';
import { VisualizarMoradores } from './pages/admin/VisualizarMoradores';
import { VisualizarInadimplencia } from './pages/admin/VisualizarInadimplencia';
import { MeusApartamentos } from './pages/morador/MeusApartamentos';
import { MeusDados } from './pages/morador/MeusDados';
import { FinanceiroCondominio } from './pages/morador/FinanceiroCondominio';

const ADMIN_MENU: MenuProps['items'] = [
  {
    key: 'cadastro',
    label: 'Cadastro',
    icon: <UserAddOutlined />,
    children: [
      { key: '/admin/cadastro/moradores', label: 'Moradores' },
      { key: '/admin/cadastro/financeiro', label: 'Receitas / Despesas' },
    ],
  },
  {
    key: 'visualizar',
    label: 'Visualizar',
    icon: <EyeOutlined />,
    children: [
      { key: '/admin/visualizar/financeiro', label: 'Financeiro', icon: <DollarCircleOutlined /> },
      { key: '/admin/visualizar/moradores', label: 'Dados dos Moradores', icon: <TeamOutlined /> },
      { key: '/admin/visualizar/inadimplencia', label: 'Taxa de Inadimplência', icon: <WarningOutlined /> },
    ],
  },
];

const MORADOR_MENU: MenuProps['items'] = [
  { key: '/minha-area/apartamentos', label: 'Meus Apartamentos', icon: <HomeOutlined /> },
  { key: '/minha-area/dados', label: 'Meus Dados', icon: <IdcardOutlined /> },
  { key: '/minha-area/financeiro', label: 'Financeiro', icon: <DollarCircleOutlined /> },
];

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/esqueci-senha" element={<EsqueciSenha />} />
      <Route path="/" element={<Home />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['admin']}>
            <AppLayout title="Administração" items={ADMIN_MENU} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="cadastro/moradores" replace />} />
        <Route path="cadastro/moradores" element={<CadastroMoradores />} />
        <Route path="cadastro/financeiro" element={<CadastroFinanceiro />} />
        <Route path="visualizar/financeiro" element={<VisualizarFinanceiro />} />
        <Route path="visualizar/moradores" element={<VisualizarMoradores />} />
        <Route path="visualizar/inadimplencia" element={<VisualizarInadimplencia />} />
      </Route>

      <Route
        path="/minha-area"
        element={
          <ProtectedRoute roles={['proprietario', 'inquilino']}>
            <AppLayout title="Minha Área" items={MORADOR_MENU} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="apartamentos" replace />} />
        <Route path="apartamentos" element={<MeusApartamentos />} />
        <Route path="dados" element={<MeusDados />} />
        <Route path="financeiro" element={<FinanceiroCondominio />} />
      </Route>
    </Routes>
  );
}

export default App;
