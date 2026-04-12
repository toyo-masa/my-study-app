import type { LoanChartPoint } from '../../features/loanSim/types';

type LoanSimChartsProps = {
    chartPoints: LoanChartPoint[];
    payoffMonthCount: number;
};

type ChartCardProps = {
    title: string;
    description: string;
    points: LoanChartPoint[];
    valueKey: keyof Pick<LoanChartPoint, 'loanBalance' | 'savingsBalance' | 'cumulativeInterest' | 'regularPayment'>;
    strokeColor: string;
    fillColor: string;
    payoffMonthCount: number;
};

function formatCurrency(value: number): string {
    return `${new Intl.NumberFormat('ja-JP').format(Math.round(value))}円`;
}

function buildTickIndices(length: number): number[] {
    if (length <= 1) {
        return [0];
    }

    const tickCount = Math.min(6, length);
    const indices = new Set<number>([0, length - 1]);
    for (let index = 1; index < tickCount - 1; index += 1) {
        indices.add(Math.round(((length - 1) * index) / (tickCount - 1)));
    }

    return [...indices].sort((left, right) => left - right);
}

function ChartCard({
    title,
    description,
    points,
    valueKey,
    strokeColor,
    fillColor,
    payoffMonthCount,
}: ChartCardProps) {
    const svgWidth = 760;
    const svgHeight = 260;
    const padding = { top: 18, right: 18, bottom: 34, left: 18 };
    const innerWidth = svgWidth - padding.left - padding.right;
    const innerHeight = svgHeight - padding.top - padding.bottom;
    const values = points.map((point) => point[valueKey] as number);
    const maxValue = Math.max(...values, 0);
    const normalizedMaxValue = maxValue > 0 ? maxValue * 1.08 : 1;
    const baselineY = svgHeight - padding.bottom;
    const xForIndex = (index: number) => padding.left + (innerWidth * index) / Math.max(points.length - 1, 1);
    const yForValue = (value: number) => baselineY - (value / normalizedMaxValue) * innerHeight;

    const linePath = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xForIndex(index).toFixed(2)} ${yForValue(point[valueKey] as number).toFixed(2)}`)
        .join(' ');
    const areaPath = [
        `M ${xForIndex(0).toFixed(2)} ${baselineY.toFixed(2)}`,
        ...points.map((point, index) => `L ${xForIndex(index).toFixed(2)} ${yForValue(point[valueKey] as number).toFixed(2)}`),
        `L ${xForIndex(points.length - 1).toFixed(2)} ${baselineY.toFixed(2)}`,
        'Z',
    ].join(' ');
    const tickIndices = buildTickIndices(points.length);
    const payoffX = payoffMonthCount > 0 ? xForIndex(Math.min(payoffMonthCount, points.length - 1)) : null;
    const lastValue = values.length > 0 ? values[values.length - 1] : 0;
    const peakValue = maxValue;

    return (
        <article className="loan-sim-chart-card">
            <div className="loan-sim-chart-head">
                <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                </div>
                <div className="loan-sim-chart-meta">
                    <span>最終 {formatCurrency(lastValue)}</span>
                    <span>最大 {formatCurrency(peakValue)}</span>
                </div>
            </div>

            <div className="loan-sim-chart-shell">
                <svg
                    className="loan-sim-chart-svg"
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    aria-label={title}
                    role="img"
                >
                    {tickIndices.map((tickIndex) => (
                        <line
                            key={`grid-${title}-${tickIndex}`}
                            x1={xForIndex(tickIndex)}
                            y1={padding.top}
                            x2={xForIndex(tickIndex)}
                            y2={baselineY}
                            className="loan-sim-chart-grid-line"
                        />
                    ))}
                    <line
                        x1={padding.left}
                        y1={baselineY}
                        x2={svgWidth - padding.right}
                        y2={baselineY}
                        className="loan-sim-chart-axis"
                    />
                    <path d={areaPath} fill={fillColor} className="loan-sim-chart-area" />
                    <path d={linePath} stroke={strokeColor} className="loan-sim-chart-line" />
                    {payoffX !== null && (
                        <g>
                            <line
                                x1={payoffX}
                                y1={padding.top}
                                x2={payoffX}
                                y2={baselineY}
                                className="loan-sim-chart-payoff-line"
                            />
                            <text
                                x={payoffX}
                                y={padding.top - 4}
                                textAnchor="middle"
                                className="loan-sim-chart-payoff-label"
                            >
                                完済
                            </text>
                        </g>
                    )}
                    {tickIndices.map((tickIndex) => (
                        <text
                            key={`label-${title}-${tickIndex}`}
                            x={xForIndex(tickIndex)}
                            y={svgHeight - 10}
                            textAnchor="middle"
                            className="loan-sim-chart-x-label"
                        >
                            {points[tickIndex]?.shortLabel ?? ''}
                        </text>
                    ))}
                </svg>
            </div>
        </article>
    );
}

export function LoanSimCharts({ chartPoints, payoffMonthCount }: LoanSimChartsProps) {
    return (
        <section className="loan-sim-card">
            <div className="loan-sim-card-head">
                <div>
                    <h2>推移グラフ</h2>
                    <p>完済ラインを基準に、残高・積立・利息の積み上がりを追えます。</p>
                </div>
            </div>

            <div className="loan-sim-chart-grid">
                <ChartCard
                    title="ローン残高の推移"
                    description="各月の返済後残高です。ボーナス返済は該当月の末に反映しています。"
                    points={chartPoints}
                    valueKey="loanBalance"
                    strokeColor="#2563eb"
                    fillColor="rgba(37, 99, 235, 0.12)"
                    payoffMonthCount={payoffMonthCount}
                />
                <ChartCard
                    title="積立残高の推移"
                    description="前月残高へ利息を反映したあと、月末積立を加えた残高です。"
                    points={chartPoints}
                    valueKey="savingsBalance"
                    strokeColor="#0f766e"
                    fillColor="rgba(15, 118, 110, 0.12)"
                    payoffMonthCount={payoffMonthCount}
                />
                <ChartCard
                    title="累計利息の推移"
                    description="返済期間中に積み上がる利息総額の変化です。"
                    points={chartPoints}
                    valueKey="cumulativeInterest"
                    strokeColor="#d97706"
                    fillColor="rgba(217, 119, 6, 0.12)"
                    payoffMonthCount={payoffMonthCount}
                />
                <ChartCard
                    title="月次返済額の推移"
                    description="通常月の返済額です。ボーナス返済は別列で表に表示しています。"
                    points={chartPoints}
                    valueKey="regularPayment"
                    strokeColor="#7c3aed"
                    fillColor="rgba(124, 58, 237, 0.12)"
                    payoffMonthCount={payoffMonthCount}
                />
            </div>
        </section>
    );
}
