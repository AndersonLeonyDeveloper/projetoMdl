import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Layout({ title, tabs }: { title: string; tabs: { to: string; label: string }[] }) {
  const { usuario, logout } = useAuth();

  return (
    <div className="layout">
      <header className="layout-header">
        <h1>{title}</h1>
        <div>
          <span data-testid="usuario-logado">{usuario?.email}</span>
          <button onClick={logout} data-testid="botao-logout">
            Sair
          </button>
        </div>
      </header>
      <nav className="layout-tabs">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => (isActive ? 'active' : '')}
            data-testid={`tab-${tab.to.split('/').pop()}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
