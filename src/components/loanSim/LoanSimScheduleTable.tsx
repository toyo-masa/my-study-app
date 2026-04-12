import { useState } from 'react';
import type { LoanScheduleRow } from '../../features/loanSim/types';

type LoanSimScheduleTableProps = {
    rows: LoanScheduleRow[];
};

function formatCurrency(value: number): string {
    return `${new Intl.NumberFormat('ja-JP').format(Math.round(value))}円`;
}

const INITIAL_VISIBLE_ROWS = 36;

export function LoanSimScheduleTable({ rows }: LoanSimScheduleTableProps) {
    const [visibleCount, setVisibleCount] = useState(() => Math.min(INITIAL_VISIBLE_ROWS, rows.length));
    const effectiveVisibleCount = Math.min(visibleCount, rows.length);
    const visibleRows = rows.slice(0, effectiveVisibleCount);

    return (
        <section className="loan-sim-card loan-sim-schedule-card">
            <div className="loan-sim-card-head">
                <div>
                    <h2>月別返済表</h2>
                    <p>ボーナス返済・積立・固定費まで含めた月次の内訳です。</p>
                </div>
                <span className="loan-sim-badge">{visibleRows.length} / {rows.length} か月表示</span>
            </div>

            <div className="loan-sim-table-actions">
                {effectiveVisibleCount < rows.length && (
                    <>
                        <button
                            type="button"
                            className="nav-btn"
                            onClick={() => setVisibleCount((current) => Math.min(rows.length, current + INITIAL_VISIBLE_ROWS))}
                        >
                            36か月追加
                        </button>
                        <button type="button" className="nav-btn" onClick={() => setVisibleCount(rows.length)}>
                            すべて表示
                        </button>
                    </>
                )}
                {effectiveVisibleCount > INITIAL_VISIBLE_ROWS && (
                    <button
                        type="button"
                        className="nav-btn"
                        onClick={() => setVisibleCount(Math.min(INITIAL_VISIBLE_ROWS, rows.length))}
                    >
                        折りたたむ
                    </button>
                )}
            </div>

            <div className="table-wrapper loan-sim-table-wrapper">
                <table className="question-table loan-sim-schedule-table">
                    <thead>
                        <tr>
                            <th>回数</th>
                            <th>年月</th>
                            <th>期首残高</th>
                            <th>月返済額</th>
                            <th>うち元金</th>
                            <th>うち利息</th>
                            <th>ボーナス返済</th>
                            <th>期末残高</th>
                            <th>積立額</th>
                            <th>積立残高</th>
                            <th>固定費</th>
                            <th>月総支出</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.map((row) => (
                            <tr key={row.monthKey} className={row.isPayoffMonth ? 'loan-sim-payoff-row' : ''}>
                                <td>{row.monthIndex}</td>
                                <td>{row.monthLabel}</td>
                                <td className="loan-sim-cell-number">{formatCurrency(row.periodStartBalance)}</td>
                                <td className="loan-sim-cell-number">{formatCurrency(row.monthlyPayment)}</td>
                                <td className="loan-sim-cell-number">{formatCurrency(row.principalPayment)}</td>
                                <td className="loan-sim-cell-number">{formatCurrency(row.interestPayment)}</td>
                                <td className="loan-sim-cell-number">{formatCurrency(row.bonusPayment)}</td>
                                <td className="loan-sim-cell-number">{formatCurrency(row.periodEndBalance)}</td>
                                <td className="loan-sim-cell-number">{formatCurrency(row.savingsContribution)}</td>
                                <td className="loan-sim-cell-number">{formatCurrency(row.savingsBalance)}</td>
                                <td className="loan-sim-cell-number">{formatCurrency(row.fixedCost)}</td>
                                <td className="loan-sim-cell-number">{formatCurrency(row.monthlyTotalOutflow)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
