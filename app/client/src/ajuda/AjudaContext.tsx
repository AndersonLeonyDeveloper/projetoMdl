import { createContext, useContext, useState, type ReactNode } from 'react';

// Estado de interface da ajuda: painel lateral e tour da tela. Nada é persistido:
// o tour só abre quando o usuário clica em "Iniciar tour da tela".
interface AjudaContextValue {
  painelAberto: boolean;
  abrirPainel: () => void;
  fecharPainel: () => void;
  tourAberto: boolean;
  iniciarTour: () => void;
  fecharTour: () => void;
}

const AjudaContext = createContext<AjudaContextValue | undefined>(undefined);

export function AjudaProvider({ children }: { children: ReactNode }) {
  const [painelAberto, setPainelAberto] = useState(false);
  const [tourAberto, setTourAberto] = useState(false);

  return (
    <AjudaContext.Provider
      value={{
        painelAberto,
        abrirPainel: () => setPainelAberto(true),
        fecharPainel: () => setPainelAberto(false),
        tourAberto,
        iniciarTour: () => {
          setPainelAberto(false);
          setTourAberto(true);
        },
        fecharTour: () => setTourAberto(false),
      }}
    >
      {children}
    </AjudaContext.Provider>
  );
}

export function useAjuda() {
  const ctx = useContext(AjudaContext);
  if (!ctx) throw new Error('useAjuda deve ser usado dentro de um AjudaProvider.');
  return ctx;
}
