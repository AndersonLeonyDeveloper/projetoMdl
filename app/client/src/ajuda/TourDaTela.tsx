import { Tour } from 'antd';
import type { TourProps } from 'antd';
import { useLocation } from 'react-router-dom';
import { useCondominio } from '../context/CondominioContext';
import { AJUDA_POR_ROTA } from './conteudo';
import { useAjuda } from './AjudaContext';

// Tour da tela atual. Só abre pelo botão "Iniciar tour da tela" do painel de ajuda.
export function TourDaTela() {
  const { pathname } = useLocation();
  const { tourAberto, fecharTour } = useAjuda();
  const { t } = useCondominio();
  const ajuda = AJUDA_POR_ROTA[pathname];
  if (!ajuda) return null;

  const ultimo = ajuda.passos.length - 1;
  const steps: TourProps['steps'] = ajuda.passos.map((passo, i) => ({
    title: t(passo.titulo),
    description: t(passo.descricao),
    // Alvo ausente na tela (ex.: tabela ainda carregando): o passo aparece centralizado.
    // O cast é seguro: o Tour trata o retorno nulo como "sem alvo".
    target: passo.alvo ? () => document.querySelector(`[data-testid="${passo.alvo}"]`) as HTMLElement : null,
    prevButtonProps: { children: 'Anterior' },
    nextButtonProps: { children: i === ultimo ? 'Concluir' : 'Próximo' },
  }));

  return (
    <Tour
      key={pathname}
      open={tourAberto}
      steps={steps}
      onClose={fecharTour}
      onFinish={fecharTour}
      indicatorsRender={(atual, total) => (
        <span data-testid="tour-indicador">
          {atual + 1} de {total}
        </span>
      )}
    />
  );
}
