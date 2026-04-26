import { useMemo, useState, type ReactNode } from 'react';
import { LoanSimFieldHelp } from './LoanSimFieldHelp';
import { LoanSimComparisonCharts } from './LoanSimComparisonCharts';
import { LoanSimComparisonSummary } from './LoanSimComparisonSummary';
import { calculateLoanComparison } from '../../features/loanSim/comparison';
import type {
    LoanAfterPayoffMode,
    LoanCompareCommonInputs,
    LoanCompareInputs,
    LoanCompareScenarioSummary,
    LoanCompareScenarioInputs,
    LoanInvestmentAccountType,
    LoanSimSavedPreset,
} from '../../features/loanSim/types';

type ScenarioLabel = 'A' | 'B';

type FieldHelp = {
    title: string;
    body: ReactNode;
    ariaLabel?: string;
};

type NumberFieldProps = {
    label: string;
    value: number;
    onChange: (value: number) => void;
    unit: string;
    min: number;
    max: number;
    step: number;
    help?: FieldHelp;
    showSlider?: boolean;
    disabled?: boolean;
    displayFormatter?: (value: number) => string;
};

const INVESTMENT_ACCOUNT_OPTIONS: Array<{
    value: LoanInvestmentAccountType;
    label: string;
}> = [
    { value: 'nisa', label: 'NISA' },
    { value: 'taxable', label: '課税' },
];

const AFTER_PAYOFF_OPTIONS: Array<{
    value: LoanAfterPayoffMode;
    label: string;
}> = [
    { value: 'none', label: '何もしない' },
    { value: 'invest-equivalent-payment', label: '完済後は返済相当額を積立' },
];

const FIELD_HELP = {
    purchaseFees: {
        title: '諸費用とは？',
        body: <p>登記費用や仲介手数料などの初期費用です。比較モードでは住宅価値には含めず、各シナリオの借入額へ含めて比較します。</p>,
    },
    initialFinancialAssets: {
        title: '投資の初期元本とは？',
        body: <p>比較開始時点で投資に回している残高です。生活費や予備資金は含めず、頭金とも切り離して扱います。</p>,
    },
    annualInvestmentRate: {
        title: '想定運用利回りとは？',
        body: <p>投資残高に対して見込む年間の運用利回りです。比較モードでは月利へ換算して毎月反映します。</p>,
    },
    housingAnnualGrowthRate: {
        title: '住宅価値の変動率とは？',
        body: <p>住宅価値が毎年どれだけ増減する前提かを入れます。0% なら現状維持です。</p>,
    },
    interestType: {
        title: '固定・変動とは？',
        body: <p>固定は全期間同じ金利、変動はシナリオごとに設定した将来金利ルールに沿って返済額と利息を再計算します。</p>,
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
    autoInvestPaymentDifference: {
        title: '差額自動積立とは？',
        body: <p>他方シナリオより毎月返済相当額が軽いぶんを、そのまま毎月積立へ上乗せします。負の差額は 0 円で止めます。</p>,
    },
    downPayment: {
        title: '頭金とは？',
        body: <p>各シナリオで購入時に入れる自己資金です。比較モードでは、頭金が増えると借入額が減り、総支払利息も変わります。</p>,
    },
    afterPayoffMode: {
        title: '完済後の扱いとは？',
        body: <p>比較期間が返済年数より長いとき、完済後に毎月返済相当額を積立へ回すかどうかを選べます。</p>,
    },
} as const;

function buildCurrentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function createDefaultComparisonInputs(): LoanCompareInputs {
    return {
        common: {
            propertyPrice: 55_000_000,
            purchaseFees: 0,
            initialFinancialAssets: 4_000_000,
            annualInvestmentRate: 2,
            investmentAccountType: 'nisa',
            comparisonYears: 40,
            housingAnnualGrowthRate: 0,
            startYearMonth: buildCurrentYearMonth(),
        },
        scenarioA: {
            downPayment: 5_000_000,
            cashReserve: 0,
            repaymentType: 'equal-payment',
            repaymentYears: 35,
            interestType: 'fixed',
            annualRate: 2.5,
            variableRateMode: 'constant',
            variableRateStepYears: 5,
            variableRateStepAmount: 0.25,
            monthlyInvestment: 0,
            bonusRepayment: 0,
            monthlyPrepayment: 0,
            autoInvestPaymentDifference: false,
            afterPayoffMode: 'invest-equivalent-payment',
        },
        scenarioB: {
            downPayment: 5_000_000,
            cashReserve: 0,
            repaymentType: 'equal-payment',
            repaymentYears: 35,
            interestType: 'variable',
            annualRate: 1.5,
            variableRateMode: 'constant',
            variableRateStepYears: 5,
            variableRateStepAmount: 0.25,
            monthlyInvestment: 0,
            bonusRepayment: 0,
            monthlyPrepayment: 0,
            autoInvestPaymentDifference: true,
            afterPayoffMode: 'invest-equivalent-payment',
        },
    };
}

function readInputNumber(rawValue: string): number {
    if (rawValue.trim() === '') {
        return 0;
    }
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
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

function formatRateRule(inputs: LoanCompareScenarioInputs): string {
    if (inputs.interestType === 'fixed') {
        return `固定 ${formatPercent(inputs.annualRate)}`;
    }
    if (inputs.variableRateMode === 'step-up') {
        return `変動 ${formatPercent(inputs.annualRate)} / ${formatYears(inputs.variableRateStepYears)}ごとに +${formatPercent(inputs.variableRateStepAmount)}`;
    }
    return `変動 ${formatPercent(inputs.annualRate)} / 一定近似`;
}

function getScenarioKey(label: ScenarioLabel): 'scenarioA' | 'scenarioB' {
    return label === 'A' ? 'scenarioA' : 'scenarioB';
}

function convertPresetToScenarioInputs(
    preset: LoanSimSavedPreset,
    currentScenario: LoanCompareScenarioInputs,
): LoanCompareScenarioInputs {
    return {
        downPayment: preset.inputs.downPayment,
        cashReserve: 0,
        repaymentType: preset.inputs.repaymentType,
        repaymentYears: preset.inputs.repaymentYears,
        interestType: preset.inputs.interestType,
        annualRate: preset.inputs.annualRate,
        variableRateMode: preset.inputs.variableRateMode,
        variableRateStepYears: preset.inputs.variableRateStepYears,
        variableRateStepAmount: preset.inputs.variableRateStepAmount,
        monthlyInvestment: preset.inputs.monthlySavings,
        bonusRepayment: preset.inputs.bonusRepayment,
        monthlyPrepayment: 0,
        autoInvestPaymentDifference: currentScenario.autoInvestPaymentDifference,
        afterPayoffMode: preset.inputs.afterPayoffMode,
    };
}

function FieldLabel({
    label,
    help,
}: {
    label: string;
    help?: FieldHelp;
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
    showSlider = false,
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
                {showSlider ? (
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
                ) : null}
            </div>
        </div>
    );
}

function ScenarioSelectField({
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
    help?: FieldHelp;
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

type ScenarioCardProps = {
    label: ScenarioLabel;
    inputs: LoanCompareScenarioInputs;
    summary: LoanCompareScenarioSummary;
    savedPresets: LoanSimSavedPreset[];
    selectedSavedScenarioId: string;
    savedScenarioStatus: string | null;
    onCopyFromA?: () => void;
    onSelectSavedScenario: (scenarioId: string) => void;
    onAutoInvestPaymentDifferenceChange: (enabled: boolean) => void;
};

function ScenarioCard({
    label,
    inputs,
    summary,
    savedPresets,
    selectedSavedScenarioId,
    savedScenarioStatus,
    onCopyFromA,
    onSelectSavedScenario,
    onAutoInvestPaymentDifferenceChange,
}: ScenarioCardProps) {
    const selectedPreset = savedPresets.find((preset) => preset.id === selectedSavedScenarioId) ?? null;
    const repaymentTypeLabel = inputs.repaymentType === 'equal-payment' ? '元利均等' : '元金均等';
    const afterPayoffLabel = AFTER_PAYOFF_OPTIONS.find((option) => option.value === inputs.afterPayoffMode)?.label ?? inputs.afterPayoffMode;
    const rows = [
        { label: '保存条件', value: selectedPreset?.name ?? '未選択（初期値）' },
        { label: '頭金', value: formatCurrency(summary.downPayment) },
        { label: '借入額', value: formatCurrency(summary.loanAmount) },
        { label: '返済年数', value: formatYears(inputs.repaymentYears) },
        { label: '金利', value: formatRateRule(inputs) },
        { label: '返済方式', value: repaymentTypeLabel },
        { label: '毎月積立額', value: formatCurrency(inputs.monthlyInvestment) },
        { label: 'ボーナス返済', value: formatCurrency(inputs.bonusRepayment) },
        { label: '完済後の扱い', value: afterPayoffLabel },
    ];

    return (
        <section className="loan-sim-card loan-sim-compare-scenario-card">
            <div className="loan-sim-card-head">
                <div>
                    <h2>{`シナリオ${label}`}</h2>
                </div>
                {label === 'B' && onCopyFromA ? (
                    <button type="button" className="nav-btn" onClick={onCopyFromA}>
                        A をコピー
                    </button>
                ) : null}
            </div>

            <div className="loan-sim-preset-panel loan-sim-scenario-preset-panel">
                <div className="loan-sim-preset-head">
                    <h3>単一試算の保存条件</h3>
                    <div className="loan-sim-preset-head-actions">
                        <span className="loan-sim-badge">{savedPresets.length}件</span>
                    </div>
                </div>
                <div className="loan-sim-preset-controls">
                    <select
                        className="setting-select loan-sim-preset-select"
                        value={selectedSavedScenarioId}
                        aria-label={`シナリオ${label}へ読み込む単一試算の保存条件`}
                        onChange={(event) => onSelectSavedScenario(event.target.value)}
                    >
                        <option value="">保存条件を選択</option>
                        {savedPresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                                {preset.name}
                            </option>
                        ))}
                    </select>
                </div>
                {savedScenarioStatus ? <p className="loan-sim-inline-note">{savedScenarioStatus}</p> : null}
                {savedPresets.length === 0 ? (
                    <p className="loan-sim-inline-note">単一試算で条件を保存すると、ここでシナリオA/Bへ読み込めます。</p>
                ) : null}
            </div>

            <div className="loan-sim-scenario-readonly-grid">
                {rows.map((row) => (
                    <article key={row.label} className="loan-sim-scenario-readonly-item">
                        <span>{row.label}</span>
                        <strong>{row.value}</strong>
                    </article>
                ))}
            </div>

            <div className="loan-sim-form-section">
                <div className="loan-sim-field">
                    <div className="loan-sim-field-head">
                        <FieldLabel label="差額自動積立" help={FIELD_HELP.autoInvestPaymentDifference} />
                        <strong>{inputs.autoInvestPaymentDifference ? 'ON' : 'OFF'}</strong>
                    </div>
                    <label className="loan-sim-check-label">
                        <input
                            type="checkbox"
                            checked={inputs.autoInvestPaymentDifference}
                            onChange={(event) => onAutoInvestPaymentDifferenceChange(event.target.checked)}
                        />
                        <span>{label === 'A' ? 'B との差額を A に回す' : 'A との差額を B に回す'}</span>
                    </label>
                </div>
            </div>
        </section>
    );
}

type LoanSimComparisonProps = {
    savedPresets: LoanSimSavedPreset[];
};

export function LoanSimComparison({ savedPresets }: LoanSimComparisonProps) {
    const [inputs, setInputs] = useState<LoanCompareInputs>(() => createDefaultComparisonInputs());
    const [selectedSavedScenarioIds, setSelectedSavedScenarioIds] = useState<Record<ScenarioLabel, string>>({ A: '', B: '' });
    const [savedScenarioStatuses, setSavedScenarioStatuses] = useState<Record<ScenarioLabel, string | null>>({ A: null, B: null });
    const result = useMemo(() => calculateLoanComparison(inputs), [inputs]);

    const handleCommonChange = <K extends keyof LoanCompareCommonInputs>(key: K, value: LoanCompareCommonInputs[K]) => {
        setInputs((current) => ({
            ...current,
            common: {
                ...current.common,
                [key]: value,
            },
        }));
    };

    const handleAutoInvestPaymentDifferenceChange = (
        scenarioKey: 'scenarioA' | 'scenarioB',
        enabled: boolean,
    ) => {
        setInputs((current) => {
            const next = {
                ...current,
                scenarioA: { ...current.scenarioA },
                scenarioB: { ...current.scenarioB },
            };
            const target = next[scenarioKey];
            target.autoInvestPaymentDifference = enabled;

            if (enabled) {
                const otherKey = scenarioKey === 'scenarioA' ? 'scenarioB' : 'scenarioA';
                next[otherKey] = {
                    ...next[otherKey],
                    autoInvestPaymentDifference: false,
                };
            }

            return next;
        });
    };

    const handleCopyAToB = () => {
        setInputs((current) => ({
            ...current,
            scenarioB: {
                ...current.scenarioA,
                autoInvestPaymentDifference: false,
            },
        }));
        setSelectedSavedScenarioIds((current) => ({ ...current, B: current.A }));
        setSavedScenarioStatuses((current) => ({ ...current, B: 'シナリオAをBへコピーしました。' }));
    };

    const handleReset = () => {
        setInputs(createDefaultComparisonInputs());
        setSelectedSavedScenarioIds({ A: '', B: '' });
        setSavedScenarioStatuses({ A: null, B: null });
    };

    const handleSelectSavedScenario = (label: ScenarioLabel, scenarioId: string) => {
        if (!scenarioId) {
            setSelectedSavedScenarioIds((current) => ({
                ...current,
                [label]: '',
            }));
            setSavedScenarioStatuses((current) => ({
                ...current,
                [label]: null,
            }));
            return;
        }

        const targetPreset = savedPresets.find((preset) => preset.id === scenarioId);
        if (!targetPreset) {
            setSavedScenarioStatuses((current) => ({
                ...current,
                [label]: '単一試算の保存条件が見つかりませんでした。',
            }));
            return;
        }

        const scenarioKey = getScenarioKey(label);
        setInputs((current) => ({
            ...current,
            [scenarioKey]: convertPresetToScenarioInputs(targetPreset, current[scenarioKey]),
        }));
        setSelectedSavedScenarioIds((current) => ({
            ...current,
            [label]: targetPreset.id,
        }));
        setSavedScenarioStatuses((current) => ({
            ...current,
            [label]: `「${targetPreset.name}」をシナリオ${label}へ読み込みました。`,
        }));
    };

    return (
        <>
            {result.validationIssues.length > 0 ? (
                <section className="loan-sim-alert">
                    <h2>入力値の補正</h2>
                    <ul className="loan-sim-alert-list">
                        {result.validationIssues.map((issue, index) => (
                            <li key={`${issue.field}-${index}`}>{issue.message}</li>
                        ))}
                    </ul>
                </section>
            ) : null}

            <div className="loan-sim-compare-top-grid">
                <LoanSimComparisonSummary result={result} />

                <div className="loan-sim-compare-form-column">
                    <section className="loan-sim-card loan-sim-form-card">
                        <div className="loan-sim-card-head">
                            <div>
                                <h2>共通条件</h2>
                                <p>同じ前提にする条件だけをここで 1 回入力します。</p>
                            </div>
                            <button type="button" className="nav-btn loan-sim-reset-btn" onClick={handleReset}>
                                条件をリセット
                            </button>
                        </div>

                        <div className="loan-sim-form-section">
                            <NumberField
                                label="物件価格"
                                value={inputs.common.propertyPrice}
                                onChange={(value) => handleCommonChange('propertyPrice', value)}
                                unit="円"
                                min={0}
                                max={120_000_000}
                                step={100_000}
                                displayFormatter={formatCurrency}
                            />
                            <NumberField
                                label="諸費用"
                                value={inputs.common.purchaseFees}
                                onChange={(value) => handleCommonChange('purchaseFees', value)}
                                unit="円"
                                min={0}
                                max={10_000_000}
                                step={10_000}
                                displayFormatter={formatCurrency}
                                help={FIELD_HELP.purchaseFees}
                            />
                            <NumberField
                                label="投資の初期元本"
                                value={inputs.common.initialFinancialAssets}
                                onChange={(value) => handleCommonChange('initialFinancialAssets', value)}
                                unit="円"
                                min={0}
                                max={100_000_000}
                                step={100_000}
                                displayFormatter={formatCurrency}
                                help={FIELD_HELP.initialFinancialAssets}
                            />
                            <NumberField
                                label="想定運用利回り"
                                value={inputs.common.annualInvestmentRate}
                                onChange={(value) => handleCommonChange('annualInvestmentRate', value)}
                                unit="%"
                                min={-20}
                                max={20}
                                step={0.01}
                                displayFormatter={formatPercent}
                                help={FIELD_HELP.annualInvestmentRate}
                            />
                            <ScenarioSelectField
                                label="運用口座区分"
                                value={inputs.common.investmentAccountType}
                                onChange={(value) => handleCommonChange('investmentAccountType', value as LoanInvestmentAccountType)}
                                options={INVESTMENT_ACCOUNT_OPTIONS}
                            />
                            <NumberField
                                label="比較期間"
                                value={inputs.common.comparisonYears}
                                onChange={(value) => handleCommonChange('comparisonYears', value)}
                                unit="年"
                                min={1}
                                max={50}
                                step={1}
                                displayFormatter={formatYears}
                            />
                            <NumberField
                                label="住宅価値の年変動率"
                                value={inputs.common.housingAnnualGrowthRate}
                                onChange={(value) => handleCommonChange('housingAnnualGrowthRate', value)}
                                unit="%"
                                min={-20}
                                max={20}
                                step={0.01}
                                displayFormatter={formatPercent}
                                help={FIELD_HELP.housingAnnualGrowthRate}
                            />
                            <div className="loan-sim-field">
                                <div className="loan-sim-field-head">
                                    <FieldLabel label="開始年月" />
                                    <strong>{inputs.common.startYearMonth || '未設定'}</strong>
                                </div>
                                <input
                                    className="loan-sim-month-input"
                                    type="month"
                                    value={inputs.common.startYearMonth}
                                    aria-label="比較モードの開始年月"
                                    onChange={(event) => handleCommonChange('startYearMonth', event.target.value)}
                                />
                            </div>
                        </div>
                    </section>

                    <div className="loan-sim-compare-scenarios">
                        <ScenarioCard
                            label="A"
                            inputs={inputs.scenarioA}
                            summary={result.summary.scenarioA}
                            savedPresets={savedPresets}
                            selectedSavedScenarioId={selectedSavedScenarioIds.A}
                            savedScenarioStatus={savedScenarioStatuses.A}
                            onSelectSavedScenario={(scenarioId) => handleSelectSavedScenario('A', scenarioId)}
                            onAutoInvestPaymentDifferenceChange={(enabled) => handleAutoInvestPaymentDifferenceChange('scenarioA', enabled)}
                        />
                        <ScenarioCard
                            label="B"
                            inputs={inputs.scenarioB}
                            summary={result.summary.scenarioB}
                            savedPresets={savedPresets}
                            selectedSavedScenarioId={selectedSavedScenarioIds.B}
                            savedScenarioStatus={savedScenarioStatuses.B}
                            onCopyFromA={handleCopyAToB}
                            onSelectSavedScenario={(scenarioId) => handleSelectSavedScenario('B', scenarioId)}
                            onAutoInvestPaymentDifferenceChange={(enabled) => handleAutoInvestPaymentDifferenceChange('scenarioB', enabled)}
                        />
                    </div>
                </div>
            </div>

            <LoanSimComparisonCharts result={result} />

            <section className="loan-sim-card">
                <div className="loan-sim-card-head">
                    <div>
                        <h2>比較ルール</h2>
                        <p>比較モードでは、同じ物件前提で A/B の返済戦略差だけを見やすくしています。</p>
                    </div>
                </div>
                <ul className="loan-sim-info-list">
                    {result.infoMessages.map((message) => (
                        <li key={message}>{message}</li>
                    ))}
                </ul>
            </section>
        </>
    );
}
