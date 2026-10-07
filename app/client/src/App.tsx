import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spin, type MenuProps } from 'antd';
import {
  UserAddOutlined,
  DollarCircleOutlined,
  EyeOutlined,
  HomeOutlined,
  IdcardOutlined,
  WarningOutlined,
  LineChartOutlined,
  TeamOutlined,
  HistoryOutlined,
  CalendarOutlined,
  BankOutlined,
  FileProtectOutlined,
} from '@ant-design/icons';
import './App.css';
import { AjudaProvider } from './ajuda/AjudaContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { Login } from './pages/Login';
import { EsqueciSenha } from './pages/EsqueciSenha';
import { Home } from './pages/Home';
import { useCondominio } from './context/CondominioContext';

// Telas carregadas sob demanda: cada uma vira um arquivo separado (a biblioteca de gráficos só baixa na Evolução).
const ConfiguracaoInicial = lazy(() => import('./pages/admin/ConfiguracaoInicial').then((m) => ({ default: m.ConfiguracaoInicial })));
const Administradores = lazy(() => import('./pages/admin/Administradores').then((m) => ({ default: m.Administradores })));
const NomesDoCondominio = lazy(() => import('./pages/admin/NomesDoCondominio').then((m) => ({ default: m.NomesDoCondominio })));
const CadastroMoradores = lazy(() => import('./pages/admin/CadastroMoradores').then((m) => ({ default: m.CadastroMoradores })));
const CadastroFinanceiro = lazy(() => import('./pages/admin/CadastroFinanceiro').then((m) => ({ default: m.CadastroFinanceiro })));
const HistoricoAlteracoes = lazy(() => import('./pages/admin/HistoricoAlteracoes').then((m) => ({ default: m.HistoricoAlteracoes })));
const Acordos = lazy(() => import('./pages/admin/Acordos').then((m) => ({ default: m.Acordos })));
const FundoDeReserva = lazy(() => import('./pages/FundoDeReserva').then((m) => ({ default: m.FundoDeReserva })));
const TaxasDoMes = lazy(() => import('./pages/admin/TaxasDoMes').then((m) => ({ default: m.TaxasDoMes })));
const ConfiguracoesFinanceiras = lazy(() => import('./pages/admin/ConfiguracoesFinanceiras').then((m) => ({ default: m.ConfiguracoesFinanceiras })));
const VisualizarFinanceiro = lazy(() => import('./pages/admin/VisualizarFinanceiro').then((m) => ({ default: m.VisualizarFinanceiro })));
const VisualizarMoradores = lazy(() => import('./pages/admin/VisualizarMoradores').then((m) => ({ default: m.VisualizarMoradores })));
const VisualizarInadimplencia = lazy(() => import('./pages/admin/VisualizarInadimplencia').then((m) => ({ default: m.VisualizarInadimplencia })));
const VisualizarEvolucao = lazy(() => import('./pages/admin/VisualizarEvolucao').then((m) => ({ default: m.VisualizarEvolucao })));
const MeusApartamentos = lazy(() => import('./pages/morador/MeusApartamentos').then((m) => ({ default: m.MeusApartamentos })));
const MeusDados = lazy(() => import('./pages/morador/MeusDados').then((m) => ({ default: m.MeusDados })));
const FinanceiroCondominio = lazy(() => import('./pages/morador/FinanceiroCondominio').then((m) => ({ default: m.FinanceiroCondominio })));

const ADMIN_MENU: MenuProps['items'] = [
  { key: '/admin/taxas', label: 'Taxas do mês', icon: <CalendarOutlined /> },
  { key: '/admin/acordos', label: 'Acordos', icon: <FileProtectOutlined /> },
  {
    key: 'cadastro',
    label: 'Cadastro',
    icon: <UserAddOutlined />,
    children: [
      { key: '/admin/cadastro/moradores', label: 'Moradores' },
      { key: '/admin/cadastro/financeiro', label: 'Receitas / Despesas' },
      { key: '/admin/cadastro/configuracoes', label: 'Configurações financeiras' },
      { key: '/admin/cadastro/nomes', label: 'Nomes do condomínio' },
      { key: '/admin/cadastro/administradores', label: 'Administradores' },
    ],
  },
  {
    key: 'visualizar',
    label: 'Visualizar',
    icon: <EyeOutlined />,
    children: [
      { key: '/admin/visualizar/financeiro', label: 'Financeiro', icon: <DollarCircleOutlined /> },
      { key: '/admin/visualizar/evolucao', label: 'Evolução', icon: <LineChartOutlined /> },
      { key: '/admin/visualizar/moradores', label: 'Dados dos Moradores', icon: <TeamOutlined /> },
      { key: '/admin/visualizar/inadimplencia', label: 'Taxa de Inadimplência', icon: <WarningOutlined /> },
      { key: '/admin/visualizar/fundo', label: 'Fundo de reserva', icon: <BankOutlined /> },
      { key: '/admin/visualizar/historico', label: 'Histórico de alterações', icon: <HistoryOutlined /> },
    ],
  },
];

const moradorMenu = (unidadesNome: string): MenuProps['items'] => [
  { key: '/minha-area/apartamentos', label: `Meus ${unidadesNome}`, icon: <HomeOutlined /> },
  { key: '/minha-area/dados', label: 'Meus Dados', icon: <IdcardOutlined /> },
  { key: '/minha-area/financeiro', label: 'Financeiro', icon: <DollarCircleOutlined /> },
  { key: '/minha-area/fundo-reserva', label: 'Fundo de reserva', icon: <BankOutlined /> },
];

// O endereço antigo da tela de taxas continua funcionando e leva para a tela única, mantendo os filtros da URL.
function RedirecionarParaTaxasDoMes() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/admin/taxas', search }} replace />;
}

function App() {
  const { unidade } = useCondominio();
  return (
    <AjudaProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/esqueci-senha" element={<EsqueciSenha />} />
      <Route path="/" element={<Home />} />
      <Route
        path="/configuracao-inicial"
        element={
          <ProtectedRoute roles={['admin']} semConfiguracao>
            <Suspense fallback={<Spin size="large" style={{ display: 'block', margin: '120px auto' }} />}>
              <ConfiguracaoInicial />
            </Suspense>
          </ProtectedRoute>
        }
      />

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
        <Route path="taxas" element={<TaxasDoMes />} />
        <Route path="acordos" element={<Acordos />} />
        <Route path="cadastro/taxas" element={<RedirecionarParaTaxasDoMes />} />
        <Route path="cadastro/financeiro" element={<CadastroFinanceiro />} />
        <Route path="cadastro/configuracoes" element={<ConfiguracoesFinanceiras />} />
        <Route path="cadastro/nomes" element={<NomesDoCondominio />} />
        <Route path="cadastro/administradores" element={<Administradores />} />
        <Route path="visualizar/financeiro" element={<VisualizarFinanceiro />} />
        <Route path="visualizar/evolucao" element={<VisualizarEvolucao />} />
        <Route path="visualizar/moradores" element={<VisualizarMoradores />} />
        <Route path="visualizar/inadimplencia" element={<VisualizarInadimplencia />} />
        <Route path="visualizar/fundo" element={<FundoDeReserva />} />
        <Route path="visualizar/historico" element={<HistoricoAlteracoes />} />
      </Route>

      <Route
        path="/minha-area"
        element={
          <ProtectedRoute roles={['proprietario', 'inquilino']}>
            <AppLayout title="Minha Área" items={moradorMenu(unidade.P)} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="apartamentos" replace />} />
        <Route path="apartamentos" element={<MeusApartamentos />} />
        <Route path="dados" element={<MeusDados />} />
        <Route path="financeiro" element={<FinanceiroCondominio />} />
        <Route path="fundo-reserva" element={<FundoDeReserva />} />
      </Route>
    </Routes>
    </AjudaProvider>
  );
}

export default App;
