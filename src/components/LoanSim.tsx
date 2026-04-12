import { useMemo, useState } from 'react';
import { BackButton } from './BackButton';
import { LoanSimCharts } from './loanSim/LoanSimCharts';
import { LoanSimForm } from './loanSim/LoanSimForm';
import { LoanSimScheduleTable } from './loanSim/LoanSimScheduleTable';
import { LoanSimSummary } from './loanSim/LoanSimSummary';
import { calculateLoanSimulation } from '../features/loanSim/calculator';
import type { LoanSimInputs } from '../features/loanSim/types';

type LoanSimProps = {
    onBack: () => void;
};

function buildCurrentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function createDefaultInputs(): LoanSimInputs {
    return {
        propertyPrice: 48_000_000,
        downPayment: 8_000_000,
        loanAmount: 40_000_000,
        isLoanAmountManual: false,
        annualRate: 1.2,
        repaymentYears: 35,
        repaymentType: 'equal-payment',
        monthlySavings: 50_000,
        savingsAnnualRate: 2,
        bonusRepayment: 100_000,
        monthlyFixedCost: 25_000,
        startYearMonth: buildCurrentYearMonth(),
    };
}

function detectEmbeddedMode(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('embedded') === '1') {
        return true;
    }

    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

export function LoanSim({ onBack }: LoanSimProps) {
    const [inputs, setInputs] = useState<LoanSimInputs>(() => createDefaultInputs());
    const embedded = useMemo(() => detectEmbeddedMode(), []);
    const result = useMemo(() => calculateLoanSimulation(inputs), [inputs]);

    const handleChange = <K extends keyof LoanSimInputs>(key: K, value: LoanSimInputs[K]) => {
        setInputs((current) => ({
            ...current,
            [key]: value,
        }));
    };

    return (
        <main className={`content-area loan-sim-page${embedded ? ' is-embedded' : ''}`}>
            <div className="detail-header loan-sim-header">
                {!embedded && <BackButton className="nav-btn" onClick={onBack} label="ホームへ戻る" />}
                <div>
                    <h1>住宅ローン返済シミュレーター</h1>
                    <p className="loan-sim-header-note">
                        借入条件・積立・固定費をまとめて試し、返済負担と将来の積立残高を同じ画面で確認できます。
                    </p>
                </div>
            </div>

            {result.validationIssues.length > 0 && (
                <section className="loan-sim-alert">
                    <h2>入力値の補正</h2>
                    <ul className="loan-sim-alert-list">
                        {result.validationIssues.map((issue, index) => (
                            <li key={`${issue.field}-${index}`}>{issue.message}</li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="loan-sim-top-grid">
                <LoanSimForm
                    inputs={inputs}
                    calculatedLoanAmount={result.sanitizedInputs.autoCalculatedLoanAmount}
                    onChange={handleChange}
                    onReset={() => setInputs(createDefaultInputs())}
                />
                <LoanSimSummary result={result} />
            </div>

            <section className="loan-sim-card">
                <div className="loan-sim-card-head">
                    <div>
                        <h2>計算ルール</h2>
                        <p>条件の解釈を固定して、比較しやすい形で月次シミュレーションしています。</p>
                    </div>
                </div>
                <ul className="loan-sim-info-list">
                    {result.infoMessages.map((message) => (
                        <li key={message}>{message}</li>
                    ))}
                </ul>
            </section>

            <LoanSimCharts
                chartPoints={result.chartPoints}
                payoffMonthCount={result.summary.payoffMonthCount}
            />

            <LoanSimScheduleTable rows={result.schedule} />
        </main>
    );
}
