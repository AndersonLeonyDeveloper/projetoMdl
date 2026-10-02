import { createContext, useContext, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

interface AjudaContextValue {
  ativa: boolean; // switch geral: desligado, o ícone some e nenhum tour abre sozinho
  alternarAtiva: (valor: boolean) => void;
  painelAberto: boolean;
  abrirPainel: () => void;
  fecharPainel: () => void;
  tourManual: boolean; // tour aberto pelo botão "Iniciar tour"
  iniciarTour: () => void;
  fecharTour: (rota: string) => void;
  jaViu: (rota: string) => boolean;
}

const AjudaContext = createContext<AjudaContextValue | undefined>(undefined);

const chaveAtiva = (id: number | undefined) => `ajuda:ativa:${id ?? 'anonimo'}`;
const chaveVistas = (id: number | undefined) => `ajuda:vistas:${id ?? 'anonimo'}`;

function lerAtiva(id: number | undefined) {
  return localStorage.getItem(chaveAtiva(id)) !== 'false'; // padrão: ligada
}

function lerVistas(id: number | undefined): string[] {
  try {
    const salvas = JSON.parse(localStorage.getItem(chaveVistas(id)) ?? '[]');
    return Array.isArray(salvas) ? salvas : [];
  } catch {
    return [];
  }
}

function AjudaProviderDoUsuario({ usuarioId, children }: { usuarioId: number | undefined; children: ReactNode }) {
  const [ativa, setAtiva] = useState(() => lerAtiva(usuarioId));
  const [vistas, setVistas] = useState(() => lerVistas(usuarioId));
  const [painelAberto, setPainelAberto] = useState(false);
  const [tourManual, setTourManual] = useState(false);

  function alternarAtiva(valor: boolean) {
    setAtiva(valor);
    localStorage.setItem(chaveAtiva(usuarioId), String(valor));
    if (!valor) {
      setPainelAberto(false);
      setTourManual(false);
    }
  }

  function fecharTour(rota: string) {
    setTourManual(false);
    if (vistas.includes(rota)) return;
    const atualizadas = [...vistas, rota];
    setVistas(atualizadas);
    localStorage.setItem(chaveVistas(usuarioId), JSON.stringify(atualizadas));
  }

  return (
    <AjudaContext.Provider
      value={{
        ativa,
        alternarAtiva,
        painelAberto,
        abrirPainel: () => setPainelAberto(true),
        fecharPainel: () => setPainelAberto(false),
        tourManual,
        iniciarTour: () => {
          setPainelAberto(false);
          setTourManual(true);
        },
        fecharTour,
        jaViu: (rota) => vistas.includes(rota),
      }}
    >
      {children}
    </AjudaContext.Provider>
  );
}

// A chave faz o estado ser relido quando outra pessoa entra no mesmo navegador.
export function AjudaProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  return (
    <AjudaProviderDoUsuario key={usuario?.id ?? 'anonimo'} usuarioId={usuario?.id}>
      {children}
    </AjudaProviderDoUsuario>
  );
}

export function useAjuda() {
  const ctx = useContext(AjudaContext);
  if (!ctx) throw new Error('useAjuda deve ser usado dentro de um AjudaProvider.');
  return ctx;
}
