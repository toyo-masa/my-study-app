import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Info } from 'lucide-react';

// ===== Distribution Types =====
type DistributionType = 'normal';

interface DistributionOption {
    value: DistributionType;
    label: string;
    description: string;
    formula: string;
}

const DISTRIBUTIONS: DistributionOption[] = [
    {
        value: 'normal',
        label: '正規分布 (Normal)',
        description: 'データが平均値を中心に左右対称に分布する最も一般的な確率分布。自然界や社会現象で広く見られる。',
        formula: 'f(x) = (1 / (σ√(2π))) × e^(-(x-μ)² / (2σ²))',
    },
];

// ===== Math Helpers =====
function normalPDF(x: number, mu: number, sigma: number): number {
    const coefficient = 1 / (sigma * Math.sqrt(2 * Math.PI));
    const exponent = -((x - mu) ** 2) / (2 * sigma ** 2);
    return coefficient * Math.exp(exponent);
}

function normalCDF(x: number, mu: number, sigma: number): number {
    // Approximation using error function
    const z = (x - mu) / (sigma * Math.SQRT2);
    const t = 1 / (1 + 0.3275911 * Math.abs(z));
    const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
    const poly = t * (a[0] + t * (a[1] + t * (a[2] + t * (a[3] + t * a[4]))));
    const erf = 1 - poly * Math.exp(-z * z);
    return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

// ===== Component Props =====
interface DistributionSimulatorProps {
    onBack: () => void;
}

export const DistributionSimulator: React.FC<DistributionSimulatorProps> = ({ onBack }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Distribution state
    const [distributionType, setDistributionType] = useState<DistributionType>('normal');

    // Normal distribution parameters
    const [mu, setMu] = useState(0);
    const [sigma, setSigma] = useState(1);

    // Highlight range
    const [highlightFrom, setHighlightFrom] = useState(-1);
    const [highlightTo, setHighlightTo] = useState(1);
    const [showHighlight, setShowHighlight] = useState(true);

    // Get current distribution info
    const currentDist = DISTRIBUTIONS.find(d => d.value === distributionType)!;

    // Calculate statistics
    const getStats = useCallback(() => {
        switch (distributionType) {
            case 'normal':
                return {
                    mean: mu,
                    variance: sigma ** 2,
                    stddev: sigma,
                    skewness: 0,
                    kurtosis: 3,
                };
        }
    }, [distributionType, mu, sigma]);

    // Calculate PDF for current distribution
    const getPDF = useCallback((x: number): number => {
        switch (distributionType) {
            case 'normal':
                return normalPDF(x, mu, sigma);
        }
    }, [distributionType, mu, sigma]);

    // Calculate CDF for highlight range
    const getHighlightProbability = useCallback((): number => {
        switch (distributionType) {
            case 'normal':
                return normalCDF(highlightTo, mu, sigma) - normalCDF(highlightFrom, mu, sigma);
        }
    }, [distributionType, mu, sigma, highlightFrom, highlightTo]);

    // ===== Canvas Drawing =====
    const drawChart = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        const width = rect.width;
        const height = Math.min(400, width * 0.6);

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.scale(dpr, dpr);

        // Chart margins
        const margin = { top: 20, right: 30, bottom: 50, left: 60 };
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;

        // Determine x-range based on distribution
        const xMin = mu - 4 * sigma;
        const xMax = mu + 4 * sigma;

        // Calculate y-max
        let yMax = 0;
        const numPoints = 300;
        const points: { x: number; y: number }[] = [];

        for (let i = 0; i <= numPoints; i++) {
            const x = xMin + (i / numPoints) * (xMax - xMin);
            const y = getPDF(x);
            points.push({ x, y });
            if (y > yMax) yMax = y;
        }
        yMax *= 1.15; // Add 15% padding

        // Coordinate transforms
        const toCanvasX = (x: number) => margin.left + ((x - xMin) / (xMax - xMin)) * chartWidth;
        const toCanvasY = (y: number) => margin.top + chartHeight - (y / yMax) * chartHeight;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw grid lines
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        ctx.lineWidth = 1;

        // Horizontal gridlines
        const yTicks = 5;
        for (let i = 0; i <= yTicks; i++) {
            const yVal = (i / yTicks) * yMax;
            const cy = toCanvasY(yVal);
            ctx.beginPath();
            ctx.moveTo(margin.left, cy);
            ctx.lineTo(width - margin.right, cy);
            ctx.stroke();
        }

        // Vertical gridlines
        const xStep = sigma >= 1 ? 1 : 0.5;
        for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
            const cx = toCanvasX(x);
            ctx.beginPath();
            ctx.moveTo(cx, margin.top);
            ctx.lineTo(cx, margin.top + chartHeight);
            ctx.stroke();
        }

        // Draw highlighted area
        if (showHighlight) {
            const hlFrom = Math.max(highlightFrom, xMin);
            const hlTo = Math.min(highlightTo, xMax);

            const gradient = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartHeight);
            gradient.addColorStop(0, 'rgba(99, 102, 241, 0.35)');
            gradient.addColorStop(1, 'rgba(99, 102, 241, 0.05)');

            ctx.beginPath();
            ctx.moveTo(toCanvasX(hlFrom), toCanvasY(0));

            for (let i = 0; i <= 100; i++) {
                const x = hlFrom + (i / 100) * (hlTo - hlFrom);
                ctx.lineTo(toCanvasX(x), toCanvasY(getPDF(x)));
            }

            ctx.lineTo(toCanvasX(hlTo), toCanvasY(0));
            ctx.closePath();
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        // Draw PDF curve
        const curveGradient = ctx.createLinearGradient(margin.left, 0, width - margin.right, 0);
        curveGradient.addColorStop(0, '#818cf8');
        curveGradient.addColorStop(0.5, '#6366f1');
        curveGradient.addColorStop(1, '#818cf8');

        ctx.beginPath();
        ctx.moveTo(toCanvasX(points[0].x), toCanvasY(points[0].y));

        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(toCanvasX(points[i].x), toCanvasY(points[i].y));
        }

        ctx.strokeStyle = curveGradient;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Fill under curve with subtle gradient
        ctx.lineTo(toCanvasX(xMax), toCanvasY(0));
        ctx.lineTo(toCanvasX(xMin), toCanvasY(0));
        ctx.closePath();

        const fillGrad = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartHeight);
        fillGrad.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
        fillGrad.addColorStop(1, 'rgba(99, 102, 241, 0.02)');
        ctx.fillStyle = fillGrad;
        ctx.fill();

        // Draw mean line
        const meanX = toCanvasX(mu);
        ctx.beginPath();
        ctx.moveTo(meanX, margin.top);
        ctx.lineTo(meanX, margin.top + chartHeight);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw axes
        ctx.strokeStyle = 'var(--text-secondary)';
        ctx.lineWidth = 1.5;

        // X-axis
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top + chartHeight);
        ctx.lineTo(width - margin.right, margin.top + chartHeight);
        ctx.stroke();

        // Y-axis
        ctx.beginPath();
        ctx.moveTo(margin.left, margin.top);
        ctx.lineTo(margin.left, margin.top + chartHeight);
        ctx.stroke();

        // Axis labels
        const isDark = document.body.classList.contains('dark-mode');
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';

        // X-axis labels
        for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
            const cx = toCanvasX(x);
            ctx.fillText(x.toFixed(xStep < 1 ? 1 : 0), cx, margin.top + chartHeight + 20);
        }

        // Y-axis labels
        ctx.textAlign = 'right';
        for (let i = 0; i <= yTicks; i++) {
            const yVal = (i / yTicks) * yMax;
            const cy = toCanvasY(yVal);
            ctx.fillText(yVal.toFixed(2), margin.left - 10, cy + 4);
        }

        // Axis titles
        ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
        ctx.font = '13px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('x', width / 2, height - 5);

        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('f(x)', 0, 0);
        ctx.restore();

        // Mean label
        ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`μ=${mu.toFixed(1)}`, meanX, margin.top - 5);

    }, [getPDF, mu, sigma, showHighlight, highlightFrom, highlightTo]);

    // Redraw on parameter change
    useEffect(() => {
        drawChart();
    }, [drawChart]);

    // Resize handler
    useEffect(() => {
        const handleResize = () => drawChart();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawChart]);

    const stats = getStats();
    const highlightProb = getHighlightProbability();

    return (
        <div className="dist-sim-container">
            {/* Header */}
            <div className="dist-sim-header">
                <button className="menu-btn" onClick={onBack}>
                    <ArrowLeft size={20} />
                </button>
                <h1>分布シミュレーション</h1>
            </div>

            {/* Distribution Selector */}
            <div className="dist-sim-selector">
                <label className="dist-sim-label">分布タイプ</label>
                <select
                    className="dist-sim-select"
                    value={distributionType}
                    onChange={(e) => setDistributionType(e.target.value as DistributionType)}
                >
                    {DISTRIBUTIONS.map(d => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                </select>
            </div>

            {/* Chart */}
            <div className="dist-sim-chart-card">
                <div className="dist-sim-chart-container" ref={containerRef}>
                    <canvas ref={canvasRef} />
                </div>
            </div>

            {/* Controls */}
            <div className="dist-sim-controls">
                <div className="dist-sim-controls-grid">
                    {/* Parameters */}
                    <div className="dist-sim-param-card">
                        <h3>パラメータ</h3>

                        <div className="dist-sim-slider-group">
                            <div className="dist-sim-slider-header">
                                <label>平均 (μ)</label>
                                <span className="dist-sim-slider-value">{mu.toFixed(1)}</span>
                            </div>
                            <input
                                type="range"
                                min="-5"
                                max="5"
                                step="0.1"
                                value={mu}
                                onChange={(e) => setMu(Number(e.target.value))}
                                className="dist-sim-slider"
                            />
                            <div className="dist-sim-slider-range">
                                <span>-5</span>
                                <span>0</span>
                                <span>5</span>
                            </div>
                        </div>

                        <div className="dist-sim-slider-group">
                            <div className="dist-sim-slider-header">
                                <label>標準偏差 (σ)</label>
                                <span className="dist-sim-slider-value">{sigma.toFixed(1)}</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="5"
                                step="0.1"
                                value={sigma}
                                onChange={(e) => setSigma(Number(e.target.value))}
                                className="dist-sim-slider"
                            />
                            <div className="dist-sim-slider-range">
                                <span>0.1</span>
                                <span>2.5</span>
                                <span>5.0</span>
                            </div>
                        </div>
                    </div>

                    {/* Highlight Range */}
                    <div className="dist-sim-param-card">
                        <h3>
                            確率範囲
                            <label className="dist-sim-toggle-label">
                                <input
                                    type="checkbox"
                                    checked={showHighlight}
                                    onChange={(e) => setShowHighlight(e.target.checked)}
                                />
                                表示
                            </label>
                        </h3>

                        {showHighlight && (
                            <>
                                <div className="dist-sim-slider-group">
                                    <div className="dist-sim-slider-header">
                                        <label>下限</label>
                                        <span className="dist-sim-slider-value">{highlightFrom.toFixed(1)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={mu - 4 * sigma}
                                        max={mu + 4 * sigma}
                                        step="0.1"
                                        value={highlightFrom}
                                        onChange={(e) => setHighlightFrom(Number(e.target.value))}
                                        className="dist-sim-slider highlight-slider"
                                    />
                                </div>

                                <div className="dist-sim-slider-group">
                                    <div className="dist-sim-slider-header">
                                        <label>上限</label>
                                        <span className="dist-sim-slider-value">{highlightTo.toFixed(1)}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={mu - 4 * sigma}
                                        max={mu + 4 * sigma}
                                        step="0.1"
                                        value={highlightTo}
                                        onChange={(e) => setHighlightTo(Number(e.target.value))}
                                        className="dist-sim-slider highlight-slider"
                                    />
                                </div>

                                <div className="dist-sim-probability">
                                    <span>P({highlightFrom.toFixed(1)} ≤ X ≤ {highlightTo.toFixed(1)})</span>
                                    <strong>{(highlightProb * 100).toFixed(2)}%</strong>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Info Section */}
                <div className="dist-sim-info-grid">
                    {/* Stats */}
                    <div className="dist-sim-info-card">
                        <h3>統計量</h3>
                        <div className="dist-sim-stats-grid">
                            <div className="dist-sim-stat">
                                <span className="stat-label">期待値 E[X]</span>
                                <span className="stat-value">{stats.mean.toFixed(2)}</span>
                            </div>
                            <div className="dist-sim-stat">
                                <span className="stat-label">分散 V[X]</span>
                                <span className="stat-value">{stats.variance.toFixed(2)}</span>
                            </div>
                            <div className="dist-sim-stat">
                                <span className="stat-label">標準偏差 σ</span>
                                <span className="stat-value">{stats.stddev.toFixed(2)}</span>
                            </div>
                            <div className="dist-sim-stat">
                                <span className="stat-label">歪度</span>
                                <span className="stat-value">{stats.skewness.toFixed(2)}</span>
                            </div>
                            <div className="dist-sim-stat">
                                <span className="stat-label">尖度</span>
                                <span className="stat-value">{stats.kurtosis.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="dist-sim-info-card">
                        <h3><Info size={16} /> 分布の説明</h3>
                        <p className="dist-sim-description">{currentDist.description}</p>
                        <div className="dist-sim-formula">
                            <code>{currentDist.formula}</code>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
