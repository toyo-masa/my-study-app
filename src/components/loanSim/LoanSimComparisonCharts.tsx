import { useState } from 'react';
import type { LoanComparePoint, LoanComparisonResult } from '../../features/loanSim/types';

type LoanSimComparisonChartsProps = {
    result: LoanComparisonResult;
};

type SeriesKey = keyof Pick<
    LoanComparePoint,
    | 'netWorthA'
    | 'netWorthB'
    | 'netWorthDiff'
    | 'investmentBalanceA'
    | 'investmentBalanceB'
    | 'loanBalanceA'
    | 'loanBalanceB'
    | 'cumulativeInvestmentGainA'
    | 'cumulativeInvestmentGainB'
    | 'cumulativeInterestA'
    | 'cumulativeInterestB'
>;

type SeriesConfig = {
    key: SeriesKey;
    label: string;
    color: string;
};

type CompareChartCardProps = {
    className?: string;
    title: string;
    description: string;
    points: LoanComparePoint[];
    series: SeriesConfig[];
    areaSeriesKey?: SeriesKey;
    areaBaselineValue?: number;
    areaFillColor?: string;
    showZeroLine?: boolean;
    extraTooltipLines?: (point: LoanComparePoint) => Array<{ label: string; value: string; color?: string }>;
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

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function buildAreaPath(
    points: LoanComparePoint[],
    values: number[],
    baselineValue: number,
    xForIndex: (index: number) => number,
    yForValue: (value: number) => number,
): string {
    return [
        `M ${xForIndex(0).toFixed(2)} ${yForValue(baselineValue).toFixed(2)}`,
        ...points.map((_, index) => `L ${xForIndex(index).toFixed(2)} ${yForValue(values[index] ?? 0).toFixed(2)}`),
        `L ${xForIndex(points.length - 1).toFixed(2)} ${yForValue(baselineValue).toFixed(2)}`,
        'Z',
    ].join(' ');
}

function CompareChartCard({
    className,
    title,
    description,
    points,
    series,
    areaSeriesKey,
    areaBaselineValue = 0,
    areaFillColor,
    showZeroLine = false,
    extraTooltipLines,
}: CompareChartCardProps) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const svgWidth = 760;
    const svgHeight = 260;
    const padding = { top: 18, right: 18, bottom: 34, left: 18 };
    const innerWidth = svgWidth - padding.left - padding.right;
    const innerHeight = svgHeight - padding.top - padding.bottom;
    const allValues = series.flatMap((item) => points.map((point) => point[item.key] as number));
    const minValue = Math.min(...allValues, showZeroLine ? 0 : Number.POSITIVE_INFINITY, areaSeriesKey ? areaBaselineValue : Number.POSITIVE_INFINITY);
    const maxValue = Math.max(...allValues, showZeroLine ? 0 : Number.NEGATIVE_INFINITY, areaSeriesKey ? areaBaselineValue : Number.NEGATIVE_INFINITY);
    const normalizedMin = Number.isFinite(minValue) ? minValue : 0;
    const normalizedMax = Number.isFinite(maxValue) ? maxValue : 0;
    const valueSpan = normalizedMax - normalizedMin;
    const rangePadding = valueSpan === 0
        ? Math.max(1, Math.abs(normalizedMax) * 0.08 || 1)
        : valueSpan * 0.08;
    const domainMin = normalizedMin - rangePadding;
    const domainMax = normalizedMax + rangePadding;
    const xForIndex = (index: number) => padding.left + (innerWidth * index) / Math.max(points.length - 1, 1);
    const yForValue = (value: number) => padding.top + ((domainMax - value) / Math.max(domainMax - domainMin, 1)) * innerHeight;
    const tickIndices = buildTickIndices(points.length);
    const zeroY = showZeroLine || (domainMin <= 0 && domainMax >= 0) ? yForValue(0) : null;
    const lastValues = series.map((item) => points[points.length - 1]?.[item.key] as number ?? 0);
    const activePoint = activeIndex !== null ? points[activeIndex] ?? null : null;
    const tooltipX = activeIndex !== null ? clamp(xForIndex(activeIndex), 132, svgWidth - 132) : null;
    const areaValues = areaSeriesKey ? points.map((point) => point[areaSeriesKey] as number) : null;
    const areaPath = areaValues && areaFillColor
        ? buildAreaPath(points, areaValues, areaBaselineValue, xForIndex, yForValue)
        : null;

    const updateActiveIndexFromClientX = (clientX: number, left: number, width: number) => {
        if (points.length === 0 || width <= 0) {
            setActiveIndex(null);
            return;
        }

        const ratio = clamp((clientX - left) / width, 0, 1);
        const nextIndex = Math.round(ratio * Math.max(points.length - 1, 1));
        setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
    };

    return (
        <article className={`loan-sim-chart-card${className ? ` ${className}` : ''}`}>
            <div className="loan-sim-chart-head">
                <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                </div>
                <div className="loan-sim-chart-meta loan-sim-compare-chart-legend">
                    {series.map((item, index) => (
                        <span key={item.key} style={{ color: item.color }}>
                            {item.label}: {formatCurrency(lastValues[index] ?? 0)}
                        </span>
                    ))}
                </div>
            </div>

            <div className="loan-sim-chart-shell">
                {activePoint && tooltipX !== null ? (
                    <div className="loan-sim-chart-tooltip" style={{ left: `${(tooltipX / svgWidth) * 100}%` }}>
                        <span className="loan-sim-chart-tooltip-date">{activePoint.monthLabel}</span>
                        {series.map((item) => (
                            <span
                                key={`tooltip-${title}-${item.key}`}
                                className="loan-sim-chart-tooltip-breakdown"
                                style={{ color: item.color }}
                            >
                                {item.label}: {formatCurrency((activePoint[item.key] as number) ?? 0)}
                            </span>
                        ))}
                        {extraTooltipLines?.(activePoint).map((item) => (
                            <span
                                key={`${title}-${item.label}`}
                                className="loan-sim-chart-tooltip-breakdown"
                                style={item.color ? { color: item.color } : undefined}
                            >
                                {item.label}: {item.value}
                            </span>
                        ))}
                    </div>
                ) : null}

                <svg
                    className="loan-sim-chart-svg"
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    aria-label={title}
                    role="img"
                    onMouseMove={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        updateActiveIndexFromClientX(event.clientX, rect.left, rect.width);
                    }}
                    onMouseLeave={() => setActiveIndex(null)}
                    onTouchStart={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        updateActiveIndexFromClientX(event.touches[0].clientX, rect.left, rect.width);
                    }}
                    onTouchMove={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        updateActiveIndexFromClientX(event.touches[0].clientX, rect.left, rect.width);
                    }}
                >
                    {tickIndices.map((tickIndex) => (
                        <line
                            key={`grid-${title}-${tickIndex}`}
                            x1={xForIndex(tickIndex)}
                            y1={padding.top}
                            x2={xForIndex(tickIndex)}
                            y2={svgHeight - padding.bottom}
                            className="loan-sim-chart-grid-line"
                        />
                    ))}
                    {zeroY !== null ? (
                        <line
                            x1={padding.left}
                            y1={zeroY}
                            x2={svgWidth - padding.right}
                            y2={zeroY}
                            className="loan-sim-compare-zero-line"
                        />
                    ) : null}
                    {activeIndex !== null ? (
                        <line
                            x1={xForIndex(activeIndex)}
                            y1={padding.top}
                            x2={xForIndex(activeIndex)}
                            y2={svgHeight - padding.bottom}
                            className="loan-sim-chart-hover-line"
                        />
                    ) : null}
                    {areaPath && areaFillColor ? (
                        <path d={areaPath} fill={areaFillColor} className="loan-sim-chart-area" />
                    ) : null}
                    {series.map((item) => {
                        const path = points
                            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xForIndex(index).toFixed(2)} ${yForValue(point[item.key] as number).toFixed(2)}`)
                            .join(' ');
                        return (
                            <path
                                key={`${title}-${item.key}`}
                                d={path}
                                stroke={item.color}
                                className="loan-sim-chart-line"
                            />
                        );
                    })}
                    {activePoint ? series.map((item) => (
                        <circle
                            key={`point-${title}-${item.key}`}
                            cx={xForIndex(activeIndex ?? 0)}
                            cy={yForValue((activePoint[item.key] as number) ?? 0)}
                            r={4}
                            fill={item.color}
                            className="loan-sim-chart-hover-point"
                        />
                    )) : null}
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

export function LoanSimComparisonCharts({ result }: LoanSimComparisonChartsProps) {
    const { chartPoints } = result;

    return (
        <section className="loan-sim-card">
            <div className="loan-sim-card-head">
                <div>
                    <h2>戦略比較グラフ</h2>
                    <p>主役は純資産差です。A/B の純資産・投資残高・ローン残高も同じ期間で重ねて比較できます。</p>
                </div>
            </div>

            <div className="loan-sim-chart-grid">
                <CompareChartCard
                    className="is-featured"
                    title="純資産差（B - A）"
                    description="0 円より上なら B が有利、下なら A が有利です。戦略差の推移を最初に確認できます。"
                    points={chartPoints}
                    series={[{ key: 'netWorthDiff', label: '差分（B - A）', color: '#0f766e' }]}
                    areaSeriesKey="netWorthDiff"
                    areaBaselineValue={0}
                    areaFillColor="rgba(15, 118, 110, 0.12)"
                    showZeroLine
                />
                <CompareChartCard
                    title="純資産の比較"
                    description="A/B の純資産を 2 本線で重ねています。tooltip では差分も確認できます。"
                    points={chartPoints}
                    series={[
                        { key: 'netWorthA', label: 'シナリオA', color: '#2563eb' },
                        { key: 'netWorthB', label: 'シナリオB', color: '#0f766e' },
                    ]}
                    extraTooltipLines={(point) => [
                        { label: '差分（B - A）', value: formatCurrency(point.netWorthDiff), color: '#7c3aed' },
                    ]}
                />
                <CompareChartCard
                    title="投資残高の比較"
                    description="A/B それぞれの投資評価額の推移です。差額自動積立や完済後積立の効き方を見られます。"
                    points={chartPoints}
                    series={[
                        { key: 'investmentBalanceA', label: 'シナリオA', color: '#2563eb' },
                        { key: 'investmentBalanceB', label: 'シナリオB', color: '#0f766e' },
                    ]}
                />
                <CompareChartCard
                    title="ローン残高の比較"
                    description="A/B それぞれのローン残高の減り方です。完済時期の差も同じ軸で追えます。"
                    points={chartPoints}
                    series={[
                        { key: 'loanBalanceA', label: 'シナリオA', color: '#2563eb' },
                        { key: 'loanBalanceB', label: 'シナリオB', color: '#dc2626' },
                    ]}
                />
                <CompareChartCard
                    title="累計運用益と累計ローン利息"
                    description="主グラフではありませんが、A/B それぞれで運用益が利息をどこまで相殺できているかを補助的に確認できます。"
                    points={chartPoints}
                    series={[
                        { key: 'cumulativeInvestmentGainA', label: 'A 運用益', color: '#2563eb' },
                        { key: 'cumulativeInterestA', label: 'A 利息', color: '#60a5fa' },
                        { key: 'cumulativeInvestmentGainB', label: 'B 運用益', color: '#0f766e' },
                        { key: 'cumulativeInterestB', label: 'B 利息', color: '#d97706' },
                    ]}
                />
            </div>
        </section>
    );
}
