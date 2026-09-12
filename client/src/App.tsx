import { Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { EsqueciSenha } from './pages/EsqueciSenha';
import { Home } from './pages/Home';
import { Moradores } from './pages/admin/Moradores';
import { Financeiro } from './pages/admin/Financeiro';
import { MeusApartamentos } from './pages/morador/MeusApartamentos';
import { MeusDados } from './pages/morador/MeusDados';
import { FinanceiroCondominio } from './pages/morador/FinanceiroCondominio';

const ADMIN_TABS = [
  { to: '/admin/moradores', label: 'Moradores' },
  { to: '/admin/financeiro', label: 'Financeiro' },
];

const MORADOR_TABS = [
  { to: '/minha-area/apartamentos', label: 'Meus Apartamentos' },
  { to: '/minha-area/dados', label: 'Meus Dados' },
  { to: '/minha-area/financeiro', label: 'Financeiro' },
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
            <Layout title="Admin" tabs={ADMIN_TABS} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="moradores" replace />} />
        <Route path="moradores" element={<Moradores />} />
        <Route path="financeiro" element={<Financeiro />} />
      </Route>

      <Route
        path="/minha-area"
        element={
          <ProtectedRoute roles={['proprietario', 'inquilino']}>
            <Layout title="Usuário" tabs={MORADOR_TABS} />
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
