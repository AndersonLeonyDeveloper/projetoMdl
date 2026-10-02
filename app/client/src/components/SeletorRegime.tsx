import { Segmented, Typography } from 'antd';

export type Regime = 'competencia' | 'caixa';

// Escolhe como as taxas entram no resumo do mês: pelo mês de referência (competência) ou pelo mês do pagamento (caixa).
export function SeletorRegime({ valor, onChange }: { valor: Regime; onChange: (regime: Regime) => void }) {
  return (
    <div>
      <div>Regime</div>
      <Segmented
        value={valor}
        onChange={(v) => onChange(v as Regime)}
        options={[
          { label: 'Competência', value: 'competencia' },
          { label: 'Caixa', value: 'caixa' },
        ]}
        data-testid="segmented-regime"
      />
      <div style={{ maxWidth: 320 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }} data-testid="explicacao-regime">
          {valor === 'competencia'
            ? 'Competência: a taxa conta no mês a que se refere, mesmo paga depois.'
            : 'Caixa: a taxa conta no mês em que foi paga.'}
        </Typography.Text>
      </div>
    </div>
  );
}
