import React, { useMemo, useState } from 'react';
import { BookOpen, FileText, Sigma } from 'lucide-react';
import { BackButton } from './BackButton';

type DistributionTableKey = 'normal' | 't' | 'chi-square';

type TableRow = {
    label: string;
    values: string[];
};

type DistributionTableConfig = {
    key: DistributionTableKey;
    label: string;
    icon: React.ReactNode;
    description: string;
    note: string;
    rowLabel: string;
    columns: string[];
    rows: TableRow[];
};

const NORMAL_ROW_BASES = Array.from({ length: 40 }, (_, index) => index / 10);
const NORMAL_COLUMN_OFFSETS = Array.from({ length: 10 }, (_, index) => index / 100);
const T_TWO_SIDED_ALPHA_COLUMNS = [0.2, 0.1, 0.05, 0.02, 0.01];
const T_DF_ROWS = [...Array.from({ length: 30 }, (_, index) => index + 1), 40, 60, 120, Number.POSITIVE_INFINITY];
const CHI_SQUARE_UPPER_TAIL_COLUMNS = [0.995, 0.99, 0.975, 0.95, 0.9, 0.1, 0.05, 0.025, 0.01, 0.005];
const CHI_SQUARE_DF_ROWS = [...Array.from({ length: 30 }, (_, index) => index + 1), 40, 60, 120];

function lnGamma(z: number): number {
    if (z <= 0) return Number.POSITIVE_INFINITY;
    if (z < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    }

    const coefficients = [
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7,
    ];
    let x = coefficients[0];
    const g = 7;
    const shifted = z - 1;

    for (let index = 1; index < g + 2; index += 1) {
        x += coefficients[index] / (shifted + index);
    }

    const t = shifted + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x);
}

function regularizedBetaContinuedFraction(a: number, b: number, x: number): number {
    const maxIterations = 200;
    const epsilon = 3e-7;
    const fpMin = 1e-30;

    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < fpMin) d = fpMin;
    d = 1 / d;
    let h = d;

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
        const evenIndex = 2 * iteration;
        let aa = (iteration * (b - iteration) * x) / ((qam + evenIndex) * (a + evenIndex));
        d = 1 + aa * d;
        if (Math.abs(d) < fpMin) d = fpMin;
        c = 1 + aa / c;
        if (Math.abs(c) < fpMin) c = fpMin;
        d = 1 / d;
        h *= d * c;

        aa = (-(a + iteration) * (qab + iteration) * x) / ((a + evenIndex) * (qap + evenIndex));
        d = 1 + aa * d;
        if (Math.abs(d) < fpMin) d = fpMin;
        c = 1 + aa / c;
        if (Math.abs(c) < fpMin) c = fpMin;
        d = 1 / d;
        const delta = d * c;
        h *= delta;

        if (Math.abs(delta - 1) < epsilon) {
            break;
        }
    }

    return h;
}

function regularizedBeta(x: number, a: number, b: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    const front = Math.exp(
        lnGamma(a + b) -
        lnGamma(a) -
        lnGamma(b) +
        a * Math.log(x) +
        b * Math.log(1 - x)
    );

    if (x < (a + 1) / (a + b + 2)) {
        return (front * regularizedBetaContinuedFraction(a, b, x)) / a;
    }

    return 1 - (front * regularizedBetaContinuedFraction(b, a, 1 - x)) / b;
}

function regularizedGammaP(a: number, x: number): number {
    if (x <= 0) return 0;
    if (x < a + 1) {
        let ap = a;
        let sum = 1 / a;
        let delta = sum;

        for (let iteration = 1; iteration <= 200; iteration += 1) {
            ap += 1;
            delta *= x / ap;
            sum += delta;
            if (Math.abs(delta) < Math.abs(sum) * 1e-8) {
                break;
            }
        }

        return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }

    let b = x + 1 - a;
    let c = 1 / 1e-30;
    let d = 1 / Math.max(b, 1e-30);
    let h = d;

    for (let iteration = 1; iteration <= 200; iteration += 1) {
        const an = -iteration * (iteration - a);
        b += 2;
        d = an * d + b;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = b + an / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const delta = d * c;
        h *= delta;
        if (Math.abs(delta - 1) < 1e-8) {
            break;
        }
    }

    return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

function standardNormalCdf(value: number): number {
    const z = value / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * Math.abs(z));
    const coefficients = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
    const polynomial = t * (
        coefficients[0] +
        t * (
            coefficients[1] +
            t * (
                coefficients[2] +
                t * (coefficients[3] + t * coefficients[4])
            )
        )
    );
    const erf = 1 - polynomial * Math.exp(-z * z);
    return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

function studentTCdf(value: number, degreesOfFreedom: number): number {
    if (degreesOfFreedom <= 0) return Number.NaN;
    if (!Number.isFinite(degreesOfFreedom)) {
        return standardNormalCdf(value);
    }

    const x = degreesOfFreedom / (degreesOfFreedom + value * value);
    const ib = regularizedBeta(x, degreesOfFreedom / 2, 0.5);
    return value >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

function chiSquareCdf(value: number, degreesOfFreedom: number): number {
    if (value <= 0) return 0;
    return regularizedGammaP(degreesOfFreedom / 2, value / 2);
}

function inverseMonotoneCdf(
    targetProbability: number,
    cdf: (value: number) => number,
    low: number,
    high: number
): number {
    let min = low;
    let max = high;
    let maxValue = cdf(max);

    while (maxValue < targetProbability && max < 1_000_000) {
        max *= 2;
        maxValue = cdf(max);
    }

    for (let iteration = 0; iteration < 80; iteration += 1) {
        const mid = (min + max) / 2;
        const midValue = cdf(mid);
        if (midValue < targetProbability) {
            min = mid;
        } else {
            max = mid;
        }
    }

    return (min + max) / 2;
}

function inverseStandardNormal(probability: number): number {
    return inverseMonotoneCdf(probability, standardNormalCdf, -8, 8);
}

function inverseStudentT(probability: number, degreesOfFreedom: number): number {
    if (!Number.isFinite(degreesOfFreedom)) {
        return inverseStandardNormal(probability);
    }

    return inverseMonotoneCdf(
        probability,
        (value) => studentTCdf(value, degreesOfFreedom),
        0,
        1
    );
}

function inverseChiSquareUpperTail(upperTailProbability: number, degreesOfFreedom: number): number {
    return inverseMonotoneCdf(
        1 - upperTailProbability,
        (value) => chiSquareCdf(value, degreesOfFreedom),
        0,
        Math.max(1, degreesOfFreedom)
    );
}

function formatFixed(value: number, digits: number): string {
    return value.toFixed(digits);
}

function buildNormalTable(): DistributionTableConfig {
    return {
        key: 'normal',
        label: '正規分布表',
        icon: <Sigma size={16} />,
        description: '標準正規分布 Z ~ N(0, 1) の累積分布表です。',
        note: '表の値は Φ(z) = P(Z ≤ z) を表します。負の値は Φ(-z) = 1 - Φ(z) で確認できます。',
        rowLabel: 'z',
        columns: NORMAL_COLUMN_OFFSETS.map((offset) => offset.toFixed(2)),
        rows: NORMAL_ROW_BASES.map((base) => ({
            label: base.toFixed(1),
            values: NORMAL_COLUMN_OFFSETS.map((offset) => formatFixed(standardNormalCdf(base + offset), 4)),
        })),
    };
}

function buildTTable(): DistributionTableConfig {
    return {
        key: 't',
        label: 't分布表',
        icon: <BookOpen size={16} />,
        description: '両側検定で使う t 分布の臨界値表です。',
        note: '列の α は両側有意水準です。表の値は t_(1-α/2, ν) を表します。',
        rowLabel: '自由度 ν',
        columns: T_TWO_SIDED_ALPHA_COLUMNS.map((alpha) => alpha.toFixed(2)),
        rows: T_DF_ROWS.map((degreesOfFreedom) => ({
            label: Number.isFinite(degreesOfFreedom) ? String(degreesOfFreedom) : '∞',
            values: T_TWO_SIDED_ALPHA_COLUMNS.map((alpha) => formatFixed(
                inverseStudentT(1 - alpha / 2, degreesOfFreedom),
                3
            )),
        })),
    };
}

function buildChiSquareTable(): DistributionTableConfig {
    return {
        key: 'chi-square',
        label: 'カイ二乗分布表',
        icon: <FileText size={16} />,
        description: '右側確率で引くカイ二乗分布の臨界値表です。',
        note: '列の α は右側確率 P(X ≥ x) = α を表します。表の値は χ²_(α, ν) です。',
        rowLabel: '自由度 ν',
        columns: CHI_SQUARE_UPPER_TAIL_COLUMNS.map((alpha) => alpha.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')),
        rows: CHI_SQUARE_DF_ROWS.map((degreesOfFreedom) => ({
            label: String(degreesOfFreedom),
            values: CHI_SQUARE_UPPER_TAIL_COLUMNS.map((alpha) => formatFixed(
                inverseChiSquareUpperTail(alpha, degreesOfFreedom),
                3
            )),
        })),
    };
}

interface DistributionTablesProps {
    onBack: () => void;
}

export const DistributionTables: React.FC<DistributionTablesProps> = ({ onBack }) => {
    const [activeTableKey, setActiveTableKey] = useState<DistributionTableKey>('normal');
    const [selectedCell, setSelectedCell] = useState<{ rowIndex: number; columnIndex: number } | null>(null);
    const tables = useMemo<Record<DistributionTableKey, DistributionTableConfig>>(() => ({
        normal: buildNormalTable(),
        t: buildTTable(),
        'chi-square': buildChiSquareTable(),
    }), []);

    const activeTable = tables[activeTableKey];

    return (
        <div className="distribution-tables-page">
            <div className="distribution-tables-header">
                <BackButton className="nav-btn" onClick={onBack} />
                <div>
                    <h1 className="distribution-tables-title">統計分布表</h1>
                    <p className="distribution-tables-subtitle">
                        正規分布・t分布・カイ二乗分布の代表的な統計表を確認できます。
                    </p>
                </div>
            </div>

            <div className="distribution-tables-switch">
                {(Object.values(tables)).map((table) => (
                    <button
                        key={table.key}
                        type="button"
                        className={`distribution-tables-switch-btn ${activeTable.key === table.key ? 'active' : ''}`}
                        onClick={() => {
                            setActiveTableKey(table.key);
                            setSelectedCell(null);
                        }}
                    >
                        {table.icon}
                        <span>{table.label}</span>
                    </button>
                ))}
            </div>

            <section className="distribution-table-card">
                <div className="distribution-table-card-head">
                    <div>
                        <h2>{activeTable.label}</h2>
                        <p>{activeTable.description}</p>
                    </div>
                    <span className="distribution-table-badge">{activeTable.rowLabel}</span>
                </div>
                <p className="distribution-table-note">{activeTable.note}</p>

                <div className="distribution-table-wrapper">
                    <table className="distribution-data-table">
                        <thead>
                            <tr>
                                <th>{activeTable.rowLabel}</th>
                                {activeTable.columns.map((column, columnIndex) => (
                                    <th
                                        key={`${activeTable.key}-${column}`}
                                        className={selectedCell?.columnIndex === columnIndex ? 'is-selected-column' : ''}
                                    >
                                        {column}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {activeTable.rows.map((row, rowIndex) => (
                                <tr key={`${activeTable.key}-${row.label}`}>
                                    <th className={selectedCell?.rowIndex === rowIndex ? 'is-selected-row' : ''}>{row.label}</th>
                                    {row.values.map((value, columnIndex) => {
                                        const isSelectedRow = selectedCell?.rowIndex === rowIndex;
                                        const isSelectedColumn = selectedCell?.columnIndex === columnIndex;
                                        const isSelectedCell = isSelectedRow && isSelectedColumn;
                                        return (
                                            <td
                                                key={`${activeTable.key}-${row.label}-${activeTable.columns[columnIndex]}`}
                                                className={[
                                                    isSelectedRow ? 'is-selected-row' : '',
                                                    isSelectedColumn ? 'is-selected-column' : '',
                                                    isSelectedCell ? 'is-selected-cell' : '',
                                                ].filter(Boolean).join(' ')}
                                            >
                                                <button
                                                    type="button"
                                                    className="distribution-data-cell-btn"
                                                    onClick={() => setSelectedCell((previous) => (
                                                        previous?.rowIndex === rowIndex && previous?.columnIndex === columnIndex
                                                            ? null
                                                            : { rowIndex, columnIndex }
                                                    ))}
                                                    aria-pressed={isSelectedCell}
                                                >
                                                    {value}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};
