import { Tour } from 'antd';
import type { TourProps } from 'antd';
import { useLocation } from 'react-router-dom';
import { AJUDA_POR_ROTA } from './conteudo';
import { useAjuda } from './AjudaContext';

// Tour da tela atual. Abre pelo botão "Iniciar tour" ou sozinho na primeira visita (só com a ajuda ligada).
export function TourDaTela() {
  const { pathname } = useLocation();
  const { ativa, tourManual, jaViu, fecharTour } = useAjuda();
  const ajuda = AJUDA_POR_ROTA[pathname];
  if (!ativa || !ajuda) return null;

  const aberto = tourManual || !jaViu(pathname);
  const ultimo = ajuda.passos.length - 1;
  const steps: TourProps['steps'] = ajuda.passos.map((passo, i) => ({
    title: passo.titulo,
    description: passo.descricao,
    // Alvo ausente na tela (ex.: tabela ainda carregando): o passo aparece centralizado.
    // O cast é seguro: o Tour trata o retorno nulo como "sem alvo".
    target: passo.alvo ? () => document.querySelector(`[data-testid="${passo.alvo}"]`) as HTMLElement : null,
    prevButtonProps: { children: 'Anterior' },
    nextButtonProps: { children: i === ultimo ? 'Concluir' : 'Próximo' },
  }));

  return (
    <Tour
      key={pathname}
      open={aberto}
      steps={steps}
      onClose={() => fecharTour(pathname)}
      onFinish={() => fecharTour(pathname)}
      indicatorsRender={(atual, total) => (
        <span data-testid="tour-indicador">
          {atual + 1} de {total}
        </span>
      )}
    />
  );
}
