import type { ReactNode } from 'react';
import { LoanSimFieldHelp } from './LoanSimFieldHelp';
import type { LoanRepaymentType, LoanSimInputs, LoanSimSavedPreset } from '../../features/loanSim/types';

type LoanSimFormProps = {
    inputs: LoanSimInputs;
    calculatedLoanAmount: number;
    presetName: string;
    presetStatus: string | null;
    savedPresets: LoanSimSavedPreset[];
    onChange: <K extends keyof LoanSimInputs>(key: K, value: LoanSimInputs[K]) => void;
    onPresetNameChange: (value: string) => void;
    onSavePreset: () => void;
    onApplyPreset: (presetId: string) => void;
    onDeletePreset: (presetId: string) => void;
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
    help?: {
        title: string;
        body: ReactNode;
        ariaLabel?: string;
    };
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

const FIELD_HELP = {
    propertyPrice: {
        title: '物件価格とは？',
        body: <p>建物と土地を合わせた総額です。頭金を引いた残りを、借入額の基準として使います。</p>,
    },
    downPayment: {
        title: '頭金とは？',
        body: <p>購入時に自己資金で先に支払う額です。増やすほど借入額が小さくなり、利息負担も抑えやすくなります。</p>,
    },
    isLoanAmountManual: {
        title: '借入額を直接入力するとは？',
        body: (
            <>
                <p>オフのときは「物件価格 - 頭金」で自動計算します。</p>
                <p>オンにすると、この画面で入力した借入額を優先し、物件価格と頭金とは独立して扱います。</p>
            </>
        ),
    },
    loanAmount: {
        title: '借入額とは？',
        body: (
            <>
                <p>住宅ローンとして実際に借りる元本です。</p>
                <p>自動計算時は「物件価格 - 頭金」、直接入力時はここで指定した値を返済計算に使います。</p>
            </>
        ),
    },
    annualRate: {
        title: '年利とは？',
        body: <p>ローンにかかる年間の金利です。内部では 12 で割って月利にし、毎月の利息計算へ反映します。</p>,
    },
    annualIncome: {
        title: '年収とは？',
        body: (
            <>
                <p>返済余力を見るための税込み年収です。</p>
                <p>サマリーでは月換算の年収と、一定条件で概算した手取り月額に対する毎月返済額の割合を表示します。</p>
            </>
        ),
    },
    repaymentYears: {
        title: '返済年数とは？',
        body: <p>完済までの年数です。年数が長いほど月額は抑えやすくなりますが、総利息は増えやすくなります。</p>,
    },
    repaymentType: {
        title: '返済方式とは？',
        body: (
            <>
                <p>毎月の返し方を選ぶ項目です。</p>
                <ul>
                    <li><strong>元利均等:</strong> 毎月返済額をそろえやすく、家計の見通しを立てやすい方式です。</li>
                    <li><strong>元金均等:</strong> 元金を毎月ほぼ一定で返すため、初月は重めですが残高の減りは早くなります。</li>
                </ul>
            </>
        ),
    },
    startYearMonth: {
        title: '開始年月とは？',
        body: <p>返済表の起点になる年月です。完済年月や、ボーナス返済が入る月の並びもこの開始年月を基準に決まります。</p>,
    },
    monthlySavings: {
        title: '毎月積立額とは？',
        body: <p>住居費とは別に毎月末に積み立てる額です。総支出には含めつつ、資産側の残高としても集計します。</p>,
    },
    savingsAnnualRate: {
        title: '積立の年利とは？',
        body: <p>積立残高に対して見込む年間の運用利率です。内部では月利に換算し、前月残高へ反映したうえで当月積立額を加えます。</p>,
    },
    bonusRepayment: {
        title: 'ボーナス返済額とは？',
        body: (
            <>
                <p>年 2 回の追加返済として扱う額です。</p>
                <p>この画面では開始年月から 6 か月ごとの月末に、元本への追加返済として反映します。</p>
            </>
        ),
    },
    monthlyFixedCost: {
        title: '毎月固定費とは？',
        body: <p>管理費・修繕積立金・駐車場代など、ローンとは別に毎月かかる住居費です。月総支出に合算して表示します。</p>,
    },
} as const;

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

function formatPresetUpdatedAt(value: number): string {
    if (!Number.isFinite(value) || value <= 0) {
        return '更新時刻不明';
    }
    return new Date(value).toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function FieldLabel({
    label,
    help,
}: {
    label: string;
    help?: NumberFieldProps['help'];
}) {
    return (
        <span className="loan-sim-label-wrap">
            <span>{label}</span>
            {help ? (
                <LoanSimFieldHelp title={help.title} ariaLabel={help.ariaLabel ?? `${label}の説明`}>
                    {help.body}
                </LoanSimFieldHelp>
            ) : null}
        </span>
    );
}

function NumberField({
    label,
    value,
    onChange,
    unit,
    min,
    max,
    step,
    help,
    showSlider = true,
    disabled = false,
    displayFormatter,
}: NumberFieldProps) {
    const displayedValue = displayFormatter ? displayFormatter(value) : `${value}${unit}`;
    const sliderValue = clamp(value, min, max);

    return (
        <div className={`loan-sim-field ${disabled ? 'is-disabled' : ''}`}>
            <div className="loan-sim-field-head">
                <FieldLabel label={label} help={help} />
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
                        aria-label={label}
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
                        aria-label={`${label}のスライダー`}
                        onChange={(event) => onChange(Number(event.target.value))}
                    />
                )}
            </div>
        </div>
    );
}

export function LoanSimForm({
    inputs,
    calculatedLoanAmount,
    presetName,
    presetStatus,
    savedPresets,
    onChange,
    onPresetNameChange,
    onSavePreset,
    onApplyPreset,
    onDeletePreset,
    onReset,
}: LoanSimFormProps) {
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

            <div className="loan-sim-preset-panel">
                <div className="loan-sim-preset-head">
                    <div>
                        <h3>保存した条件</h3>
                        <p>よく使う条件を名前付きで保存して、あとで読み込めます。</p>
                    </div>
                    <span className="loan-sim-badge">{savedPresets.length}件</span>
                </div>
                <div className="loan-sim-preset-save-row">
                    <input
                        className="loan-sim-text-input"
                        type="text"
                        value={presetName}
                        placeholder="例: 共働き標準プラン"
                        aria-label="保存する条件名"
                        onChange={(event) => onPresetNameChange(event.target.value)}
                    />
                    <button type="button" className="nav-btn" onClick={onSavePreset}>
                        名前を付けて保存
                    </button>
                </div>
                <p className="loan-sim-inline-note">
                    {presetStatus ?? '同じ名前で保存すると、その条件を上書きします。'}
                </p>
                {savedPresets.length > 0 ? (
                    <div className="loan-sim-preset-list">
                        {savedPresets.map((preset) => (
                            <div key={preset.id} className="loan-sim-preset-item">
                                <div className="loan-sim-preset-meta">
                                    <strong>{preset.name}</strong>
                                    <span>{formatPresetUpdatedAt(preset.updatedAt)} 更新</span>
                                </div>
                                <div className="loan-sim-preset-actions">
                                    <button
                                        type="button"
                                        className="nav-btn"
                                        onClick={() => onApplyPreset(preset.id)}
                                    >
                                        読み込む
                                    </button>
                                    <button
                                        type="button"
                                        className="nav-btn loan-sim-preset-delete-btn"
                                        onClick={() => onDeletePreset(preset.id)}
                                    >
                                        削除
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="loan-sim-inline-note">まだ保存した条件はありません。</p>
                )}
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
                        help={FIELD_HELP.propertyPrice}
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
                        help={FIELD_HELP.downPayment}
                    />

                    <div className="loan-sim-manual-toggle">
                        <div className="loan-sim-field-head">
                            <FieldLabel label="借入額を直接入力する" help={FIELD_HELP.isLoanAmountManual} />
                            <strong>{inputs.isLoanAmountManual ? 'ON' : 'OFF'}</strong>
                        </div>
                        <label className="loan-sim-check-label">
                            <input
                                type="checkbox"
                                checked={inputs.isLoanAmountManual}
                                onChange={(event) => onChange('isLoanAmountManual', event.target.checked)}
                            />
                            直接入力モードを使う
                        </label>
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
                        help={FIELD_HELP.loanAmount}
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
                        help={FIELD_HELP.annualRate}
                    />
                    <NumberField
                        label="年収"
                        value={inputs.annualIncome}
                        onChange={(value) => onChange('annualIncome', value)}
                        unit="円"
                        min={0}
                        max={30_000_000}
                        step={100_000}
                        displayFormatter={formatCurrency}
                        help={FIELD_HELP.annualIncome}
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
                        help={FIELD_HELP.repaymentYears}
                    />

                    <div className="loan-sim-field">
                        <div className="loan-sim-field-head">
                            <FieldLabel label="返済方式" help={FIELD_HELP.repaymentType} />
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

                    <div className="loan-sim-field">
                        <div className="loan-sim-field-head">
                            <FieldLabel label="開始年月" help={FIELD_HELP.startYearMonth} />
                            <strong>{inputs.startYearMonth || '未設定'}</strong>
                        </div>
                        <input
                            className="loan-sim-month-input"
                            type="month"
                            value={inputs.startYearMonth}
                            aria-label="開始年月"
                            onChange={(event) => onChange('startYearMonth', event.target.value)}
                        />
                    </div>
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
                        help={FIELD_HELP.monthlySavings}
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
                        help={FIELD_HELP.savingsAnnualRate}
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
                        help={FIELD_HELP.bonusRepayment}
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
                        help={FIELD_HELP.monthlyFixedCost}
                    />
                </div>
            </div>
        </section>
    );
}
