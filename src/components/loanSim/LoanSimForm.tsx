import type { LoanRepaymentType, LoanSimInputs } from '../../features/loanSim/types';

type LoanSimFormProps = {
    inputs: LoanSimInputs;
    calculatedLoanAmount: number;
    onChange: <K extends keyof LoanSimInputs>(key: K, value: LoanSimInputs[K]) => void;
    onReset: () => void;
};

type NumberFieldProps = {
    label: string;
    value: number;
    onChange: (value: number) => void;
    unit: string;
    min: number;
    max: number;
    step: number;
    helperText?: string;
    showSlider?: boolean;
    disabled?: boolean;
    displayFormatter?: (value: number) => string;
};

const REPAYMENT_OPTIONS: Array<{
    value: LoanRepaymentType;
    label: string;
    description: string;
}> = [
    {
        value: 'equal-payment',
        label: '元利均等',
        description: '毎月返済額をそろえて見たいとき向けです。',
    },
    {
        value: 'equal-principal',
        label: '元金均等',
        description: '初月を重くして、残高の減り方を早めたいとき向けです。',
    },
];

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function readInputNumber(rawValue: string): number {
    if (rawValue.trim() === '') {
        return 0;
    }
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number): string {
    return `${new Intl.NumberFormat('ja-JP').format(Math.round(value))}円`;
}

function formatPercent(value: number): string {
    return `${value.toFixed(2).replace(/\.?0+$/, '')}%`;
}

function formatYears(value: number): string {
    return `${Math.round(value)}年`;
}

function NumberField({
    label,
    value,
    onChange,
    unit,
    min,
    max,
    step,
    helperText,
    showSlider = true,
    disabled = false,
    displayFormatter,
}: NumberFieldProps) {
    const displayedValue = displayFormatter ? displayFormatter(value) : `${value}${unit}`;
    const sliderValue = clamp(value, min, max);

    return (
        <label className={`loan-sim-field ${disabled ? 'is-disabled' : ''}`}>
            <div className="loan-sim-field-head">
                <span>{label}</span>
                <strong>{displayedValue}</strong>
            </div>
            <div className={`loan-sim-field-input-row ${showSlider ? '' : 'is-number-only'}`}>
                <div className="loan-sim-number-input-wrap">
                    <input
                        className="loan-sim-number-input"
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={Number.isFinite(value) ? value : 0}
                        disabled={disabled}
                        onChange={(event) => onChange(readInputNumber(event.target.value))}
                    />
                    <span className="loan-sim-input-unit">{unit}</span>
                </div>
                {showSlider && (
                    <input
                        className="loan-sim-range-input"
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={sliderValue}
                        disabled={disabled}
                        onChange={(event) => onChange(Number(event.target.value))}
                    />
                )}
            </div>
            {helperText ? <p className="loan-sim-field-help">{helperText}</p> : null}
        </label>
    );
}

export function LoanSimForm({ inputs, calculatedLoanAmount, onChange, onReset }: LoanSimFormProps) {
    return (
        <section className="loan-sim-card loan-sim-form-card">
            <div className="loan-sim-card-head">
                <div>
                    <h2>入力条件</h2>
                    <p>借入条件・積立・固定費を入れると、その場で返済結果を更新します。</p>
                </div>
                <button type="button" className="nav-btn" onClick={onReset}>
                    条件をリセット
                </button>
            </div>

            <div className="loan-sim-form-stack">
                <div className="loan-sim-form-section">
                    <h3>借入条件</h3>
                    <NumberField
                        label="物件価格"
                        value={inputs.propertyPrice}
                        onChange={(value) => onChange('propertyPrice', value)}
                        unit="円"
                        min={0}
                        max={120_000_000}
                        step={100_000}
                        displayFormatter={formatCurrency}
                    />
                    <NumberField
                        label="頭金"
                        value={inputs.downPayment}
                        onChange={(value) => onChange('downPayment', value)}
                        unit="円"
                        min={0}
                        max={60_000_000}
                        step={100_000}
                        displayFormatter={formatCurrency}
                    />

                    <div className="loan-sim-manual-toggle">
                        <label className="loan-sim-check-label">
                            <input
                                type="checkbox"
                                checked={inputs.isLoanAmountManual}
                                onChange={(event) => onChange('isLoanAmountManual', event.target.checked)}
                            />
                            借入額を直接入力する
                        </label>
                        <span className="loan-sim-toggle-meta">
                            {inputs.isLoanAmountManual ? '物件価格 / 頭金とは独立して計算します。' : '物件価格 - 頭金 で自動計算します。'}
                        </span>
                    </div>

                    <NumberField
                        label="借入額"
                        value={inputs.isLoanAmountManual ? inputs.loanAmount : calculatedLoanAmount}
                        onChange={(value) => onChange('loanAmount', value)}
                        unit="円"
                        min={0}
                        max={120_000_000}
                        step={100_000}
                        displayFormatter={formatCurrency}
                        showSlider={false}
                        disabled={!inputs.isLoanAmountManual}
                        helperText={inputs.isLoanAmountManual ? '手入力した借入額を優先します。' : '物件価格と頭金から自動で反映しています。'}
                    />

                    <NumberField
                        label="年利"
                        value={inputs.annualRate}
                        onChange={(value) => onChange('annualRate', value)}
                        unit="%"
                        min={0}
                        max={5}
                        step={0.01}
                        displayFormatter={formatPercent}
                    />
                    <NumberField
                        label="返済年数"
                        value={inputs.repaymentYears}
                        onChange={(value) => onChange('repaymentYears', value)}
                        unit="年"
                        min={1}
                        max={50}
                        step={1}
                        displayFormatter={formatYears}
                    />

                    <div className="loan-sim-field">
                        <div className="loan-sim-field-head">
                            <span>返済方式</span>
                            <strong>{inputs.repaymentType === 'equal-payment' ? '元利均等' : '元金均等'}</strong>
                        </div>
                        <div className="loan-sim-choice-grid">
                            {REPAYMENT_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`loan-sim-choice-btn ${inputs.repaymentType === option.value ? 'is-active' : ''}`}
                                    onClick={() => onChange('repaymentType', option.value)}
                                >
                                    <span className="loan-sim-choice-title">{option.label}</span>
                                    <span className="loan-sim-choice-description">{option.description}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <label className="loan-sim-field">
                        <div className="loan-sim-field-head">
                            <span>開始年月</span>
                            <strong>{inputs.startYearMonth || '未設定'}</strong>
                        </div>
                        <input
                            className="loan-sim-month-input"
                            type="month"
                            value={inputs.startYearMonth}
                            onChange={(event) => onChange('startYearMonth', event.target.value)}
                        />
                        <p className="loan-sim-field-help">完済年月とボーナス返済の月割りは、この開始年月を基準に並べます。</p>
                    </label>
                </div>

                <div className="loan-sim-form-section">
                    <h3>積立・固定費</h3>
                    <NumberField
                        label="毎月積立額"
                        value={inputs.monthlySavings}
                        onChange={(value) => onChange('monthlySavings', value)}
                        unit="円"
                        min={0}
                        max={300_000}
                        step={1_000}
                        displayFormatter={formatCurrency}
                    />
                    <NumberField
                        label="積立の年利"
                        value={inputs.savingsAnnualRate}
                        onChange={(value) => onChange('savingsAnnualRate', value)}
                        unit="%"
                        min={0}
                        max={8}
                        step={0.01}
                        displayFormatter={formatPercent}
                        showSlider={false}
                    />
                    <NumberField
                        label="ボーナス返済額（年2回）"
                        value={inputs.bonusRepayment}
                        onChange={(value) => onChange('bonusRepayment', value)}
                        unit="円"
                        min={0}
                        max={1_000_000}
                        step={10_000}
                        displayFormatter={formatCurrency}
                        showSlider={false}
                        helperText="開始から 6 か月ごとの月末に、元本への追加返済として扱います。"
                    />
                    <NumberField
                        label="管理費・修繕費などの毎月固定費"
                        value={inputs.monthlyFixedCost}
                        onChange={(value) => onChange('monthlyFixedCost', value)}
                        unit="円"
                        min={0}
                        max={100_000}
                        step={1_000}
                        displayFormatter={formatCurrency}
                        showSlider={false}
                    />
                </div>
            </div>
        </section>
    );
}
