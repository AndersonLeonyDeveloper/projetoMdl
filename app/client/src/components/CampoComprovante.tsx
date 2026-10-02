import { Form, Upload, Button } from 'antd';
import type { UploadFile } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png'];
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

// Campo opcional "Comprovante" para os formulários de cadastro financeiro.
export function CampoComprovante({ testId }: { testId: string }) {
  return (
    <Form.Item
      label="Comprovante (opcional)"
      name="comprovante"
      valuePropName="fileList"
      getValueFromEvent={(e: { fileList: UploadFile[] }) => e.fileList.slice(-1)}
      extra="PDF, JPEG ou PNG, até 5 MB."
    >
      <div data-testid={testId}>
        <Upload
          accept=".pdf,.jpg,.jpeg,.png"
          maxCount={1}
          beforeUpload={() => false}
        >
          <Button icon={<UploadOutlined />}>Selecionar arquivo</Button>
        </Upload>
      </div>
    </Form.Item>
  );
}

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
