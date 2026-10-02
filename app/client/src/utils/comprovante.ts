import type { UploadFile } from 'antd';

const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png'];
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

// Monta o corpo multipart; o arquivo só entra se foi escolhido.
export function montarFormData(campos: Record<string, string | number>, fileList?: UploadFile[]) {
  const form = new FormData();
  Object.entries(campos).forEach(([chave, valor]) => form.append(chave, String(valor)));
  const arquivo = fileList?.[0]?.originFileObj;
  if (arquivo) form.append('comprovante', arquivo);
  return form;
}

// Validação no cliente (o servidor valida de novo). Retorna a mensagem de erro, se houver.
export function validarComprovante(fileList?: UploadFile[]): string | null {
  const arquivo = fileList?.[0]?.originFileObj;
  if (!arquivo) return null;
  if (!TIPOS_ACEITOS.includes(arquivo.type)) return 'O comprovante deve ser um arquivo PDF, JPEG ou PNG.';
  if (arquivo.size > TAMANHO_MAXIMO) return 'O comprovante deve ter no máximo 5 MB.';
  return null;
}
