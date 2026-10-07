import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

// Nomes do condomínio: como o administrador chama os agrupadores (bloco, torre, rua...) e as unidades (apartamento,
// casa...). São só rótulos de exibição; as chaves técnicas da API (bloco_id, /blocos...) não mudam.

export interface CondominioApi {
  nome: string;
  agrupador_singular: string;
  agrupador_plural: string;
  agrupador_genero: 'm' | 'f';
  agrupador_abrev: string;
  unidade_singular: string;
  unidade_plural: string;
  unidade_genero: 'm' | 'f';
  unidade_abrev: string;
  tem_terreo: number;
  rotulo_terreo: string;
  sem_andares: number;
  andares: number;
  unidades_por_andar: number;
  formato_numeracao: 'andar_sequencia' | 'sequencia';
  configurado: boolean;
  total_de_agrupadores: number;
  total_de_unidades: number;
}

// Formas de um nome, já com a concordância de gênero. Exemplos para "Bloco" (m) / "Torre" (f):
//   s "bloco"/"torre" · S "Bloco"/"Torre" · p "blocos"/"torres" · P "Blocos"/"Torres" · abrev "Bl."/"To."
//   o "o"/"a" · do "do"/"da" · no "no"/"na" · um "um"/"uma" · este "este"/"esta" · esse "esse"/"essa"
//   nesse "nesse"/"nessa" · deste "deste"/"desta" · ao "ao"/"à"
export interface Termo {
  s: string;
  S: string;
  p: string;
  P: string;
  abrev: string;
  o: string;
  do: string;
  no: string;
  um: string;
  este: string;
  esse: string;
  nesse: string;
  deste: string;
  ao: string;
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function montarTermo(singular: string, plural: string, genero: 'm' | 'f', abrev: string): Termo {
  const f = genero === 'f';
  const s = singular.toLowerCase();
  const p = plural.toLowerCase();
  return {
    s, S: maiuscula(s), p, P: maiuscula(p), abrev,
    o: f ? 'a' : 'o', do: f ? 'da' : 'do', no: f ? 'na' : 'no', um: f ? 'uma' : 'um',
    este: f ? 'esta' : 'este', esse: f ? 'essa' : 'esse', nesse: f ? 'nessa' : 'nesse', deste: f ? 'desta' : 'deste',
    ao: f ? 'à' : 'ao',
  };
}

const PADRAO: CondominioApi = {
  nome: 'Condomínio',
  agrupador_singular: 'Bloco', agrupador_plural: 'Blocos', agrupador_genero: 'm', agrupador_abrev: 'Bl.',
  unidade_singular: 'Apartamento', unidade_plural: 'Apartamentos', unidade_genero: 'm', unidade_abrev: 'Ap.',
  tem_terreo: 1, rotulo_terreo: 'Térreo', sem_andares: 0, andares: 3, unidades_por_andar: 4,
  formato_numeracao: 'andar_sequencia', configurado: true, total_de_agrupadores: 0, total_de_unidades: 0,
};

// Troca os marcadores {a.X} (agrupador) e {u.X} (unidade) de um texto fixo — usado na ajuda e no tour.
// Ex.: "Escolha {a.o} {a.s}" → "Escolha o bloco" / "Escolha a torre".
export function aplicarRotulos(texto: string, agrupador: Termo, unidade: Termo): string {
  return texto.replace(/\{([au])\.(\w+)\}/g, (original, quem: string, forma: string) => {
    const termo = (quem === 'a' ? agrupador : unidade) as unknown as Record<string, string>;
    return termo[forma] ?? original;
  });
}

interface CondominioContextValue {
  condominio: CondominioApi;
  agrupador: Termo;
  unidade: Termo;
  carregado: boolean;
  recarregar: () => Promise<void>;
  // "Bl.08/Ap.203" — mesmo formato gravado no histórico de alterações.
  rotuloDaUnidade: (agrupadorNumero: string, unidadeNumero: string) => string;
  // Texto fixo com marcadores {a.X}/{u.X}
  t: (texto: string) => string;
}

const CondominioContext = createContext<CondominioContextValue | undefined>(undefined);

export function CondominioProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [condominio, setCondominio] = useState<CondominioApi>(PADRAO);
  const [carregado, setCarregado] = useState(false);

  const recarregar = useCallback(async () => {
    const { data } = await api.get<CondominioApi>('/condominio');
    setCondominio(data);
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (!usuario) return;
    let ativo = true;
    api
      .get<CondominioApi>('/condominio')
      .then(({ data }) => {
        if (!ativo) return;
        setCondominio(data);
        setCarregado(true);
      })
      .catch(() => ativo && setCarregado(true));
    return () => {
      ativo = false;
    };
  }, [usuario]);

  // Sem usuário logado valem os nomes padrão (a tela de login não os usa); ao entrar, recarregar() busca os reais.
  const condominioAtual = usuario ? condominio : PADRAO;
  const carregadoAtual = usuario ? carregado : false;

  const valor = useMemo<CondominioContextValue>(() => {
    const agrupador = montarTermo(condominioAtual.agrupador_singular, condominioAtual.agrupador_plural, condominioAtual.agrupador_genero, condominioAtual.agrupador_abrev);
    const unidade = montarTermo(condominioAtual.unidade_singular, condominioAtual.unidade_plural, condominioAtual.unidade_genero, condominioAtual.unidade_abrev);
    return {
      condominio: condominioAtual, agrupador, unidade, carregado: carregadoAtual, recarregar,
      rotuloDaUnidade: (a, u) => `${agrupador.abrev}${a}/${unidade.abrev}${u}`,
      t: (texto) => aplicarRotulos(texto, agrupador, unidade),
    };
  }, [condominioAtual, carregadoAtual, recarregar]);

  return <CondominioContext.Provider value={valor}>{children}</CondominioContext.Provider>;
}

export function useCondominio() {
  const ctx = useContext(CondominioContext);
  if (!ctx) throw new Error('useCondominio deve ser usado dentro de um CondominioProvider.');
  return ctx;
}
