import { useState } from 'react';
import { Button, message } from 'antd';
import { api } from '../api/client';

// O endpoint exige token, então o arquivo é baixado via axios e aberto como blob.
export function ComprovanteLink({ arquivo }: { arquivo: string | null }) {
  const [carregando, setCarregando] = useState(false);

  if (!arquivo) return <span>—</span>;

  async function abrir() {
    // Abre a aba antes do await para o navegador não bloquear como popup.
    const aba = window.open('', '_blank');
    setCarregando(true);
    try {
      const { data } = await api.get<Blob>(`/financeiro/comprovantes/${arquivo}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      if (aba) aba.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      aba?.close();
      message.error('Não foi possível abrir o comprovante.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Button type="link" size="small" loading={carregando} onClick={abrir} data-testid="link-comprovante">
      Ver comprovante
    </Button>
  );
}
