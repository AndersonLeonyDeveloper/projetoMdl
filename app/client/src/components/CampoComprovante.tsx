import { Form, Upload, Button } from 'antd';
import type { UploadFile } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

// Campo opcional "Comprovante" para os formulários de cadastro financeiro.
export function CampoComprovante({ testId, label = 'Comprovante (opcional)' }: { testId: string; label?: string }) {
  return (
    <Form.Item
      label={label}
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
