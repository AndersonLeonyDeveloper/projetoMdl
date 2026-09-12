import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface MeuApartamento {
  tipo: 'proprietario' | 'inquilino';
  apartamento_id: number;
  apartamento_numero: string;
  bloco_numero: string;
}

export function MeusApartamentos() {
  const [apartamentos, setApartamentos] = useState<MeuApartamento[]>([]);

  useEffect(() => {
    api.get<MeuApartamento[]>('/moradores/meus-apartamentos').then((res) => {
      setApartamentos(res.data);
    });
  }, []);

  return (
    <div className="page page-meus-apartamentos">
      <h2>Meus Apartamentos</h2>
      <ul data-testid="lista-meus-apartamentos">
        {apartamentos.map((apto) => (
          <li key={`${apto.bloco_numero}-${apto.apartamento_numero}`} data-testid="item-apartamento">
            Bloco {apto.bloco_numero} / Apto {apto.apartamento_numero} — {apto.tipo}
          </li>
        ))}
        {apartamentos.length === 0 && <li data-testid="lista-vazia">Nenhum apartamento vinculado.</li>}
      </ul>
    </div>
  );
}
