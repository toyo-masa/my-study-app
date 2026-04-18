import type { LoanSimulationResult } from '../../features/loanSim/types';

type LoanSimSummaryProps = {
    result: LoanSimulationResult;
};

function formatCurrency(value: number): string {
    return `${new Intl.NumberFormat('ja-JP').format(Math.round(value))}円`;
}

function formatPercent(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
        return '算出なし';
    }
    return `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

type SummaryItem = {
    label: string;
    value: string;
    note?: string;
    tier: 'primary' | 'secondary';
    emphasized?: boolean;
};

export function LoanSimSummary({ result }: LoanSimSummaryProps) {
    const { sanitizedInputs, summary } = result;
    const monthlyPaymentLabel = sanitizedInputs.repaymentType === 'equal-principal'
        ? '初月の毎月返済額'
        : '毎月返済額';
    const ratioTargetLabel = sanitizedInputs.repaymentType === 'equal-principal'
        ? '初月返済額'
        : '毎月返済額';

    const items: SummaryItem[] = [
        {
            label: monthlyPaymentLabel,
            value: formatCurrency(summary.firstMonthlyPayment),
            note: sanitizedInputs.repaymentType === 'equal-principal'
                ? `最終月は ${formatCurrency(summary.lastMonthlyPayment)} まで下がります。`
                : undefined,
            tier: 'primary',
            emphasized: true,
        },
        {
            label: '初月の毎月総支出',
            value: formatCurrency(summary.firstMonthlyOutflow),
            note: `ローン返済 + 固定費 + 積立。ボーナス月は別途 ${formatCurrency(summary.bonusRepayment)} 加算します。`,
            tier: 'primary',
            emphasized: true,
        },
        {
            label: '年収比の返済負担',
            value: formatPercent(summary.paymentToGrossIncomeRatio),
            note: summary.paymentToGrossIncomeRatio === null
                ? '年収が 0 円のため算出していません。'
                : `月換算の年収 ${formatCurrency(summary.grossMonthlyIncome)} に対する${ratioTargetLabel}の割合です。`,
            tier: 'primary',
        },
        {
            label: '手取り比の返済負担',
            value: formatPercent(summary.paymentToTakeHomeRatio),
            note: summary.paymentToTakeHomeRatio === null
                ? '概算手取りが 0 円のため算出していません。'
                : `概算手取りは月 ${formatCurrency(summary.estimatedMonthlyTakeHome)}、年 ${formatCurrency(summary.estimatedAnnualTakeHome)} として見ています。`,
            tier: 'primary',
        },
        {
            label: '積立最終額',
            value: formatCurrency(summary.finalSavingsBalance),
            note: `ローン完済時点の積立残高は ${formatCurrency(summary.savingsBalanceAtPayoff)} です。`,
            tier: 'primary',
        },
        {
            label: '総返済額',
            value: formatCurrency(summary.totalRepayment),
            note: 'ローン元本と利息、ボーナス返済を含めた総額です。',
            tier: 'secondary',
        },
        {
            label: '総利息',
            value: formatCurrency(summary.totalInterest),
            note: '返済期間中に支払う利息の合計です。',
            tier: 'secondary',
        },
        {
            label: '実質住居コスト目安',
            value: formatCurrency(summary.firstMonthNetHousingCost),
            note: `積立を資産側に見ると、平均は月 ${formatCurrency(summary.averageMonthlyNetHousingCost)} です。`,
            tier: 'secondary',
        },
        {
            label: '総支出（積立込み）',
            value: formatCurrency(summary.totalHousingOutflow),
            note: '固定費と積立も含めた、計画期間全体のキャッシュアウトです。',
            tier: 'secondary',
        },
    ];
    const primaryItems = items.filter((item) => item.tier === 'primary');
    const secondaryItems = items.filter((item) => item.tier === 'secondary');

    return (
        <section className="loan-sim-card loan-sim-summary-card">
            <div className="loan-sim-summary-grid is-primary">
                {primaryItems.map((item) => (
                    <article
                        key={item.label}
                        className={`loan-sim-summary-item ${item.emphasized ? 'is-emphasized' : ''}`}
                    >
                        <div className="loan-sim-summary-main">
                            <span className="loan-sim-summary-label">{item.label}</span>
                            <strong className="loan-sim-summary-value">{item.value}</strong>
                        </div>
                        {item.note ? <p className="loan-sim-summary-note">{item.note}</p> : null}
                    </article>
                ))}
            </div>

            <div className="loan-sim-summary-grid is-secondary">
                {secondaryItems.map((item) => (
                    <article
                        key={item.label}
                        className={`loan-sim-summary-item is-secondary ${item.emphasized ? 'is-emphasized' : ''}`}
                    >
                        <div className="loan-sim-summary-main">
                            <span className="loan-sim-summary-label">{item.label}</span>
                            <strong className="loan-sim-summary-value">{item.value}</strong>
                        </div>
                        {item.note ? <p className="loan-sim-summary-note">{item.note}</p> : null}
                    </article>
                ))}
            </div>
        </section>
    );
}
