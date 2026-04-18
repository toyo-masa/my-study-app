import { useState } from 'react';
import type { ReactNode } from 'react';
import type { LoanChartPoint } from '../../features/loanSim/types';

type LoanSimChartsProps = {
    chartPoints: LoanChartPoint[];
    payoffMonthCount: number;
};

type ChartCardProps = {
    className?: string;
    meta?: ReactNode;
    title: string;
    description: string;
    points: LoanChartPoint[];
    valueKey: keyof Pick<LoanChartPoint, 'totalAssets' | 'loanBalance' | 'savingsBalance' | 'cumulativeInterest' | 'cumulativeSavingsInterest' | 'regularPayment'>;
    valueLabel: string;
    strokeColor: string;
    fillColor: string;
    secondaryValueKey?: keyof Pick<LoanChartPoint, 'loanBalance' | 'cumulativeInterest' | 'cumulativeSavingsInterest'>;
    secondaryValueLabel?: string;
    secondaryStrokeColor?: string;
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

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function buildAreaPath(
    points: LoanChartPoint[],
    topValues: number[],
    bottomValues: number[],
    xForIndex: (index: number) => number,
    yForValue: (value: number) => number,
): string {
    return [
        `M ${xForIndex(0).toFixed(2)} ${yForValue(bottomValues[0] ?? 0).toFixed(2)}`,
        ...points.map((_, index) => `L ${xForIndex(index).toFixed(2)} ${yForValue(topValues[index] ?? 0).toFixed(2)}`),
        ...points
            .map((_, index) => {
                const reverseIndex = points.length - 1 - index;
                return `L ${xForIndex(reverseIndex).toFixed(2)} ${yForValue(bottomValues[reverseIndex] ?? 0).toFixed(2)}`;
            }),
        'Z',
    ].join(' ');
}

function ChartCard({
    className,
    meta,
    title,
    description,
    points,
    valueKey,
    valueLabel,
    strokeColor,
    fillColor,
    secondaryValueKey,
    secondaryValueLabel,
    secondaryStrokeColor,
    payoffMonthCount,
}: ChartCardProps) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const svgWidth = 760;
    const svgHeight = 260;
    const padding = { top: 18, right: 18, bottom: 34, left: 18 };
    const innerWidth = svgWidth - padding.left - padding.right;
    const innerHeight = svgHeight - padding.top - padding.bottom;
    const values = points.map((point) => point[valueKey] as number);
    const secondaryValues = secondaryValueKey ? points.map((point) => point[secondaryValueKey] as number) : [];
    const maxValue = Math.max(...values, ...secondaryValues, 0);
    const normalizedMaxValue = maxValue > 0 ? maxValue * 1.08 : 1;
    const baselineY = svgHeight - padding.bottom;
    const xForIndex = (index: number) => padding.left + (innerWidth * index) / Math.max(points.length - 1, 1);
    const yForValue = (value: number) => baselineY - (value / normalizedMaxValue) * innerHeight;

    const linePath = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xForIndex(index).toFixed(2)} ${yForValue(point[valueKey] as number).toFixed(2)}`)
        .join(' ');
    const secondaryLinePath = secondaryValueKey
        ? points
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xForIndex(index).toFixed(2)} ${yForValue(point[secondaryValueKey] as number).toFixed(2)}`)
            .join(' ')
        : null;
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
    const activePoint = activeIndex !== null ? points[activeIndex] ?? null : null;
    const activeValue = activePoint ? (activePoint[valueKey] as number) : null;
    const activePointX = activeIndex !== null ? xForIndex(activeIndex) : null;
    const activePointY = activeValue !== null ? yForValue(activeValue) : null;
    const tooltipX = activePointX !== null ? clamp(activePointX, 112, svgWidth - 112) : null;

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
                {meta ?? (
                    <div className="loan-sim-chart-meta">
                        <span>最終 {formatCurrency(lastValue)}</span>
                        <span>最大 {formatCurrency(peakValue)}</span>
                    </div>
                )}
            </div>

            <div className="loan-sim-chart-shell">
                {activePoint && activeValue !== null && tooltipX !== null ? (
                    <div
                        className="loan-sim-chart-tooltip"
                        style={{ left: `${(tooltipX / svgWidth) * 100}%` }}
                    >
                        <span className="loan-sim-chart-tooltip-date">{activePoint.monthLabel}</span>
                        <strong className="loan-sim-chart-tooltip-value">
                            {valueLabel}: {formatCurrency(activeValue)}
                        </strong>
                        {secondaryValueKey && secondaryValueLabel ? (
                            <span className="loan-sim-chart-tooltip-breakdown is-secondary-default">
                                {secondaryValueLabel}: {formatCurrency((activePoint[secondaryValueKey] as number) ?? 0)}
                            </span>
                        ) : null}
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
                    {activePointX !== null ? (
                        <line
                            x1={activePointX}
                            y1={padding.top}
                            x2={activePointX}
                            y2={baselineY}
                            className="loan-sim-chart-hover-line"
                        />
                    ) : null}
                    <path d={areaPath} fill={fillColor} className="loan-sim-chart-area" />
                    <path d={linePath} stroke={strokeColor} className="loan-sim-chart-line" />
                    {secondaryLinePath && secondaryStrokeColor ? (
                        <path d={secondaryLinePath} stroke={secondaryStrokeColor} className="loan-sim-chart-line is-secondary-line" />
                    ) : null}
                    {activePointX !== null && activePointY !== null ? (
                        <circle
                            cx={activePointX}
                            cy={activePointY}
                            r={4.5}
                            fill={strokeColor}
                            className="loan-sim-chart-hover-point"
                        />
                    ) : null}
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

type TotalAssetsPartKey = 'propertyPrice' | 'savingsBalance' | 'loanBalance';

const TOTAL_ASSETS_PARTS: Array<{
    key: TotalAssetsPartKey;
    label: string;
    colorClassName: string;
}> = [
    { key: 'propertyPrice', label: '物件価格', colorClassName: 'is-property-price' },
    { key: 'savingsBalance', label: '積立残高', colorClassName: 'is-savings-balance' },
    { key: 'loanBalance', label: 'ローン残高', colorClassName: 'is-loan-balance' },
];

function TotalAssetsChartCard({
    chartPoints,
    payoffMonthCount,
}: {
    chartPoints: LoanChartPoint[];
    payoffMonthCount: number;
}) {
    const [enabledParts, setEnabledParts] = useState<Record<TotalAssetsPartKey, boolean>>({
        propertyPrice: true,
        savingsBalance: true,
        loanBalance: true,
    });
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const svgWidth = 760;
    const svgHeight = 260;
    const padding = { top: 18, right: 18, bottom: 34, left: 18 };
    const innerWidth = svgWidth - padding.left - padding.right;
    const innerHeight = svgHeight - padding.top - padding.bottom;
    const baselineY = svgHeight - padding.bottom;
    const xForIndex = (index: number) => padding.left + (innerWidth * index) / Math.max(chartPoints.length - 1, 1);

    const togglePart = (partKey: TotalAssetsPartKey) => {
        setEnabledParts((current) => {
            const next = { ...current, [partKey]: !current[partKey] };
            if (!next.propertyPrice && !next.savingsBalance && !next.loanBalance) {
                return current;
            }
            return next;
        });
    };

    const selectedLabel = TOTAL_ASSETS_PARTS.filter((part) => enabledParts[part.key])
        .map((part) => part.label)
        .join(' + ');
    const propertyPriceValues = chartPoints.map((point) => point.totalAssets - point.savingsBalance);
    const savingsValues = chartPoints.map((point) => point.savingsBalance);
    const loanBalanceValues = chartPoints.map((point) => point.loanBalance);
    const computedPoints = chartPoints.map((point, index) => ({
        ...point,
        totalAssets:
            (enabledParts.propertyPrice ? propertyPriceValues[index] ?? 0 : 0) +
            (enabledParts.savingsBalance ? point.savingsBalance : 0),
    }));
    const totalValues = computedPoints.map((point) => point.totalAssets);
    const overlayMaxValue = enabledParts.loanBalance ? Math.max(...loanBalanceValues, 0) : 0;
    const maxValue = Math.max(...totalValues, overlayMaxValue, 0);
    const normalizedMaxValue = maxValue > 0 ? maxValue * 1.08 : 1;
    const yForValue = (value: number) => baselineY - (value / normalizedMaxValue) * innerHeight;
    const tickIndices = buildTickIndices(chartPoints.length);
    const payoffX = payoffMonthCount > 0 ? xForIndex(Math.min(payoffMonthCount, chartPoints.length - 1)) : null;
    const linePath = computedPoints
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xForIndex(index).toFixed(2)} ${yForValue(point.totalAssets).toFixed(2)}`)
        .join(' ');
    const loanBalanceLinePath = chartPoints
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xForIndex(index).toFixed(2)} ${yForValue(point.loanBalance).toFixed(2)}`)
        .join(' ');
    const propertyTopValues = propertyPriceValues.map((value) => (enabledParts.propertyPrice ? value : 0));
    const propertyBottomValues = propertyTopValues.map(() => 0);
    const savingsBottomValues = propertyTopValues;
    const savingsTopValues = savingsValues.map((value, index) => savingsBottomValues[index] + (enabledParts.savingsBalance ? value : 0));
    const propertyAreaPath = buildAreaPath(chartPoints, propertyTopValues, propertyBottomValues, xForIndex, yForValue);
    const savingsAreaPath = buildAreaPath(chartPoints, savingsTopValues, savingsBottomValues, xForIndex, yForValue);
    const activePoint = activeIndex !== null ? computedPoints[activeIndex] ?? null : null;
    const activePointX = activeIndex !== null ? xForIndex(activeIndex) : null;
    const activePointY = activePoint ? yForValue(activePoint.totalAssets) : null;
    const tooltipX = activePointX !== null ? clamp(activePointX, 132, svgWidth - 132) : null;
    const updateActiveIndexFromClientX = (clientX: number, left: number, width: number) => {
        if (chartPoints.length === 0 || width <= 0) {
            setActiveIndex(null);
            return;
        }

        const ratio = clamp((clientX - left) / width, 0, 1);
        const nextIndex = Math.round(ratio * Math.max(chartPoints.length - 1, 1));
        setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
    };
    const lastValue = totalValues.length > 0 ? totalValues[totalValues.length - 1] : 0;
    const peakValue = maxValue;

    return (
        <article className="loan-sim-chart-card is-featured">
            <div className="loan-sim-chart-head">
                <div>
                    <h3>総資産の推移</h3>
                    <p>{`チェックした要素を合算した総資産の推移です。現在: ${selectedLabel}`}</p>
                </div>
                <div className="loan-sim-chart-meta loan-sim-chart-meta-controls">
                    <span>最終 {formatCurrency(lastValue)}</span>
                    <span>最大 {formatCurrency(peakValue)}</span>
                    {TOTAL_ASSETS_PARTS.map((part) => (
                        <label key={part.key} className={`loan-sim-chart-checkbox ${part.colorClassName}`}>
                            <input
                                type="checkbox"
                                checked={enabledParts[part.key]}
                                onChange={() => togglePart(part.key)}
                            />
                            <span>{part.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="loan-sim-chart-shell">
                {activePoint && tooltipX !== null ? (
                    <div
                        className="loan-sim-chart-tooltip"
                        style={{ left: `${(tooltipX / svgWidth) * 100}%` }}
                    >
                        <span className="loan-sim-chart-tooltip-date">{activePoint.monthLabel}</span>
                        <strong className="loan-sim-chart-tooltip-value">
                            総資産: {formatCurrency(activePoint.totalAssets)}
                        </strong>
                        {enabledParts.propertyPrice ? (
                            <span className="loan-sim-chart-tooltip-breakdown is-property-price">
                                物件価格: {formatCurrency(propertyPriceValues[activeIndex ?? 0] ?? 0)}
                            </span>
                        ) : null}
                        {enabledParts.savingsBalance ? (
                            <span className="loan-sim-chart-tooltip-breakdown is-savings-balance">
                                積立残高: {formatCurrency(savingsValues[activeIndex ?? 0] ?? 0)}
                            </span>
                        ) : null}
                        {enabledParts.loanBalance ? (
                            <span className="loan-sim-chart-tooltip-breakdown is-loan-balance">
                                ローン残高: {formatCurrency(loanBalanceValues[activeIndex ?? 0] ?? 0)}
                            </span>
                        ) : null}
                    </div>
                ) : null}
                <svg
                    className="loan-sim-chart-svg"
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    aria-label="総資産の推移"
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
                            key={`grid-total-assets-${tickIndex}`}
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
                    {activePointX !== null ? (
                        <line
                            x1={activePointX}
                            y1={padding.top}
                            x2={activePointX}
                            y2={baselineY}
                            className="loan-sim-chart-hover-line"
                        />
                    ) : null}
                    {enabledParts.propertyPrice ? (
                        <path d={propertyAreaPath} fill="rgba(37, 99, 235, 0.18)" className="loan-sim-chart-area" />
                    ) : null}
                    {enabledParts.savingsBalance ? (
                        <path d={savingsAreaPath} fill="rgba(15, 118, 110, 0.18)" className="loan-sim-chart-area" />
                    ) : null}
                    <path d={linePath} stroke="#059669" className="loan-sim-chart-line" />
                    {enabledParts.loanBalance ? (
                        <path d={loanBalanceLinePath} stroke="#dc2626" className="loan-sim-chart-line is-secondary-line" />
                    ) : null}
                    {activePointX !== null && activePointY !== null ? (
                        <circle
                            cx={activePointX}
                            cy={activePointY}
                            r={4.5}
                            fill="#059669"
                            className="loan-sim-chart-hover-point"
                        />
                    ) : null}
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
                            key={`label-total-assets-${tickIndex}`}
                            x={xForIndex(tickIndex)}
                            y={svgHeight - 10}
                            textAnchor="middle"
                            className="loan-sim-chart-x-label"
                        >
                            {computedPoints[tickIndex]?.shortLabel ?? ''}
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
                    <p>完済ラインを基準に、残高・積立・利息の積み上がりを追えます。グラフ上にマウスを合わせると年月と金額を確認できます。</p>
                </div>
            </div>

            <div className="loan-sim-chart-grid">
                <TotalAssetsChartCard
                    chartPoints={chartPoints}
                    payoffMonthCount={payoffMonthCount}
                />
                <ChartCard
                    title="運用益とローン利息の比較"
                    description="積立で得た累計運用益と、ローンで支払った累計利息の差を見比べるためのグラフです。"
                    points={chartPoints}
                    valueKey="cumulativeSavingsInterest"
                    valueLabel="累計運用益"
                    strokeColor="#0f766e"
                    fillColor="rgba(15, 118, 110, 0.12)"
                    secondaryValueKey="cumulativeInterest"
                    secondaryValueLabel="累計ローン利息"
                    secondaryStrokeColor="#d97706"
                    payoffMonthCount={payoffMonthCount}
                    meta={<div className="loan-sim-chart-meta"><span>緑: 累計運用益</span><span>橙: 累計ローン利息</span></div>}
                />
                <ChartCard
                    title="ローン残高の推移"
                    description="各月の返済後残高です。ボーナス返済は該当月の末に反映しています。"
                    points={chartPoints}
                    valueKey="loanBalance"
                    valueLabel="残高"
                    strokeColor="#2563eb"
                    fillColor="rgba(37, 99, 235, 0.12)"
                    payoffMonthCount={payoffMonthCount}
                />
                <ChartCard
                    title="積立残高の推移"
                    description="前月残高へ利息を反映したあと、月末積立を加えた残高です。"
                    points={chartPoints}
                    valueKey="savingsBalance"
                    valueLabel="積立残高"
                    strokeColor="#0f766e"
                    fillColor="rgba(15, 118, 110, 0.12)"
                    payoffMonthCount={payoffMonthCount}
                />
                <ChartCard
                    title="累計利息の推移"
                    description="返済期間中に積み上がる利息総額の変化です。"
                    points={chartPoints}
                    valueKey="cumulativeInterest"
                    valueLabel="累計利息"
                    strokeColor="#d97706"
                    fillColor="rgba(217, 119, 6, 0.12)"
                    payoffMonthCount={payoffMonthCount}
                />
                <ChartCard
                    title="月次返済額の推移"
                    description="通常月の返済額です。ボーナス返済は別列で表に表示しています。"
                    points={chartPoints}
                    valueKey="regularPayment"
                    valueLabel="月次返済額"
                    strokeColor="#7c3aed"
                    fillColor="rgba(124, 58, 237, 0.12)"
                    payoffMonthCount={payoffMonthCount}
                />
            </div>
        </section>
    );
}
