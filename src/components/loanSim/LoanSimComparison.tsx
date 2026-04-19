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
    LoanInterestType,
    LoanInvestmentAccountType,
    LoanRepaymentType,
    LoanVariableRateMode,
} from '../../features/loanSim/types';

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

const REPAYMENT_OPTIONS: Array<{
    value: LoanRepaymentType;
    label: string;
    description: string;
}> = [
    { value: 'equal-payment', label: '元利均等', description: '毎月返済額をそろえて比較したいとき向けです。' },
    { value: 'equal-principal', label: '元金均等', description: '初月を重くして残高の減りを早めたいとき向けです。' },
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
        title: '初期保有金融資産とは？',
        body: <p>購入前に持っている金融資産の総額です。各シナリオでは、ここから頭金と手元現金確保額を引いた残りを初期投資元本として扱います。</p>,
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
        body: <p>各シナリオで購入時に入れる自己資金です。比較モードでは、頭金が増えると借入額が減り、同時に初期投資に回せる額も減ります。</p>,
    },
    cashReserve: {
        title: '手元現金として残す額とは？',
        body: <p>購入後も投資に回さず手元へ残す現金です。比較モードでは、初期保有金融資産から頭金とこの金額を引いた残りを初期投資元本として扱います。</p>,
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
            propertyPrice: 48_000_000,
            purchaseFees: 0,
            initialFinancialAssets: 10_000_000,
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
            annualRate: 1.2,
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
            downPayment: 0,
            cashReserve: 0,
            repaymentType: 'equal-payment',
            repaymentYears: 40,
            interestType: 'fixed',
            annualRate: 1.2,
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
    label: 'A' | 'B';
    inputs: LoanCompareScenarioInputs;
    summary: LoanCompareScenarioSummary;
    onChange: <K extends keyof LoanCompareScenarioInputs>(key: K, value: LoanCompareScenarioInputs[K]) => void;
    onCopyFromA?: () => void;
};

function ScenarioCard({
    label,
    inputs,
    summary,
    onChange,
    onCopyFromA,
}: ScenarioCardProps) {
    return (
        <section className="loan-sim-card loan-sim-compare-scenario-card">
            <div className="loan-sim-card-head">
                <div>
                    <h2>{`シナリオ${label}`}</h2>
                    <p>{label === 'A' ? '基準となる戦略です。' : '比較対象の戦略です。差額自動積立もここで設定できます。'}</p>
                </div>
                {label === 'B' && onCopyFromA ? (
                    <button type="button" className="nav-btn" onClick={onCopyFromA}>
                        A をコピー
                    </button>
                ) : null}
            </div>

            <div className="loan-sim-form-section">
                <NumberField
                    label="頭金"
                    value={inputs.downPayment}
                    onChange={(value) => onChange('downPayment', value)}
                    unit="円"
                    min={0}
                    max={130_000_000}
                    step={100_000}
                    displayFormatter={formatCurrency}
                    help={FIELD_HELP.downPayment}
                />
                <NumberField
                    label="手元現金として残す額"
                    value={inputs.cashReserve}
                    onChange={(value) => onChange('cashReserve', value)}
                    unit="円"
                    min={0}
                    max={100_000_000}
                    step={100_000}
                    displayFormatter={formatCurrency}
                    help={FIELD_HELP.cashReserve}
                />
                <div className="loan-sim-field">
                    <div className="loan-sim-field-head">
                        <FieldLabel label="返済方式" />
                        <strong>{inputs.repaymentType === 'equal-payment' ? '元利均等' : '元金均等'}</strong>
                    </div>
                    <div className="loan-sim-choice-grid">
                        {REPAYMENT_OPTIONS.map((option) => (
                            <button
                                key={`${label}-${option.value}`}
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
                <ScenarioSelectField
                    label="金利タイプ"
                    value={inputs.interestType}
                    onChange={(value) => onChange('interestType', value as LoanInterestType)}
                    options={INTEREST_TYPE_OPTIONS}
                    help={FIELD_HELP.interestType}
                />
                <NumberField
                    label={inputs.interestType === 'variable' ? '開始時の想定金利' : '想定金利'}
                    value={inputs.annualRate}
                    onChange={(value) => onChange('annualRate', value)}
                    unit="%"
                    min={0}
                    max={5}
                    step={0.01}
                    displayFormatter={formatPercent}
                />
                {inputs.interestType === 'variable' ? (
                    <ScenarioSelectField
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
                    label="借入額（自動計算）"
                    value={summary.loanAmount}
                    onChange={() => undefined}
                    unit="円"
                    min={0}
                    max={300_000_000}
                    step={100_000}
                    displayFormatter={formatCurrency}
                    disabled
                />
                <NumberField
                    label="初期投資元本（自動計算）"
                    value={summary.initialInvestmentBalance}
                    onChange={() => undefined}
                    unit="円"
                    min={0}
                    max={300_000_000}
                    step={100_000}
                    displayFormatter={formatCurrency}
                    disabled
                />
                <NumberField
                    label="毎月積立額"
                    value={inputs.monthlyInvestment}
                    onChange={(value) => onChange('monthlyInvestment', value)}
                    unit="円"
                    min={0}
                    max={500_000}
                    step={1_000}
                    displayFormatter={formatCurrency}
                />
                <NumberField
                    label="ボーナス返済"
                    value={inputs.bonusRepayment}
                    onChange={(value) => onChange('bonusRepayment', value)}
                    unit="円"
                    min={0}
                    max={2_000_000}
                    step={10_000}
                    displayFormatter={formatCurrency}
                />
                <NumberField
                    label="毎月の繰上返済"
                    value={inputs.monthlyPrepayment}
                    onChange={(value) => onChange('monthlyPrepayment', value)}
                    unit="円"
                    min={0}
                    max={500_000}
                    step={1_000}
                    displayFormatter={formatCurrency}
                />
                <div className="loan-sim-field">
                    <div className="loan-sim-field-head">
                        <FieldLabel label="差額自動積立" help={FIELD_HELP.autoInvestPaymentDifference} />
                        <strong>{inputs.autoInvestPaymentDifference ? 'ON' : 'OFF'}</strong>
                    </div>
                    <label className="loan-sim-check-label">
                        <input
                            type="checkbox"
                            checked={inputs.autoInvestPaymentDifference}
                            onChange={(event) => onChange('autoInvestPaymentDifference', event.target.checked)}
                        />
                        <span>{label === 'A' ? 'B との差額を A に回す' : 'A との差額を B に回す'}</span>
                    </label>
                </div>
                <ScenarioSelectField
                    label="完済後の扱い"
                    value={inputs.afterPayoffMode}
                    onChange={(value) => onChange('afterPayoffMode', value as LoanAfterPayoffMode)}
                    options={AFTER_PAYOFF_OPTIONS}
                    help={FIELD_HELP.afterPayoffMode}
                />
            </div>
        </section>
    );
}

export function LoanSimComparison() {
    const [inputs, setInputs] = useState<LoanCompareInputs>(() => createDefaultComparisonInputs());
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

    const handleScenarioChange = (
        scenarioKey: 'scenarioA' | 'scenarioB',
        key: keyof LoanCompareScenarioInputs,
        value: LoanCompareScenarioInputs[keyof LoanCompareScenarioInputs],
    ) => {
        setInputs((current) => {
            const next = {
                ...current,
                scenarioA: { ...current.scenarioA },
                scenarioB: { ...current.scenarioB },
            };
            const target = next[scenarioKey];
            Object.assign(target, { [key]: value });

            if (key === 'autoInvestPaymentDifference' && value === true) {
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
    };

    const handleReset = () => {
        setInputs(createDefaultComparisonInputs());
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
                                label="初期保有金融資産"
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
                            onChange={(key, value) => handleScenarioChange('scenarioA', key, value)}
                        />
                        <ScenarioCard
                            label="B"
                            inputs={inputs.scenarioB}
                            summary={result.summary.scenarioB}
                            onChange={(key, value) => handleScenarioChange('scenarioB', key, value)}
                            onCopyFromA={handleCopyAToB}
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
