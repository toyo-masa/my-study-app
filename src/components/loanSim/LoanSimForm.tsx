import { useState, type ReactNode } from 'react';
import { LoanSimFieldHelp } from './LoanSimFieldHelp';
import type {
    LoanAfterPayoffMode,
    LoanInterestType,
    LoanRepaymentType,
    LoanSimInputs,
    LoanSimSavedPreset,
    LoanVariableRateMode,
} from '../../features/loanSim/types';

type LoanSimFormProps = {
    inputs: LoanSimInputs;
    calculatedLoanAmount: number;
    selectedPresetId: string;
    isPresetManagementOpen: boolean;
    presetName: string;
    presetStatus: string | null;
    savedPresets: LoanSimSavedPreset[];
    onChange: <K extends keyof LoanSimInputs>(key: K, value: LoanSimInputs[K]) => void;
    onPresetNameChange: (value: string) => void;
    onSavePreset: () => void;
    onSelectPreset: (presetId: string) => void;
    onDeletePreset: (presetId: string) => void;
    onPresetManagementToggle: (isOpen: boolean) => void;
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

const INTEREST_TYPE_OPTIONS: Array<{
    value: LoanInterestType;
    label: string;
}> = [
    { value: 'fixed', label: '固定' },
    { value: 'variable', label: '変動' },
];

const VARIABLE_RATE_MODE_OPTIONS: Array<{
    value: LoanVariableRateMode;
    label: string;
}> = [
    { value: 'constant', label: '一定金利で近似' },
    { value: 'step-up', label: '一定間隔で上昇' },
];

const AFTER_PAYOFF_OPTIONS: Array<{
    value: LoanAfterPayoffMode;
    label: string;
}> = [
    { value: 'none', label: '何もしない' },
    { value: 'invest-equivalent-payment', label: '完済後は返済相当額を積立' },
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
    loanAmount: {
        title: '借入額とは？',
        body: (
            <>
                <p>住宅ローンとして実際に借りる元本です。</p>
                <p>この画面では「物件価格 - 頭金」で自動計算した値を表示します。</p>
            </>
        ),
    },
    annualRate: {
        title: '年利とは？',
        body: <p>ローンにかかる年間の金利です。内部では 12 で割って月利にし、毎月の利息計算へ反映します。</p>,
    },
    interestType: {
        title: '固定・変動とは？',
        body: <p>固定は全期間同じ金利、変動は設定した将来金利ルールに沿って返済額と利息を再計算します。</p>,
    },
    variableRateMode: {
        title: '変動金利の見通しとは？',
        body: <p>簡易モードでは全期間を一定金利で近似し、上昇モードでは指定した年数ごとに金利を上げて毎月返済額と利息を再計算します。</p>,
    },
    variableRateStepYears: {
        title: '見直し間隔とは？',
        body: <p>変動金利を何年ごとに見直す想定かです。例: 5 年ごとに上昇。</p>,
    },
    variableRateStepAmount: {
        title: '1回ごとの上昇幅とは？',
        body: <p>見直しのたびに何 % ずつ上がる前提かです。例: 0.25% ずつ上昇。</p>,
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
    currentAge: {
        title: '開始時点の年齢とは？',
        body: <p>返済開始年月の時点での年齢です。定年時の残り残高は、この年齢から定年年齢まで進めた時点の残高として計算します。</p>,
    },
    retirementAge: {
        title: '定年年齢とは？',
        body: <p>何歳で定年を迎える前提かを入れる項目です。開始時点の年齢からの差をもとに、定年時点のローン残高を表示します。</p>,
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
    afterPayoffMode: {
        title: '比較時の完済後の扱いとは？',
        body: <p>この保存条件をシナリオ比較で使うとき、完済後に毎月返済相当額を積立へ回すかを指定します。単一試算の返済表には影響しません。</p>,
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
    initialSavingsBalance: {
        title: '運用の元手とは？',
        body: <p>すでに運用に回している残高です。積立残高の開始値として扱い、その残高に対して毎月の運用利息を計算します。</p>,
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

function formatAge(value: number): string {
    return `${Math.round(value)}歳`;
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
    const [draftValue, setDraftValue] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const inputValue = isEditing ? draftValue : (Number.isFinite(value) ? String(value) : '0');

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
                        value={inputValue}
                        disabled={disabled}
                        aria-label={label}
                        onFocus={() => {
                            setIsEditing(true);
                            setDraftValue(Number.isFinite(value) ? String(value) : '0');
                        }}
                        onBlur={() => {
                            setIsEditing(false);
                            if (draftValue.trim() === '') {
                                onChange(0);
                            }
                        }}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            setDraftValue(nextValue);
                            if (nextValue.trim() === '') {
                                return;
                            }
                            onChange(readInputNumber(nextValue));
                        }}
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

function SelectField({
    label,
    value,
    onChange,
    options,
    help,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    help?: NumberFieldProps['help'];
}) {
    return (
        <div className="loan-sim-field">
            <div className="loan-sim-field-head">
                <FieldLabel label={label} help={help} />
                <strong>{options.find((option) => option.value === value)?.label ?? value}</strong>
            </div>
            <select
                className="loan-sim-month-input"
                value={value}
                aria-label={label}
                onChange={(event) => onChange(event.target.value)}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

export function LoanSimForm({
    inputs,
    calculatedLoanAmount,
    selectedPresetId,
    isPresetManagementOpen,
    presetName,
    presetStatus,
    savedPresets,
    onChange,
    onPresetNameChange,
    onSavePreset,
    onSelectPreset,
    onDeletePreset,
    onPresetManagementToggle,
    onReset,
}: LoanSimFormProps) {
    return (
        <section className="loan-sim-card loan-sim-form-card">
            <div className="loan-sim-preset-panel">
                <div className="loan-sim-preset-head">
                    <h3>保存した条件</h3>
                    <div className="loan-sim-preset-head-actions">
                        <span className="loan-sim-badge">{savedPresets.length}件</span>
                        <button type="button" className="nav-btn loan-sim-reset-btn" onClick={onReset}>
                            条件をリセット
                        </button>
                    </div>
                </div>
                <div className="loan-sim-preset-controls">
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
                    <select
                        className="setting-select loan-sim-preset-select"
                        value={selectedPresetId}
                        aria-label="保存した条件を選択"
                        onChange={(event) => onSelectPreset(event.target.value)}
                    >
                        <option value="">保存した条件を選択</option>
                        {savedPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                                {preset.name}
                            </option>
                        ))}
                    </select>
                </div>
                {presetStatus ? <p className="loan-sim-inline-note">{presetStatus}</p> : null}
                {savedPresets.length > 0 ? (
                    <details
                        className="loan-sim-preset-manage"
                        open={isPresetManagementOpen}
                        onToggle={(event) => onPresetManagementToggle((event.currentTarget as HTMLDetailsElement).open)}
                    >
                        <summary className="loan-sim-preset-manage-summary">
                            <span>保存した条件を管理</span>
                            <span className="loan-sim-preset-manage-current">
                                {selectedPresetId
                                    ? `${savedPresets.find((preset) => preset.id === selectedPresetId)?.name ?? '選択中'} を選択中`
                                    : '未選択'}
                            </span>
                        </summary>
                        <div className="loan-sim-preset-manage-body">
                            <div className="loan-sim-preset-list">
                                {savedPresets.map((preset) => (
                                    <div
                                        key={preset.id}
                                        className={`loan-sim-preset-item ${selectedPresetId === preset.id ? 'is-selected' : ''}`}
                                    >
                                        <div className="loan-sim-preset-meta">
                                            <strong>{preset.name}</strong>
                                            <span>{formatPresetUpdatedAt(preset.updatedAt)} 更新</span>
                                        </div>
                                        <div className="loan-sim-preset-actions">
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
                        </div>
                    </details>
                ) : null}
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

                    <NumberField
                        label="借入額"
                        value={calculatedLoanAmount}
                        onChange={(value) => onChange('loanAmount', value)}
                        unit="円"
                        min={0}
                        max={120_000_000}
                        step={100_000}
                        displayFormatter={formatCurrency}
                        showSlider={false}
                        disabled
                        help={FIELD_HELP.loanAmount}
                    />

                    <SelectField
                        label="金利タイプ"
                        value={inputs.interestType}
                        onChange={(value) => onChange('interestType', value as LoanInterestType)}
                        options={INTEREST_TYPE_OPTIONS}
                        help={FIELD_HELP.interestType}
                    />
                    <NumberField
                        label={inputs.interestType === 'variable' ? '開始時の年利' : '年利'}
                        value={inputs.annualRate}
                        onChange={(value) => onChange('annualRate', value)}
                        unit="%"
                        min={0}
                        max={5}
                        step={0.01}
                        displayFormatter={formatPercent}
                        help={FIELD_HELP.annualRate}
                    />
                    {inputs.interestType === 'variable' ? (
                        <SelectField
                            label="変動金利の見通し"
                            value={inputs.variableRateMode}
                            onChange={(value) => onChange('variableRateMode', value as LoanVariableRateMode)}
                            options={VARIABLE_RATE_MODE_OPTIONS}
                            help={FIELD_HELP.variableRateMode}
                        />
                    ) : null}
                    {inputs.interestType === 'variable' && inputs.variableRateMode === 'step-up' ? (
                        <>
                            <NumberField
                                label="何年ごとに見直すか"
                                value={inputs.variableRateStepYears}
                                onChange={(value) => onChange('variableRateStepYears', value)}
                                unit="年"
                                min={1}
                                max={50}
                                step={1}
                                displayFormatter={formatYears}
                                help={FIELD_HELP.variableRateStepYears}
                            />
                            <NumberField
                                label="1回ごとの上昇幅"
                                value={inputs.variableRateStepAmount}
                                onChange={(value) => onChange('variableRateStepAmount', value)}
                                unit="%"
                                min={0}
                                max={5}
                                step={0.01}
                                displayFormatter={formatPercent}
                                help={FIELD_HELP.variableRateStepAmount}
                            />
                        </>
                    ) : null}
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
                    <div className="loan-sim-inline-half-grid">
                        <NumberField
                            label="開始時点の年齢"
                            value={inputs.currentAge}
                            onChange={(value) => onChange('currentAge', value)}
                            unit="歳"
                            min={0}
                            max={100}
                            step={1}
                            displayFormatter={formatAge}
                            showSlider={false}
                            help={FIELD_HELP.currentAge}
                        />
                        <NumberField
                            label="定年年齢"
                            value={inputs.retirementAge}
                            onChange={(value) => onChange('retirementAge', value)}
                            unit="歳"
                            min={0}
                            max={100}
                            step={1}
                            displayFormatter={formatAge}
                            showSlider={false}
                            help={FIELD_HELP.retirementAge}
                        />
                    </div>
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
                    <SelectField
                        label="比較時の完済後の扱い"
                        value={inputs.afterPayoffMode}
                        onChange={(value) => onChange('afterPayoffMode', value as LoanAfterPayoffMode)}
                        options={AFTER_PAYOFF_OPTIONS}
                        help={FIELD_HELP.afterPayoffMode}
                    />
                </div>

                <div className="loan-sim-form-section">
                    <h3>積立・固定費</h3>
                    <NumberField
                        label="運用の元手"
                        value={inputs.initialSavingsBalance}
                        onChange={(value) => onChange('initialSavingsBalance', value)}
                        unit="円"
                        min={0}
                        max={100_000_000}
                        step={100_000}
                        displayFormatter={formatCurrency}
                        help={FIELD_HELP.initialSavingsBalance}
                    />
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
