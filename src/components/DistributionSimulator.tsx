import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { MarkdownText } from './MarkdownText';

// ===== Distribution Types =====
type DistributionType =
    | 'normal'
    | 'exponential'
    | 'poisson'
    | 'binomial'
    | 'geometric'
    | 'hypergeometric'
    | 'multinomial'
    | 'lognormal'
    | 'gamma'
    | 'beta';

interface DistributionOption {
    value: DistributionType;
    label: string;
    description: string;
    formula: string;
    latex: string;
    meanLatex: string;
    varianceLatex: string;
    mgfLatex: string;
    discrete: boolean;
}

const DISTRIBUTIONS: DistributionOption[] = [
    {
        value: 'normal',
        label: '正規分布 (Normal)',
        description: 'データが平均値を中心に左右対称に分布する最も一般的な確率分布。自然界や社会現象で広く見られる。',
        formula: 'f(x) = (1/(σ√(2π))) e^(-(x-μ)²/(2σ²))',
        latex: '$$f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} \\exp\\left(-\\frac{(x-\\mu)^2}{2\\sigma^2}\\right)$$',
        meanLatex: '$E[X] = \\mu$',
        varianceLatex: '$V[X] = \\sigma^2$',
        mgfLatex: '$M(t) = \\exp\\left(\\mu t + \\frac{\\sigma^2 t^2}{2}\\right)$',
        discrete: false,
    },
    {
        value: 'exponential',
        label: '指数分布 (Exponential)',
        description: '事象が起こるまでの待ち時間をモデル化する分布。ポアソン過程における事象間の時間間隔に対応する。',
        formula: 'f(x) = λe^(-λx)  (x ≥ 0)',
        latex: '$$f(x) = \\lambda e^{-\\lambda x} \\quad (x \\geq 0)$$',
        meanLatex: '$E[X] = \\frac{1}{\\lambda}$',
        varianceLatex: '$V[X] = \\frac{1}{\\lambda^2}$',
        mgfLatex: '$M(t) = \\frac{\\lambda}{\\lambda - t} \\quad (t < \\lambda)$',
        discrete: false,
    },
    {
        value: 'poisson',
        label: 'ポアソン分布 (Poisson)',
        description: '一定の時間・空間内で起こる稀な事象の回数を表す離散分布。コールセンターの着信数や交通事故件数など。',
        formula: 'P(X=k) = (λ^k e^(-λ)) / k!',
        latex: '$$P(X=k) = \\frac{\\lambda^k e^{-\\lambda}}{k!}$$',
        meanLatex: '$E[X] = \\lambda$',
        varianceLatex: '$V[X] = \\lambda$',
        mgfLatex: '$M(t) = \\exp\\left(\\lambda(e^t - 1)\\right)$',
        discrete: true,
    },
    {
        value: 'binomial',
        label: '二項分布 (Binomial)',
        description: '成功確率pの独立な試行をn回行ったときの成功回数の分布。コイン投げの表の回数など。',
        formula: 'P(X=k) = C(n,k) p^k (1-p)^(n-k)',
        latex: '$$P(X=k) = \\binom{n}{k} p^k (1-p)^{n-k}$$',
        meanLatex: '$E[X] = np$',
        varianceLatex: '$V[X] = np(1-p)$',
        mgfLatex: '$M(t) = (1 - p + pe^t)^n$',
        discrete: true,
    },
    {
        value: 'geometric',
        label: '幾何分布 (Geometric)',
        description: '成功確率pの独立な試行を繰り返し、初めて成功するまでの試行回数（失敗回数）の分布。',
        formula: 'P(X=k) = (1-p)^k × p  (k = 0,1,2,...)',
        latex: '$$P(X=k) = (1-p)^k \\cdot p \\quad (k = 0, 1, 2, \\ldots)$$',
        meanLatex: '$E[X] = \\frac{1-p}{p}$',
        varianceLatex: '$V[X] = \\frac{1-p}{p^2}$',
        mgfLatex: '$M(t) = \\frac{p}{1 - (1-p)e^t} \\quad (t < -\\ln(1-p))$',
        discrete: true,
    },
    {
        value: 'hypergeometric',
        label: '超幾何分布 (Hypergeometric)',
        description: 'N個中K個が当たりの母集団から、非復元でn個を抽出した時の当たり数の分布。品質検査などで使用。',
        formula: 'P(X=k) = C(K,k)C(N-K,n-k) / C(N,n)',
        latex: '$$P(X=k) = \\frac{\\binom{K}{k}\\binom{N-K}{n-k}}{\\binom{N}{n}}$$',
        meanLatex: '$E[X] = \\frac{nK}{N}$',
        varianceLatex: '$V[X] = n\\frac{K}{N}\\frac{N-K}{N}\\frac{N-n}{N-1}$',
        mgfLatex: '',
        discrete: true,
    },
    {
        value: 'multinomial',
        label: '多項分布 (Multinomial)',
        description: 'k個のカテゴリへの分類をn回試行した時の各カテゴリの出現回数の同時分布。サイコロを複数回投げる場合など。ここでは各カテゴリの期待出現回数を棒グラフで表示。',
        formula: 'P = n! / (x₁!...xₖ!) × p₁^x₁ ... pₖ^xₖ',
        latex: '$$P(X_1=x_1,\\ldots,X_k=x_k) = \\frac{n!}{x_1! \\cdots x_k!} p_1^{x_1} \\cdots p_k^{x_k}$$',
        meanLatex: '$E[X_i] = np_i$',
        varianceLatex: '$V[X_i] = np_i(1-p_i)$',
        mgfLatex: '$M(\\mathbf{t}) = \\left(\\sum_{i=1}^k p_i e^{t_i}\\right)^n$',
        discrete: true,
    },
    {
        value: 'lognormal',
        label: '対数正規分布 (Log-Normal)',
        description: '対数が正規分布に従う確率変数の分布。所得分布、株価のリターン、粒子サイズの分布などに適用。',
        formula: 'f(x) = (1/(xσ√(2π))) e^(-(ln x - μ)²/(2σ²))',
        latex: '$$f(x) = \\frac{1}{x\\sigma\\sqrt{2\\pi}} \\exp\\left(-\\frac{(\\ln x - \\mu)^2}{2\\sigma^2}\\right)$$',
        meanLatex: '$E[X] = e^{\\mu + \\sigma^2/2}$',
        varianceLatex: '$V[X] = \\left(e^{\\sigma^2} - 1\\right) e^{2\\mu + \\sigma^2}$',
        mgfLatex: '',
        discrete: false,
    },
    {
        value: 'gamma',
        label: 'ガンマ分布 (Gamma)',
        description: 'α回目の事象が起こるまでの待ち時間をモデル化。指数分布の一般化で、保険や信頼性工学で使用。',
        formula: 'f(x) = (β^α / Γ(α)) x^(α-1) e^(-βx)',
        latex: '$$f(x) = \\frac{\\beta^\\alpha}{\\Gamma(\\alpha)} x^{\\alpha-1} e^{-\\beta x}$$',
        meanLatex: '$E[X] = \\frac{\\alpha}{\\beta}$',
        varianceLatex: '$V[X] = \\frac{\\alpha}{\\beta^2}$',
        mgfLatex: '$M(t) = \\left(\\frac{\\beta}{\\beta - t}\\right)^\\alpha \\quad (t < \\beta)$',
        discrete: false,
    },
    {
        value: 'beta',
        label: 'ベータ分布 (Beta)',
        description: '0~1の範囲の確率や割合をモデル化する分布。ベイズ統計での事前分布として広く使用。',
        formula: 'f(x) = (x^(α-1)(1-x)^(β-1)) / B(α,β)',
        latex: '$$f(x) = \\frac{x^{\\alpha-1}(1-x)^{\\beta-1}}{B(\\alpha, \\beta)} \\quad (0 < x < 1)$$',
        meanLatex: '$E[X] = \\frac{\\alpha}{\\alpha + \\beta}$',
        varianceLatex: '$V[X] = \\frac{\\alpha\\beta}{(\\alpha+\\beta)^2(\\alpha+\\beta+1)}$',
        mgfLatex: '',
        discrete: false,
    },
];

// ===== Math Helpers =====

// Log-Gamma (Stirling approximation for large values, exact for small)
function lnGamma(z: number): number {
    if (z <= 0) return Infinity;
    if (z < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    }
    z -= 1;
    const g = 7;
    const c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function gammaFunc(z: number): number {
    return Math.exp(lnGamma(z));
}

// Combination C(n, k)
function combination(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    return Math.exp(lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1));
}

// Normal PDF
function normalPDF(x: number, mu: number, sigma: number): number {
    return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2));
}

// Normal CDF (approximation)
function normalCDF(x: number, mu: number, sigma: number): number {
    const z = (x - mu) / (sigma * Math.SQRT2);
    const t = 1 / (1 + 0.3275911 * Math.abs(z));
    const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
    const poly = t * (a[0] + t * (a[1] + t * (a[2] + t * (a[3] + t * a[4]))));
    const erf = 1 - poly * Math.exp(-z * z);
    return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

// Exponential PDF
function exponentialPDF(x: number, lambda: number): number {
    if (x < 0) return 0;
    return lambda * Math.exp(-lambda * x);
}

// Poisson PMF
function poissonPMF(k: number, lambda: number): number {
    if (k < 0 || !Number.isInteger(k)) return 0;
    return Math.exp(k * Math.log(lambda) - lambda - lnGamma(k + 1));
}

// Binomial PMF
function binomialPMF(k: number, n: number, p: number): number {
    if (k < 0 || k > n || !Number.isInteger(k)) return 0;
    return combination(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

// Geometric PMF (number of failures before first success)
function geometricPMF(k: number, p: number): number {
    if (k < 0 || !Number.isInteger(k)) return 0;
    return Math.pow(1 - p, k) * p;
}

// Hypergeometric PMF
function hypergeometricPMF(k: number, N: number, K: number, n: number): number {
    if (k < Math.max(0, n + K - N) || k > Math.min(K, n)) return 0;
    return (combination(K, k) * combination(N - K, n - k)) / combination(N, n);
}

// Log-Normal PDF
function lognormalPDF(x: number, mu: number, sigma: number): number {
    if (x <= 0) return 0;
    return (1 / (x * sigma * Math.sqrt(2 * Math.PI))) *
        Math.exp(-((Math.log(x) - mu) ** 2) / (2 * sigma ** 2));
}

// Gamma PDF
function gammaPDF(x: number, alpha: number, beta: number): number {
    if (x <= 0) return 0;
    return (Math.pow(beta, alpha) / gammaFunc(alpha)) *
        Math.pow(x, alpha - 1) * Math.exp(-beta * x);
}

// Beta PDF
function betaPDF(x: number, alpha: number, beta: number): number {
    if (x <= 0 || x >= 1) return 0;
    const B = gammaFunc(alpha) * gammaFunc(beta) / gammaFunc(alpha + beta);
    return Math.pow(x, alpha - 1) * Math.pow(1 - x, beta - 1) / B;
}

// ===== Component =====
interface DistributionSimulatorProps {
    onBack: () => void;
}

export const DistributionSimulator: React.FC<DistributionSimulatorProps> = ({ onBack }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [distributionType, setDistributionType] = useState<DistributionType>('normal');

    // Normal
    const [mu, setMu] = useState(0);
    const [sigma, setSigma] = useState(1);
    // Exponential
    const [expLambda, setExpLambda] = useState(1);
    // Poisson
    const [poissonLambda, setPoissonLambda] = useState(3);
    // Binomial
    const [binN, setBinN] = useState(20);
    const [binP, setBinP] = useState(0.5);
    // Geometric
    const [geoP, setGeoP] = useState(0.3);
    // Hypergeometric
    const [hypN, setHypN] = useState(50);
    const [hypK, setHypK] = useState(20);
    const [hypn, setHypn] = useState(10);
    // Multinomial
    const [multiN, setMultiN] = useState(30);
    const [multiP1, setMultiP1] = useState(0.2);
    const [multiP2, setMultiP2] = useState(0.3);
    const [multiP3, setMultiP3] = useState(0.5);
    // Log-Normal
    const [lnMu, setLnMu] = useState(0);
    const [lnSigma, setLnSigma] = useState(0.5);
    // Gamma
    const [gammaAlpha, setGammaAlpha] = useState(2);
    const [gammaBeta, setGammaBeta] = useState(1);
    // Beta
    const [betaAlpha, setBetaAlpha] = useState(2);
    const [betaBeta, setBetaBeta] = useState(5);

    // Highlight
    const [showHighlight, setShowHighlight] = useState(true);
    const [highlightFrom, setHighlightFrom] = useState(-1);
    const [highlightTo, setHighlightTo] = useState(1);

    const currentDist = DISTRIBUTIONS.find(d => d.value === distributionType)!;

    // Get stats for current distribution
    const getStats = useCallback(() => {
        switch (distributionType) {
            case 'normal':
                return { mean: mu, variance: sigma ** 2, stddev: sigma, skewness: 0, kurtosis: 3 };
            case 'exponential':
                return { mean: 1 / expLambda, variance: 1 / expLambda ** 2, stddev: 1 / expLambda, skewness: 2, kurtosis: 9 };
            case 'poisson':
                return { mean: poissonLambda, variance: poissonLambda, stddev: Math.sqrt(poissonLambda), skewness: 1 / Math.sqrt(poissonLambda), kurtosis: 3 + 1 / poissonLambda };
            case 'binomial':
                return { mean: binN * binP, variance: binN * binP * (1 - binP), stddev: Math.sqrt(binN * binP * (1 - binP)), skewness: (1 - 2 * binP) / Math.sqrt(binN * binP * (1 - binP)), kurtosis: 3 + (1 - 6 * binP * (1 - binP)) / (binN * binP * (1 - binP)) };
            case 'geometric':
                return { mean: (1 - geoP) / geoP, variance: (1 - geoP) / geoP ** 2, stddev: Math.sqrt((1 - geoP)) / geoP, skewness: (2 - geoP) / Math.sqrt(1 - geoP), kurtosis: 9 + geoP ** 2 / (1 - geoP) };
            case 'hypergeometric': {
                const m = hypK, nn = hypn, NN = hypN;
                const mean = nn * m / NN;
                const v = nn * m * (NN - m) * (NN - nn) / (NN ** 2 * (NN - 1));
                return { mean, variance: v, stddev: Math.sqrt(v), skewness: 0, kurtosis: 3 };
            }
            case 'multinomial':
                return { mean: multiN * multiP1, variance: multiN * multiP1 * (1 - multiP1), stddev: Math.sqrt(multiN * multiP1 * (1 - multiP1)), skewness: 0, kurtosis: 3 };
            case 'lognormal': {
                const mean = Math.exp(lnMu + lnSigma ** 2 / 2);
                const v = (Math.exp(lnSigma ** 2) - 1) * Math.exp(2 * lnMu + lnSigma ** 2);
                return { mean, variance: v, stddev: Math.sqrt(v), skewness: (Math.exp(lnSigma ** 2) + 2) * Math.sqrt(Math.exp(lnSigma ** 2) - 1), kurtosis: Math.exp(4 * lnSigma ** 2) + 2 * Math.exp(3 * lnSigma ** 2) + 3 * Math.exp(2 * lnSigma ** 2) - 3 };
            }
            case 'gamma': {
                const mean = gammaAlpha / gammaBeta;
                const v = gammaAlpha / gammaBeta ** 2;
                return { mean, variance: v, stddev: Math.sqrt(v), skewness: 2 / Math.sqrt(gammaAlpha), kurtosis: 3 + 6 / gammaAlpha };
            }
            case 'beta': {
                const a = betaAlpha, b = betaBeta;
                const mean = a / (a + b);
                const v = (a * b) / ((a + b) ** 2 * (a + b + 1));
                return { mean, variance: v, stddev: Math.sqrt(v), skewness: 2 * (b - a) * Math.sqrt(a + b + 1) / ((a + b + 2) * Math.sqrt(a * b)), kurtosis: 3 + 6 * (a ** 3 - a ** 2 * (2 * b - 1) + b ** 2 * (b + 1) - 2 * a * b * (b + 2)) / (a * b * (a + b + 2) * (a + b + 3)) };
            }
        }
    }, [distributionType, mu, sigma, expLambda, poissonLambda, binN, binP, geoP, hypN, hypK, hypn, multiN, multiP1, lnMu, lnSigma, gammaAlpha, gammaBeta, betaAlpha, betaBeta]);

    // Get highlight probability (simple for continuous, sum for discrete)
    const getHighlightProbability = useCallback((): number => {
        if (!showHighlight) return 0;
        switch (distributionType) {
            case 'normal':
                return normalCDF(highlightTo, mu, sigma) - normalCDF(highlightFrom, mu, sigma);
            case 'exponential': {
                const cdfFrom = highlightFrom < 0 ? 0 : 1 - Math.exp(-expLambda * highlightFrom);
                const cdfTo = highlightTo < 0 ? 0 : 1 - Math.exp(-expLambda * highlightTo);
                return cdfTo - cdfFrom;
            }
            case 'poisson': {
                let sum = 0;
                for (let k = Math.max(0, Math.ceil(highlightFrom)); k <= Math.floor(highlightTo); k++) sum += poissonPMF(k, poissonLambda);
                return sum;
            }
            case 'binomial': {
                let sum = 0;
                for (let k = Math.max(0, Math.ceil(highlightFrom)); k <= Math.min(binN, Math.floor(highlightTo)); k++) sum += binomialPMF(k, binN, binP);
                return sum;
            }
            case 'geometric': {
                let sum = 0;
                for (let k = Math.max(0, Math.ceil(highlightFrom)); k <= Math.floor(highlightTo) && k < 100; k++) sum += geometricPMF(k, geoP);
                return sum;
            }
            case 'hypergeometric': {
                let sum = 0;
                for (let k = Math.max(0, Math.ceil(highlightFrom)); k <= Math.min(hypn, Math.floor(highlightTo)); k++) sum += hypergeometricPMF(k, hypN, hypK, hypn);
                return sum;
            }
            default:
                return 0;
        }
    }, [distributionType, showHighlight, highlightFrom, highlightTo, mu, sigma, expLambda, poissonLambda, binN, binP, geoP, hypN, hypK, hypn]);

    // Canvas drawing
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

        const margin = { top: 20, right: 30, bottom: 50, left: 60 };
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;

        // Special handling for multinomial
        if (distributionType === 'multinomial') {
            drawMultinomialChart(ctx, width, height, margin, chartWidth, chartHeight);
            return;
        }

        const isDiscrete = currentDist.discrete;

        // Determine x range and compute values
        let xMin: number, xMax: number;
        let points: { x: number; y: number }[] = [];
        let yMax = 0;

        if (isDiscrete) {
            // Discrete distributions
            switch (distributionType) {
                case 'poisson':
                    xMin = 0; xMax = Math.max(20, Math.ceil(poissonLambda + 4 * Math.sqrt(poissonLambda)));
                    for (let k = xMin; k <= xMax; k++) { const y = poissonPMF(k, poissonLambda); points.push({ x: k, y }); if (y > yMax) yMax = y; }
                    break;
                case 'binomial':
                    xMin = 0; xMax = binN;
                    for (let k = 0; k <= binN; k++) { const y = binomialPMF(k, binN, binP); points.push({ x: k, y }); if (y > yMax) yMax = y; }
                    break;
                case 'geometric':
                    xMin = 0; xMax = Math.min(Math.ceil(5 / geoP), 50);
                    for (let k = 0; k <= xMax; k++) { const y = geometricPMF(k, geoP); points.push({ x: k, y }); if (y > yMax) yMax = y; }
                    break;
                case 'hypergeometric':
                    xMin = Math.max(0, hypn + hypK - hypN); xMax = Math.min(hypK, hypn);
                    for (let k = xMin; k <= xMax; k++) { const y = hypergeometricPMF(k, hypN, hypK, hypn); points.push({ x: k, y }); if (y > yMax) yMax = y; }
                    break;
                default:
                    xMin = 0; xMax = 10;
            }
        } else {
            // Continuous distributions
            switch (distributionType) {
                case 'normal':
                    xMin = mu - 4 * sigma; xMax = mu + 4 * sigma;
                    break;
                case 'exponential':
                    xMin = 0; xMax = Math.max(5, 5 / expLambda);
                    break;
                case 'lognormal':
                    xMin = 0; xMax = Math.exp(lnMu + 3 * lnSigma) + 1;
                    break;
                case 'gamma':
                    xMin = 0; xMax = Math.max(10, (gammaAlpha + 3 * Math.sqrt(gammaAlpha)) / gammaBeta);
                    break;
                case 'beta':
                    xMin = 0; xMax = 1;
                    break;
                default:
                    xMin = -5; xMax = 5;
            }

            const numPts = 300;
            for (let i = 0; i <= numPts; i++) {
                const x = xMin + (i / numPts) * (xMax - xMin);
                let y = 0;
                switch (distributionType) {
                    case 'normal': y = normalPDF(x, mu, sigma); break;
                    case 'exponential': y = exponentialPDF(x, expLambda); break;
                    case 'lognormal': y = lognormalPDF(x, lnMu, lnSigma); break;
                    case 'gamma': y = gammaPDF(x, gammaAlpha, gammaBeta); break;
                    case 'beta': y = betaPDF(x, betaAlpha, betaBeta); break;
                }
                if (isFinite(y)) { points.push({ x, y }); if (y > yMax) yMax = y; }
            }
        }

        yMax *= 1.15;
        if (yMax === 0) yMax = 1;

        const toCanvasX = (x: number) => margin.left + ((x - xMin) / (xMax - xMin)) * chartWidth;
        const toCanvasY = (y: number) => margin.top + chartHeight - (y / yMax) * chartHeight;

        ctx.clearRect(0, 0, width, height);

        // Grid
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        ctx.lineWidth = 1;
        const yTicks = 5;
        for (let i = 0; i <= yTicks; i++) {
            const cy = toCanvasY((i / yTicks) * yMax);
            ctx.beginPath(); ctx.moveTo(margin.left, cy); ctx.lineTo(width - margin.right, cy); ctx.stroke();
        }

        const isDark = document.body.classList.contains('dark-mode');

        if (isDiscrete) {
            // Draw bars for discrete
            const barWidth = Math.max(2, Math.min(30, chartWidth / (points.length + 1) * 0.7));

            // Highlighted bars
            if (showHighlight) {
                points.forEach(pt => {
                    if (pt.x >= highlightFrom && pt.x <= highlightTo) {
                        const cx = toCanvasX(pt.x);
                        const barH = (pt.y / yMax) * chartHeight;
                        ctx.fillStyle = 'rgba(99, 102, 241, 0.25)';
                        ctx.fillRect(cx - barWidth / 2, toCanvasY(pt.y), barWidth, barH);
                    }
                });
            }

            // Bars
            points.forEach(pt => {
                const cx = toCanvasX(pt.x);
                const barH = (pt.y / yMax) * chartHeight;
                const gradient = ctx.createLinearGradient(cx, toCanvasY(pt.y), cx, margin.top + chartHeight);
                gradient.addColorStop(0, '#6366f1');
                gradient.addColorStop(1, '#818cf8');
                ctx.fillStyle = gradient;
                ctx.fillRect(cx - barWidth / 2, toCanvasY(pt.y), barWidth, barH);
                ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
                ctx.lineWidth = 1;
                ctx.strokeRect(cx - barWidth / 2, toCanvasY(pt.y), barWidth, barH);
            });
        } else {
            // Draw continuous curve
            // Highlight fill
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
                    let y = 0;
                    switch (distributionType) {
                        case 'normal': y = normalPDF(x, mu, sigma); break;
                        case 'exponential': y = exponentialPDF(x, expLambda); break;
                        case 'lognormal': y = lognormalPDF(x, lnMu, lnSigma); break;
                        case 'gamma': y = gammaPDF(x, gammaAlpha, gammaBeta); break;
                        case 'beta': y = betaPDF(x, betaAlpha, betaBeta); break;
                    }
                    ctx.lineTo(toCanvasX(x), toCanvasY(isFinite(y) ? y : 0));
                }
                ctx.lineTo(toCanvasX(hlTo), toCanvasY(0));
                ctx.closePath();
                ctx.fillStyle = gradient;
                ctx.fill();
            }

            // Curve
            const curveGrad = ctx.createLinearGradient(margin.left, 0, width - margin.right, 0);
            curveGrad.addColorStop(0, '#818cf8');
            curveGrad.addColorStop(0.5, '#6366f1');
            curveGrad.addColorStop(1, '#818cf8');
            ctx.beginPath();
            let started = false;
            for (const pt of points) {
                const cx = toCanvasX(pt.x);
                const cy = toCanvasY(pt.y);
                if (!started) { ctx.moveTo(cx, cy); started = true; } else ctx.lineTo(cx, cy);
            }
            ctx.strokeStyle = curveGrad;
            ctx.lineWidth = 3;
            ctx.stroke();

            // Fill under
            if (points.length > 0) {
                ctx.lineTo(toCanvasX(points[points.length - 1].x), toCanvasY(0));
                ctx.lineTo(toCanvasX(points[0].x), toCanvasY(0));
                ctx.closePath();
                const fillGrad = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartHeight);
                fillGrad.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
                fillGrad.addColorStop(1, 'rgba(99, 102, 241, 0.02)');
                ctx.fillStyle = fillGrad;
                ctx.fill();
            }
        }

        // Axes
        ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(margin.left, margin.top + chartHeight); ctx.lineTo(width - margin.right, margin.top + chartHeight); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(margin.left, margin.top); ctx.lineTo(margin.left, margin.top + chartHeight); ctx.stroke();

        // Labels
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.font = '11px Inter, system-ui, sans-serif';

        // X labels
        ctx.textAlign = 'center';
        if (isDiscrete) {
            const step = points.length > 30 ? Math.ceil(points.length / 15) : 1;
            points.forEach((pt, i) => { if (i % step === 0) ctx.fillText(String(pt.x), toCanvasX(pt.x), margin.top + chartHeight + 18); });
        } else {
            const xRange = xMax - xMin;
            const xStep = xRange <= 2 ? 0.2 : xRange <= 5 ? 0.5 : xRange <= 15 ? 1 : xRange <= 30 ? 5 : 10;
            for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
                ctx.fillText(x.toFixed(xStep < 1 ? 1 : 0), toCanvasX(x), margin.top + chartHeight + 18);
            }
        }

        // Y labels
        ctx.textAlign = 'right';
        for (let i = 0; i <= yTicks; i++) {
            const yVal = (i / yTicks) * yMax;
            ctx.fillText(yVal.toFixed(yVal >= 1 ? 1 : 3), margin.left - 8, toCanvasY(yVal) + 4);
        }

        // Axis titles
        ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isDiscrete ? 'k' : 'x', width / 2, height - 5);
        ctx.save();
        ctx.translate(14, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(isDiscrete ? 'P(X=k)' : 'f(x)', 0, 0);
        ctx.restore();

        // Mean line
        const stats = getStats();
        if (stats && isFinite(stats.mean) && stats.mean >= xMin && stats.mean <= xMax) {
            const meanCX = toCanvasX(stats.mean);
            ctx.beginPath();
            ctx.moveTo(meanCX, margin.top);
            ctx.lineTo(meanCX, margin.top + chartHeight);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
            ctx.font = '10px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`μ=${stats.mean.toFixed(2)}`, meanCX, margin.top - 5);
        }
    }, [distributionType, mu, sigma, expLambda, poissonLambda, binN, binP, geoP, hypN, hypK, hypn, lnMu, lnSigma, gammaAlpha, gammaBeta, betaAlpha, betaBeta, showHighlight, highlightFrom, highlightTo, currentDist.discrete, getStats, multiN, multiP1, multiP2, multiP3]);

    // Special chart for multinomial
    const drawMultinomialChart = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, margin: { top: number; right: number; bottom: number; left: number }, chartWidth: number, chartHeight: number) => {
        const isDark = document.body.classList.contains('dark-mode');
        const categories = [
            { label: 'Cat 1', p: multiP1, color: '#6366f1' },
            { label: 'Cat 2', p: multiP2, color: '#8b5cf6' },
            { label: 'Cat 3', p: multiP3, color: '#a78bfa' },
        ];
        const expectedCounts = categories.map(c => ({ ...c, expected: multiN * c.p }));
        const yMax = Math.max(...expectedCounts.map(c => c.expected)) * 1.3;

        ctx.clearRect(0, 0, width, height);

        // Grid
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        ctx.lineWidth = 1;
        const toCanvasY = (y: number) => margin.top + chartHeight - (y / yMax) * chartHeight;
        for (let i = 0; i <= 5; i++) {
            const cy = toCanvasY((i / 5) * yMax);
            ctx.beginPath(); ctx.moveTo(margin.left, cy); ctx.lineTo(width - margin.right, cy); ctx.stroke();
        }

        // Bars
        const barWidth = chartWidth / (categories.length * 2 + 1);
        expectedCounts.forEach((c, i) => {
            const cx = margin.left + (2 * i + 1.5) * barWidth;
            const barH = (c.expected / yMax) * chartHeight;
            const grad = ctx.createLinearGradient(cx, toCanvasY(c.expected), cx, margin.top + chartHeight);
            grad.addColorStop(0, c.color);
            grad.addColorStop(1, c.color + '88');
            ctx.fillStyle = grad;
            ctx.fillRect(cx - barWidth / 2, toCanvasY(c.expected), barWidth, barH);
            // Label
            ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
            ctx.font = 'bold 13px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(c.expected.toFixed(1), cx, toCanvasY(c.expected) - 8);
            ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
            ctx.font = '11px Inter, system-ui, sans-serif';
            ctx.fillText(`${c.label} (p=${c.p.toFixed(2)})`, cx, margin.top + chartHeight + 20);
        });

        // Axes
        ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(margin.left, margin.top + chartHeight); ctx.lineTo(width - margin.right, margin.top + chartHeight); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(margin.left, margin.top); ctx.lineTo(margin.left, margin.top + chartHeight); ctx.stroke();

        // Y labels
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const yVal = (i / 5) * yMax;
            ctx.fillText(yVal.toFixed(1), margin.left - 8, toCanvasY(yVal) + 4);
        }

        ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.save();
        ctx.translate(14, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('期待回数 E[Xᵢ]', 0, 0);
        ctx.restore();
    }, [multiN, multiP1, multiP2, multiP3]);

    useEffect(() => { drawChart(); }, [drawChart]);
    useEffect(() => {
        const handleResize = () => drawChart();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawChart]);

    // Reset highlight when distribution changes
    useEffect(() => {
        const stats = getStats();
        if (stats) {
            setHighlightFrom(stats.mean - stats.stddev);
            setHighlightTo(stats.mean + stats.stddev);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [distributionType]);

    const stats = getStats();
    const highlightProb = getHighlightProbability();

    // Get x-range for highlight sliders
    const getXRange = (): { min: number; max: number; step: number } => {
        switch (distributionType) {
            case 'normal': return { min: mu - 4 * sigma, max: mu + 4 * sigma, step: 0.1 };
            case 'exponential': return { min: 0, max: Math.max(5, 5 / expLambda), step: 0.1 };
            case 'poisson': return { min: 0, max: Math.max(20, poissonLambda * 3), step: 1 };
            case 'binomial': return { min: 0, max: binN, step: 1 };
            case 'geometric': return { min: 0, max: Math.min(Math.ceil(5 / geoP), 50), step: 1 };
            case 'hypergeometric': return { min: Math.max(0, hypn + hypK - hypN), max: Math.min(hypK, hypn), step: 1 };
            case 'lognormal': return { min: 0, max: Math.exp(lnMu + 3 * lnSigma) + 1, step: 0.1 };
            case 'gamma': return { min: 0, max: Math.max(10, (gammaAlpha + 3 * Math.sqrt(gammaAlpha)) / gammaBeta), step: 0.1 };
            case 'beta': return { min: 0, max: 1, step: 0.01 };
            default: return { min: -5, max: 5, step: 0.1 };
        }
    };

    const xRange = getXRange();
    const showHighlightControls = distributionType !== 'multinomial';

    // Render parameter controls based on distribution type
    const renderParams = () => {
        switch (distributionType) {
            case 'normal':
                return (<>
                    {renderSlider('平均 (μ)', mu, setMu, -5, 5, 0.1)}
                    {renderSlider('標準偏差 (σ)', sigma, setSigma, 0.1, 5, 0.1)}
                </>);
            case 'exponential':
                return renderSlider('到着率 (λ)', expLambda, setExpLambda, 0.1, 5, 0.1);
            case 'poisson':
                return renderSlider('平均到着率 (λ)', poissonLambda, setPoissonLambda, 0.1, 20, 0.1);
            case 'binomial':
                return (<>
                    {renderSlider('試行回数 (n)', binN, setBinN, 1, 50, 1)}
                    {renderSlider('成功確率 (p)', binP, setBinP, 0.01, 0.99, 0.01)}
                </>);
            case 'geometric':
                return renderSlider('成功確率 (p)', geoP, setGeoP, 0.01, 0.99, 0.01);
            case 'hypergeometric':
                return (<>
                    {renderSlider('母集団サイズ (N)', hypN, setHypN, 10, 100, 1)}
                    {renderSlider('当たりの数 (K)', hypK, setHypK, 1, Math.min(hypN, 50), 1)}
                    {renderSlider('抽出数 (n)', hypn, setHypn, 1, Math.min(hypN, 30), 1)}
                </>);
            case 'multinomial':
                return (<>
                    {renderSlider('試行回数 (n)', multiN, setMultiN, 1, 100, 1)}
                    {renderSlider('カテゴリ1確率 (p₁)', multiP1, (v) => { setMultiP1(v); setMultiP3(Math.max(0, +(1 - v - multiP2).toFixed(2))); }, 0, +(1 - multiP2).toFixed(2), 0.01)}
                    {renderSlider('カテゴリ2確率 (p₂)', multiP2, (v) => { setMultiP2(v); setMultiP3(Math.max(0, +(1 - multiP1 - v).toFixed(2))); }, 0, +(1 - multiP1).toFixed(2), 0.01)}
                    <div className="dist-sim-slider-group">
                        <div className="dist-sim-slider-header">
                            <label>カテゴリ3確率 (p₃)</label>
                            <span className="dist-sim-slider-value">{multiP3.toFixed(2)}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>= 1 - p₁ - p₂ (自動計算)</div>
                    </div>
                </>);
            case 'lognormal':
                return (<>
                    {renderSlider('対数平均 (μ)', lnMu, setLnMu, -2, 3, 0.1)}
                    {renderSlider('対数標準偏差 (σ)', lnSigma, setLnSigma, 0.1, 2, 0.1)}
                </>);
            case 'gamma':
                return (<>
                    {renderSlider('形状母数 (α)', gammaAlpha, setGammaAlpha, 0.5, 10, 0.1)}
                    {renderSlider('率母数 (β)', gammaBeta, setGammaBeta, 0.1, 5, 0.1)}
                </>);
            case 'beta':
                return (<>
                    {renderSlider('α', betaAlpha, setBetaAlpha, 0.1, 10, 0.1)}
                    {renderSlider('β', betaBeta, setBetaBeta, 0.1, 10, 0.1)}
                </>);
        }
    };

    const renderSlider = (label: string, value: number, setter: (v: number) => void, min: number, max: number, step: number) => (
        <div className="dist-sim-slider-group">
            <div className="dist-sim-slider-header">
                <label>{label}</label>
                <span className="dist-sim-slider-value">{value.toFixed(step < 0.1 ? 2 : 1)}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={value} onChange={e => setter(Number(e.target.value))} className="dist-sim-slider" />
            <div className="dist-sim-slider-range"><span>{min}</span><span>{((min + max) / 2).toFixed(step < 0.1 ? 2 : 1)}</span><span>{max}</span></div>
        </div>
    );

    return (
        <div className="dist-sim-container">
            <div className="dist-sim-header">
                <button className="menu-btn" onClick={onBack}><ArrowLeft size={20} /></button>
                <h1>分布シミュレーション</h1>
            </div>

            <div className="dist-sim-selector">
                <label className="dist-sim-label">分布タイプ</label>
                <select className="dist-sim-select" value={distributionType} onChange={e => setDistributionType(e.target.value as DistributionType)}>
                    {DISTRIBUTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
            </div>

            {/* KaTeX Formula Display */}
            <div className="dist-sim-formula-display">
                <MarkdownText content={currentDist.latex} />
            </div>

            <div className="dist-sim-chart-card">
                <div className="dist-sim-chart-container" ref={containerRef}>
                    <canvas ref={canvasRef} />
                </div>
            </div>

            <div className="dist-sim-controls">
                <div className="dist-sim-controls-grid">
                    <div className="dist-sim-param-card">
                        <h3>パラメータ</h3>
                        {renderParams()}
                    </div>

                    {showHighlightControls && (
                        <div className="dist-sim-param-card">
                            <h3>
                                確率範囲
                                <label className="dist-sim-toggle-label">
                                    <input type="checkbox" checked={showHighlight} onChange={e => setShowHighlight(e.target.checked)} />
                                    表示
                                </label>
                            </h3>
                            {showHighlight && (<>
                                <div className="dist-sim-slider-group">
                                    <div className="dist-sim-slider-header">
                                        <label>下限</label>
                                        <span className="dist-sim-slider-value">{highlightFrom.toFixed(xRange.step < 0.1 ? 2 : 1)}</span>
                                    </div>
                                    <input type="range" min={xRange.min} max={xRange.max} step={xRange.step} value={highlightFrom} onChange={e => setHighlightFrom(Number(e.target.value))} className="dist-sim-slider highlight-slider" />
                                </div>
                                <div className="dist-sim-slider-group">
                                    <div className="dist-sim-slider-header">
                                        <label>上限</label>
                                        <span className="dist-sim-slider-value">{highlightTo.toFixed(xRange.step < 0.1 ? 2 : 1)}</span>
                                    </div>
                                    <input type="range" min={xRange.min} max={xRange.max} step={xRange.step} value={highlightTo} onChange={e => setHighlightTo(Number(e.target.value))} className="dist-sim-slider highlight-slider" />
                                </div>
                                <div className="dist-sim-probability">
                                    <span>P({highlightFrom.toFixed(xRange.step < 0.1 ? 2 : 1)} ≤ X ≤ {highlightTo.toFixed(xRange.step < 0.1 ? 2 : 1)})</span>
                                    <strong>{(highlightProb * 100).toFixed(2)}%</strong>
                                </div>
                            </>)}
                        </div>
                    )}
                </div>

                <div className="dist-sim-info-grid">
                    <div className="dist-sim-info-card">
                        <h3>統計量</h3>
                        <div className="dist-sim-stats-grid">
                            <div className="dist-sim-stat"><span className="stat-label">期待値 E[X]</span><span className="stat-value">{stats.mean.toFixed(3)}</span></div>
                            <div className="dist-sim-stat"><span className="stat-label">分散 V[X]</span><span className="stat-value">{stats.variance.toFixed(3)}</span></div>
                            <div className="dist-sim-stat"><span className="stat-label">標準偏差 σ</span><span className="stat-value">{stats.stddev.toFixed(3)}</span></div>
                            <div className="dist-sim-stat"><span className="stat-label">歪度</span><span className="stat-value">{stats.skewness.toFixed(3)}</span></div>
                            <div className="dist-sim-stat"><span className="stat-label">尖度</span><span className="stat-value">{stats.kurtosis.toFixed(3)}</span></div>
                        </div>
                    </div>

                    <div className="dist-sim-info-card">
                        <h3><Info size={16} /> 分布の説明</h3>
                        <p className="dist-sim-description">{currentDist.description}</p>
                        <div className="dist-sim-math-details">
                            <div className="dist-sim-math-row">
                                <span className="dist-sim-math-label">平均:</span>
                                <MarkdownText content={currentDist.meanLatex} />
                            </div>
                            <div className="dist-sim-math-row">
                                <span className="dist-sim-math-label">分散:</span>
                                <MarkdownText content={currentDist.varianceLatex} />
                            </div>
                            {currentDist.mgfLatex && (
                                <div className="dist-sim-math-row">
                                    <span className="dist-sim-math-label">積率母関数:</span>
                                    <MarkdownText content={currentDist.mgfLatex} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
