import type { LoanComparisonResult } from '../../features/loanSim/types';

type LoanSimComparisonSummaryProps = {
    result: LoanComparisonResult;
};

type SummaryItem = {
    label: string;
    value: string;
    note?: string;
    emphasized?: boolean;
};

function formatCurrency(value: number): string {
    return `${new Intl.NumberFormat('ja-JP').format(Math.round(value))}円`;
}

export function LoanSimComparisonSummary({ result }: LoanSimComparisonSummaryProps) {
    const { summary } = result;
    const finalDiffNote = summary.finalDiff > 0
        ? '最終時点では B が有利です。'
        : summary.finalDiff < 0
            ? '最終時点では A が有利です。'
            : '最終時点では同水準です。';
    const items: SummaryItem[] = [
        {
            label: 'シナリオA 最終純資産',
            value: formatCurrency(summary.finalNetWorthA),
            note: `頭金: ${formatCurrency(summary.scenarioA.downPayment)} / 借入額: ${formatCurrency(summary.scenarioA.loanAmount)} / 完済時期: ${summary.scenarioA.payoffMonthLabel}`,
            emphasized: true,
        },
        {
            label: 'シナリオB 最終純資産',
            value: formatCurrency(summary.finalNetWorthB),
            note: `頭金: ${formatCurrency(summary.scenarioB.downPayment)} / 借入額: ${formatCurrency(summary.scenarioB.loanAmount)} / 完済時期: ${summary.scenarioB.payoffMonthLabel}`,
            emphasized: true,
        },
        {
            label: '最終差分（B - A）',
            value: formatCurrency(summary.finalDiff),
            note: finalDiffNote,
            emphasized: true,
        },
        {
            label: '逆転時期',
            value: summary.crossoverMonthLabel ?? 'なし',
            note: summary.crossoverMonthLabel ? '純資産差の符号が切り替わった最初の月です。' : '比較期間中に優劣の逆転はありませんでした。',
        },
        {
            label: 'A の総支払利息',
            value: formatCurrency(summary.scenarioA.totalInterest),
            note: `初期投資元本: ${formatCurrency(summary.scenarioA.initialInvestmentBalance)} / 最終投資残高: ${formatCurrency(summary.scenarioA.finalInvestmentBalance)}`,
        },
        {
            label: 'B の総支払利息',
            value: formatCurrency(summary.scenarioB.totalInterest),
            note: `初期投資元本: ${formatCurrency(summary.scenarioB.initialInvestmentBalance)} / 最終投資残高: ${formatCurrency(summary.scenarioB.finalInvestmentBalance)}`,
        },
        {
            label: 'A の初月返済相当額',
            value: formatCurrency(summary.scenarioA.firstMonthlyPayment),
            note: summary.scenarioA.lastActiveMonthlyPayment > 0
                ? `完済直前の毎月返済相当額は ${formatCurrency(summary.scenarioA.lastActiveMonthlyPayment)} です。`
                : undefined,
        },
        {
            label: 'B の初月返済相当額',
            value: formatCurrency(summary.scenarioB.firstMonthlyPayment),
            note: summary.scenarioB.lastActiveMonthlyPayment > 0
                ? `完済直前の毎月返済相当額は ${formatCurrency(summary.scenarioB.lastActiveMonthlyPayment)} です。`
                : undefined,
        },
    ];

    return (
        <section className="loan-sim-card loan-sim-summary-card loan-sim-compare-summary-card">
            <div className="loan-sim-card-head">
                <div>
                    <h2>比較サマリー</h2>
                    <p>{`比較期間は ${summary.effectiveComparisonYears} 年です。最終差分と逆転時期を先に確認できます。`}</p>
                </div>
            </div>

            <div className="loan-sim-summary-grid is-primary">
                {items.map((item) => (
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
        </section>
    );
}
