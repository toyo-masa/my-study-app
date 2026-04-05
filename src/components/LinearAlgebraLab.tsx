import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { BackButton } from './BackButton';
import {
    BASIS_E1,
    BASIS_E2,
    EPS,
    IDENTITY_MATRIX,
    MATRIX_PRESETS,
    applyMatrix,
    areMatricesCommutative,
    clampValue,
    describeLinearTransformation,
    determinant,
    formatScalar,
    formatVector,
    helperLinePoints,
    imageClassification,
    imageKernelExplanation,
    imageSamplePoints,
    inverseMatrix,
    kernelClassification,
    kernelDirection,
    matrixColumns,
    matrixToGrid,
    maxAbsDiff,
    multiplyMatrices,
    nullityOfMatrix,
    rankOfMatrix,
    roundToStep,
    unitCirclePoints,
    unitSquarePoints,
    vectorNorm,
    type Matrix2,
    type Vector2,
} from './linearAlgebraLabMath';

type LabTab = 'linear' | 'composition' | 'determinant' | 'image-kernel';
type MatrixEntryKey = keyof Matrix2;

type PlotBounds = {
    radius: number;
    gridLimit: number;
};

type VisualizationProps = {
    title: string;
    caption: string;
    sampleVector: Vector2;
    transformedSampleVector: Vector2;
    transformedBasis: [Vector2, Vector2];
    originalSquare: Vector2[];
    transformedSquare: Vector2[];
    originalCircle: Vector2[];
    transformedCircle: Vector2[];
    helperLine?: Vector2[];
    transformedHelperLine?: Vector2[];
    imagePoints?: Vector2[];
    kernelDirectionVector?: Vector2 | null;
    restoredVectors?: Array<{ label: string; vector: Vector2 }>;
    bounds?: PlotBounds;
    onSampleVectorChange?: (vector: Vector2) => void;
};

type LabelTone = 'original' | 'transformed' | 'restored';

type SliderFieldProps = {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
};

type MatrixEditorProps = {
    title: string;
    matrix: Matrix2;
    onChange: (next: Matrix2) => void;
    caption?: string;
};

type SummaryCardProps = {
    title: string;
    children: React.ReactNode;
};

const MATRIX_MIN = -3;
const MATRIX_MAX = 3;
const SAMPLE_VECTOR_MIN = -3;
const SAMPLE_VECTOR_MAX = 3;
const INPUT_STEP = 0.1;
const PLOT_SIZE = 520;
const PLOT_PADDING = 44;
const MIN_VIEW_RADIUS = 2.6;
const KERNEL_STATUS_DISTANCE = 0.6;
const PLOT_LABEL_HEIGHT = 32;
const TAB_ITEMS: Array<{ key: LabTab; label: string }> = [
    { key: 'linear', label: '線形変換' },
    { key: 'composition', label: '合成変換' },
    { key: 'determinant', label: '行列式・正則性' },
    { key: 'image-kernel', label: '像と核' },
];
const PLOT_LABEL_LATEX: Record<string, string> = {
    e1: String.raw`\mathbf{e}_1`,
    e2: String.raw`\mathbf{e}_2`,
    x: String.raw`\mathbf{x}`,
    Ae1: String.raw`A\mathbf{e}_1`,
    Ae2: String.raw`A\mathbf{e}_2`,
    Ax: String.raw`A\mathbf{x}`,
    'A⁻¹(Ax)': String.raw`A^{-1}(A\mathbf{x})`,
    'A⁻¹(Ae1)': String.raw`A^{-1}(A\mathbf{e}_1)`,
    'A⁻¹(Ae2)': String.raw`A^{-1}(A\mathbf{e}_2)`,
};
const CONTROL_LABEL_LATEX: Record<string, string> = {
    a11: String.raw`a_{11}`,
    a12: String.raw`a_{12}`,
    a21: String.raw`a_{21}`,
    a22: String.raw`a_{22}`,
    x: String.raw`x`,
    y: String.raw`y`,
};

const ZERO_VECTOR: Vector2 = { x: 0, y: 0 };

function buildPlotBounds(points: Vector2[]): PlotBounds {
    const maxAbs = points.reduce((currentMax, point) => {
        return Math.max(currentMax, Math.abs(point.x), Math.abs(point.y));
    }, 0);
    const radius = Math.max(MIN_VIEW_RADIUS, maxAbs * 1.18);
    return {
        radius,
        gridLimit: Math.max(2, Math.ceil(radius)),
    };
}

function toScreenPoint(vector: Vector2, bounds: PlotBounds) {
    const innerSize = PLOT_SIZE - PLOT_PADDING * 2;
    const center = PLOT_SIZE / 2;
    const scale = innerSize / (bounds.radius * 2);

    return {
        x: center + vector.x * scale,
        y: center - vector.y * scale,
    };
}

function toWorldPoint(clientX: number, clientY: number, rect: DOMRect, bounds: PlotBounds): Vector2 {
    const relativeX = clampValue((clientX - rect.left) / rect.width, 0, 1);
    const relativeY = clampValue((clientY - rect.top) / rect.height, 0, 1);
    return {
        x: (relativeX - 0.5) * bounds.radius * 2,
        y: (0.5 - relativeY) * bounds.radius * 2,
    };
}

function toPointList(points: Vector2[], bounds: PlotBounds): string {
    return points
        .map((point) => {
            const screen = toScreenPoint(point, bounds);
            return `${screen.x},${screen.y}`;
        })
        .join(' ');
}

function collectPlotPoints({
    sampleVector,
    transformedSampleVector,
    transformedBasis,
    originalSquare,
    transformedSquare,
    originalCircle,
    transformedCircle,
    helperLine,
    transformedHelperLine,
    imagePoints,
    kernelDirectionVector,
    restoredVectors,
}: Omit<VisualizationProps, 'title' | 'caption' | 'bounds' | 'onSampleVectorChange'>): Vector2[] {
    const points: Vector2[] = [
        ZERO_VECTOR,
        BASIS_E1,
        BASIS_E2,
        sampleVector,
        transformedSampleVector,
        ...transformedBasis,
        ...originalSquare,
        ...transformedSquare,
        ...originalCircle,
        ...transformedCircle,
    ];

    if (helperLine) {
        points.push(...helperLine);
    }
    if (transformedHelperLine) {
        points.push(...transformedHelperLine);
    }
    if (imagePoints) {
        points.push(...imagePoints);
    }
    if (restoredVectors) {
        points.push(...restoredVectors.map((item) => item.vector));
    }

    if (kernelDirectionVector) {
        const directionLength = 3.8;
        points.push(
            {
                x: kernelDirectionVector.x * directionLength,
                y: kernelDirectionVector.y * directionLength,
            },
            {
                x: -kernelDirectionVector.x * directionLength,
                y: -kernelDirectionVector.y * directionLength,
            },
        );
    }

    return points;
}

function normalizeInputValue(value: number, min: number, max: number) {
    return roundToStep(clampValue(value, min, max), INPUT_STEP);
}

function kernelStatusText(normValue: number): string {
    if (normValue <= EPS * 10) {
        return '核上にあります';
    }
    if (normValue <= 0.2) {
        return '核にかなり近いです';
    }
    if (normValue <= KERNEL_STATUS_DISTANCE) {
        return '核に少し近いです';
    }
    return 'まだ核から離れています';
}

function estimatePlotLabelWidth(label: string): number {
    return Math.max(58, label.length * 16 + 28);
}

function renderPlotLabelHtml(label: string): string {
    return katex.renderToString(PLOT_LABEL_LATEX[label] ?? String.raw`\mathrm{${label}}`, {
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
    });
}

function renderControlLabelHtml(label: string): string {
    return katex.renderToString(CONTROL_LABEL_LATEX[label] ?? String.raw`\mathrm{${label}}`, {
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
    });
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, children }) => {
    return (
        <section className="linear-algebra-lab-card linear-algebra-lab-summary-card">
            <h3 className="linear-algebra-lab-card-title">{title}</h3>
            <div className="linear-algebra-lab-summary-card-body">{children}</div>
        </section>
    );
};

const MatrixDisplay: React.FC<{ matrix: Matrix2; label?: string }> = ({ matrix, label }) => {
    const rows = matrixToGrid(matrix);
    return (
        <div className="linear-algebra-lab-matrix-block">
            {label ? <span className="linear-algebra-lab-matrix-label">{label}</span> : null}
            <div className="linear-algebra-lab-matrix-display" aria-label={label ?? '行列'}>
                {rows.flat().map((value, index) => (
                    <span key={`${label ?? 'matrix'}-${index}`} className="linear-algebra-lab-matrix-cell">
                        {formatScalar(value)}
                    </span>
                ))}
            </div>
        </div>
    );
};

const SliderField: React.FC<SliderFieldProps> = ({
    label,
    value,
    onChange,
    min = MATRIX_MIN,
    max = MATRIX_MAX,
    step = INPUT_STEP,
}) => {
    return (
        <label className="linear-algebra-lab-field">
            <div className="linear-algebra-lab-field-head">
                <span
                    className="linear-algebra-lab-field-symbol"
                    aria-label={label}
                    dangerouslySetInnerHTML={{ __html: renderControlLabelHtml(label) }}
                />
                <span className="linear-algebra-lab-field-value">{formatScalar(value, 1)}</span>
            </div>
            <div className="linear-algebra-lab-field-input-row">
                <input
                    className="linear-algebra-lab-number-input"
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={Number(value.toFixed(1))}
                    onChange={(event) => onChange(normalizeInputValue(Number(event.target.value), min, max))}
                />
                <input
                    className="linear-algebra-lab-range-input"
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(event) => onChange(Number(event.target.value))}
                />
            </div>
        </label>
    );
};

const MatrixEditor: React.FC<MatrixEditorProps> = ({ title, matrix, onChange, caption }) => {
    const updateEntry = useCallback((key: MatrixEntryKey, value: number) => {
        onChange({
            ...matrix,
            [key]: normalizeInputValue(value, MATRIX_MIN, MATRIX_MAX),
        });
    }, [matrix, onChange]);

    return (
        <section className="linear-algebra-lab-card linear-algebra-lab-editor-card">
            <div className="linear-algebra-lab-card-head">
                <div>
                    <h3 className="linear-algebra-lab-card-title">{title}</h3>
                    {caption ? <p className="linear-algebra-lab-card-caption">{caption}</p> : null}
                </div>
                <MatrixDisplay matrix={matrix} label={title} />
            </div>

            <div className="linear-algebra-lab-editor-grid">
                <SliderField label="a11" value={matrix.a11} onChange={(value) => updateEntry('a11', value)} />
                <SliderField label="a12" value={matrix.a12} onChange={(value) => updateEntry('a12', value)} />
                <SliderField label="a21" value={matrix.a21} onChange={(value) => updateEntry('a21', value)} />
                <SliderField label="a22" value={matrix.a22} onChange={(value) => updateEntry('a22', value)} />
            </div>

            <div className="linear-algebra-lab-preset-grid">
                {MATRIX_PRESETS.map((preset) => {
                    const isActive = maxAbsDiff(matrix, preset.matrix) <= EPS;
                    return (
                        <button
                            key={preset.id}
                            type="button"
                            className={`linear-algebra-lab-preset-btn ${isActive ? 'is-active' : ''}`}
                            onClick={() => onChange(preset.matrix)}
                        >
                            {preset.label}
                        </button>
                    );
                })}
            </div>
        </section>
    );
};

const VectorEditor: React.FC<{
    vector: Vector2;
    onChange: (vector: Vector2) => void;
}> = ({ vector, onChange }) => {
    return (
        <section className="linear-algebra-lab-card linear-algebra-lab-editor-card">
            <div className="linear-algebra-lab-card-head">
                <div>
                    <h3 className="linear-algebra-lab-card-title">サンプルベクトル x</h3>
                    <p className="linear-algebra-lab-card-caption">ドラッグが難しい環境でも、ここから必ず操作できます。</p>
                </div>
                <div className="linear-algebra-lab-vector-badge">{formatVector(vector, 1)}</div>
            </div>

            <div className="linear-algebra-lab-editor-grid">
                <SliderField
                    label="x"
                    min={SAMPLE_VECTOR_MIN}
                    max={SAMPLE_VECTOR_MAX}
                    value={vector.x}
                    onChange={(value) => onChange({ ...vector, x: normalizeInputValue(value, SAMPLE_VECTOR_MIN, SAMPLE_VECTOR_MAX) })}
                />
                <SliderField
                    label="y"
                    min={SAMPLE_VECTOR_MIN}
                    max={SAMPLE_VECTOR_MAX}
                    value={vector.y}
                    onChange={(value) => onChange({ ...vector, y: normalizeInputValue(value, SAMPLE_VECTOR_MIN, SAMPLE_VECTOR_MAX) })}
                />
            </div>
        </section>
    );
};

const PlaneVisualization: React.FC<VisualizationProps> = ({
    title,
    caption,
    sampleVector,
    transformedSampleVector,
    transformedBasis,
    originalSquare,
    transformedSquare,
    originalCircle,
    transformedCircle,
    helperLine,
    transformedHelperLine,
    imagePoints,
    kernelDirectionVector,
    restoredVectors,
    bounds,
    onSampleVectorChange,
}) => {
    const markerId = useId();
    const svgRef = useRef<SVGSVGElement>(null);
    const dragPointerIdRef = useRef<number | null>(null);
    const dragHandleRef = useRef<SVGCircleElement | null>(null);

    const derivedBounds = useMemo(() => {
        return bounds ?? buildPlotBounds(collectPlotPoints({
            sampleVector,
            transformedSampleVector,
            transformedBasis,
            originalSquare,
            transformedSquare,
            originalCircle,
            transformedCircle,
            helperLine,
            transformedHelperLine,
            imagePoints,
            kernelDirectionVector,
            restoredVectors,
        }));
    }, [
        bounds,
        helperLine,
        imagePoints,
        kernelDirectionVector,
        originalCircle,
        originalSquare,
        restoredVectors,
        sampleVector,
        transformedBasis,
        transformedCircle,
        transformedHelperLine,
        transformedSampleVector,
        transformedSquare,
    ]);

    const gridLines = useMemo(() => {
        const lines: Array<{ key: string; from: Vector2; to: Vector2; axis?: boolean }> = [];
        for (let tick = -derivedBounds.gridLimit; tick <= derivedBounds.gridLimit; tick += 1) {
            lines.push({
                key: `v-${tick}`,
                from: { x: tick, y: -derivedBounds.radius },
                to: { x: tick, y: derivedBounds.radius },
                axis: tick === 0,
            });
            lines.push({
                key: `h-${tick}`,
                from: { x: -derivedBounds.radius, y: tick },
                to: { x: derivedBounds.radius, y: tick },
                axis: tick === 0,
            });
        }
        return lines;
    }, [derivedBounds]);

    const kernelLine = useMemo(() => {
        if (!kernelDirectionVector) {
            return null;
        }
        const length = derivedBounds.radius * 1.05;
        return [
            { x: -kernelDirectionVector.x * length, y: -kernelDirectionVector.y * length },
            { x: kernelDirectionVector.x * length, y: kernelDirectionVector.y * length },
        ] satisfies Vector2[];
    }, [derivedBounds.radius, kernelDirectionVector]);

    const originalCircleClosed = useMemo(() => [...originalCircle, originalCircle[0]], [originalCircle]);
    const transformedCircleClosed = useMemo(() => [...transformedCircle, transformedCircle[0]], [transformedCircle]);

    const clearDraggingState = useCallback((pointerId?: number) => {
        if (
            pointerId !== undefined &&
            dragHandleRef.current?.hasPointerCapture(pointerId)
        ) {
            dragHandleRef.current.releasePointerCapture(pointerId);
        }
        dragPointerIdRef.current = null;
        document.body.classList.remove('is-dragging-linear-algebra-vector');
    }, []);

    useEffect(() => {
        return () => clearDraggingState(dragPointerIdRef.current ?? undefined);
    }, [clearDraggingState]);

    const updateVectorFromClient = useCallback((clientX: number, clientY: number) => {
        if (!svgRef.current || !onSampleVectorChange) {
            return;
        }

        const nextWorld = toWorldPoint(clientX, clientY, svgRef.current.getBoundingClientRect(), derivedBounds);
        onSampleVectorChange({
            x: normalizeInputValue(nextWorld.x, SAMPLE_VECTOR_MIN, SAMPLE_VECTOR_MAX),
            y: normalizeInputValue(nextWorld.y, SAMPLE_VECTOR_MIN, SAMPLE_VECTOR_MAX),
        });
    }, [derivedBounds, onSampleVectorChange]);

    const handlePointerDown = useCallback((event: React.PointerEvent<SVGCircleElement>) => {
        if (!onSampleVectorChange) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        dragPointerIdRef.current = event.pointerId;
        dragHandleRef.current = event.currentTarget;
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.classList.add('is-dragging-linear-algebra-vector');
        updateVectorFromClient(event.clientX, event.clientY);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            if (dragPointerIdRef.current !== moveEvent.pointerId) {
                return;
            }
            if (moveEvent.cancelable) {
                moveEvent.preventDefault();
            }
            updateVectorFromClient(moveEvent.clientX, moveEvent.clientY);
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
            if (dragPointerIdRef.current !== upEvent.pointerId) {
                return;
            }
            clearDraggingState(upEvent.pointerId);
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };

        window.addEventListener('pointermove', handlePointerMove, { passive: false });
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
    }, [clearDraggingState, onSampleVectorChange, updateVectorFromClient]);

    const renderVector = (
        vector: Vector2,
        label: string,
        className: string,
        markerUrl: string,
        labelTone: LabelTone,
        labelOffsetX = 0,
        labelOffsetY = 0,
    ) => {
        const origin = toScreenPoint(ZERO_VECTOR, derivedBounds);
        const tip = toScreenPoint(vector, derivedBounds);
        const badgeWidth = estimatePlotLabelWidth(label);
        const badgeHeight = PLOT_LABEL_HEIGHT;
        const baseOffsetX = tip.x >= origin.x ? 12 : -(badgeWidth + 12);
        const baseOffsetY = tip.y <= origin.y ? -(badgeHeight + 10) : 10;
        const badgeX = clampValue(tip.x + baseOffsetX + labelOffsetX, 10, PLOT_SIZE - badgeWidth - 10);
        const badgeY = clampValue(tip.y + baseOffsetY + labelOffsetY, 10, PLOT_SIZE - badgeHeight - 10);

        return (
            <g key={label}>
                <line
                    className={className}
                    x1={origin.x}
                    y1={origin.y}
                    x2={tip.x}
                    y2={tip.y}
                    markerEnd={`url(#${markerUrl})`}
                />
                <g className={`linear-algebra-lab-plot-label-badge is-${labelTone}`} transform={`translate(${badgeX}, ${badgeY})`}>
                    <rect className="linear-algebra-lab-plot-label-bg" x={0} y={0} width={badgeWidth} height={badgeHeight} rx={11} ry={11} />
                    <foreignObject x={0} y={0} width={badgeWidth} height={badgeHeight}>
                        <div
                            className="linear-algebra-lab-plot-label-html"
                            dangerouslySetInnerHTML={{ __html: renderPlotLabelHtml(label) }}
                        />
                    </foreignObject>
                </g>
            </g>
        );
    };

    const sampleTip = toScreenPoint(sampleVector, derivedBounds);
    const originPoint = toScreenPoint(ZERO_VECTOR, derivedBounds);

    return (
        <section className="linear-algebra-lab-card linear-algebra-lab-visualization-card">
            <div className="linear-algebra-lab-card-head">
                <div>
                    <h3 className="linear-algebra-lab-card-title">{title}</h3>
                    <p className="linear-algebra-lab-card-caption">{caption}</p>
                </div>
                <div className="linear-algebra-lab-zoom-badge">auto-fit</div>
            </div>

            <div className="linear-algebra-lab-plot-shell">
                <svg
                    ref={svgRef}
                    className="linear-algebra-lab-plot"
                    viewBox={`0 0 ${PLOT_SIZE} ${PLOT_SIZE}`}
                    role="img"
                    aria-label={title}
                >
                    <defs>
                        <marker id={`${markerId}-original`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                        </marker>
                        <marker id={`${markerId}-transformed`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary-color)" />
                        </marker>
                        <marker id={`${markerId}-inverse`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--success-color)" />
                        </marker>
                    </defs>

                    {gridLines.map((line) => {
                        const from = toScreenPoint(line.from, derivedBounds);
                        const to = toScreenPoint(line.to, derivedBounds);
                        return (
                            <line
                                key={line.key}
                                className={line.axis ? 'linear-algebra-lab-axis-line' : 'linear-algebra-lab-grid-line'}
                                x1={from.x}
                                y1={from.y}
                                x2={to.x}
                                y2={to.y}
                            />
                        );
                    })}

                    <polygon className="linear-algebra-lab-shape linear-algebra-lab-shape-original-square" points={toPointList(originalSquare, derivedBounds)} />
                    <polygon className="linear-algebra-lab-shape linear-algebra-lab-shape-transformed-square" points={toPointList(transformedSquare, derivedBounds)} />
                    <polyline className="linear-algebra-lab-shape linear-algebra-lab-shape-original-circle" points={toPointList(originalCircleClosed, derivedBounds)} />
                    <polyline className="linear-algebra-lab-shape linear-algebra-lab-shape-transformed-circle" points={toPointList(transformedCircleClosed, derivedBounds)} />

                    {helperLine ? (
                        <polyline className="linear-algebra-lab-helper-line" points={toPointList(helperLine, derivedBounds)} />
                    ) : null}
                    {transformedHelperLine ? (
                        <polyline className="linear-algebra-lab-helper-line linear-algebra-lab-helper-line-transformed" points={toPointList(transformedHelperLine, derivedBounds)} />
                    ) : null}

                    {imagePoints?.map((point, index) => {
                        const screen = toScreenPoint(point, derivedBounds);
                        return <circle key={`image-${index}`} className="linear-algebra-lab-image-point" cx={screen.x} cy={screen.y} r={3.1} />;
                    })}

                    {kernelLine ? (
                        <polyline className="linear-algebra-lab-kernel-line" points={toPointList(kernelLine, derivedBounds)} />
                    ) : null}

                    {renderVector(BASIS_E1, 'e1', 'linear-algebra-lab-vector linear-algebra-lab-vector-original', `${markerId}-original`, 'original')}
                    {renderVector(BASIS_E2, 'e2', 'linear-algebra-lab-vector linear-algebra-lab-vector-original', `${markerId}-original`, 'original', 0, -6)}
                    {renderVector(transformedBasis[0], 'Ae1', 'linear-algebra-lab-vector linear-algebra-lab-vector-transformed', `${markerId}-transformed`, 'transformed', 6, -10)}
                    {renderVector(transformedBasis[1], 'Ae2', 'linear-algebra-lab-vector linear-algebra-lab-vector-transformed', `${markerId}-transformed`, 'transformed', 10, 18)}
                    {renderVector(sampleVector, 'x', 'linear-algebra-lab-vector linear-algebra-lab-vector-sample', `${markerId}-original`, 'original', 4, 18)}
                    {renderVector(transformedSampleVector, 'Ax', 'linear-algebra-lab-vector linear-algebra-lab-vector-transformed-sample', `${markerId}-transformed`, 'transformed', 8, 18)}

                    {restoredVectors?.map((item) => (
                        renderVector(item.vector, item.label, 'linear-algebra-lab-vector linear-algebra-lab-vector-restored', `${markerId}-inverse`, 'restored', 8, -10)
                    ))}

                    <circle className="linear-algebra-lab-origin-dot" cx={originPoint.x} cy={originPoint.y} r={4.2} />
                    <circle className="linear-algebra-lab-sample-handle-ring" cx={sampleTip.x} cy={sampleTip.y} r={9} />
                    <circle
                        className="linear-algebra-lab-sample-handle"
                        cx={sampleTip.x}
                        cy={sampleTip.y}
                        r={6}
                    />
                    <circle
                        className="linear-algebra-lab-sample-handle-hit-area"
                        cx={sampleTip.x}
                        cy={sampleTip.y}
                        r={22}
                        onPointerDown={handlePointerDown}
                    />
                </svg>
            </div>

            <div className="linear-algebra-lab-legend">
                <span className="linear-algebra-lab-legend-item"><i className="linear-algebra-lab-legend-swatch is-original" />元の図形</span>
                <span className="linear-algebra-lab-legend-item"><i className="linear-algebra-lab-legend-swatch is-transformed" />変換後</span>
                {imagePoints ? <span className="linear-algebra-lab-legend-item"><i className="linear-algebra-lab-legend-swatch is-image" />像のサンプル点</span> : null}
                {kernelLine ? <span className="linear-algebra-lab-legend-item"><i className="linear-algebra-lab-legend-swatch is-kernel" />核方向</span> : null}
                {restoredVectors?.length ? <span className="linear-algebra-lab-legend-item"><i className="linear-algebra-lab-legend-swatch is-restored" />逆変換で戻したベクトル</span> : null}
            </div>
        </section>
    );
};

function renderMatrixInfoRows(matrix: Matrix2) {
    const [column1, column2] = matrixColumns(matrix);
    return (
        <div className="linear-algebra-lab-info-list">
            <div className="linear-algebra-lab-info-row">
                <span className="linear-algebra-lab-info-label">A e1</span>
                <span className="linear-algebra-lab-info-value">{formatVector(column1)}</span>
            </div>
            <div className="linear-algebra-lab-info-row">
                <span className="linear-algebra-lab-info-label">A e2</span>
                <span className="linear-algebra-lab-info-value">{formatVector(column2)}</span>
            </div>
        </div>
    );
}

export const LinearAlgebraLab: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [activeTab, setActiveTab] = useState<LabTab>('linear');
    const [matrixA, setMatrixA] = useState<Matrix2>(IDENTITY_MATRIX);
    const [compositionA, setCompositionA] = useState<Matrix2>({ a11: 0, a12: -1, a21: 1, a22: 0 });
    const [compositionB, setCompositionB] = useState<Matrix2>({ a11: 2, a12: 0, a21: 0, a22: 1 });
    const [sampleVector, setSampleVector] = useState<Vector2>({ x: 1.5, y: 0.75 });
    const [showInverseOverlay, setShowInverseOverlay] = useState(false);

    const unitSquare = useMemo(() => unitSquarePoints(), []);
    const unitCircle = useMemo(() => unitCirclePoints(64), []);
    const helperLine = useMemo(() => helperLinePoints(), []);
    const imageSamples = useMemo(() => imageSamplePoints(), []);

    const transformedSquare = useMemo(() => unitSquare.map((point) => applyMatrix(matrixA, point)), [matrixA, unitSquare]);
    const transformedCircle = useMemo(() => unitCircle.map((point) => applyMatrix(matrixA, point)), [matrixA, unitCircle]);
    const transformedHelperLine = useMemo(() => helperLine.map((point) => applyMatrix(matrixA, point)), [helperLine, matrixA]);
    const transformedSampleVector = useMemo(() => applyMatrix(matrixA, sampleVector), [matrixA, sampleVector]);
    const transformedBasis = useMemo(() => matrixColumns(matrixA), [matrixA]);

    const determinantA = useMemo(() => determinant(matrixA), [matrixA]);
    const rankA = useMemo(() => rankOfMatrix(matrixA), [matrixA]);
    const nullityA = useMemo(() => nullityOfMatrix(matrixA), [matrixA]);
    const inverseA = useMemo(() => inverseMatrix(matrixA), [matrixA]);
    const kernelVector = useMemo(() => kernelDirection(matrixA), [matrixA]);
    const imagePoints = useMemo(() => imageSamples.map((point) => applyMatrix(matrixA, point)), [imageSamples, matrixA]);
    const normAx = useMemo(() => vectorNorm(transformedSampleVector), [transformedSampleVector]);
    const inverseOverlayVectors = useMemo(() => {
        if (!showInverseOverlay || !inverseA) {
            return [];
        }
        return [
            { label: 'A⁻¹(Ax)', vector: applyMatrix(inverseA, transformedSampleVector) },
            { label: 'A⁻¹(Ae1)', vector: applyMatrix(inverseA, transformedBasis[0]) },
            { label: 'A⁻¹(Ae2)', vector: applyMatrix(inverseA, transformedBasis[1]) },
        ];
    }, [inverseA, showInverseOverlay, transformedBasis, transformedSampleVector]);

    const matrixAB = useMemo(() => multiplyMatrices(compositionA, compositionB), [compositionA, compositionB]);
    const matrixBA = useMemo(() => multiplyMatrices(compositionB, compositionA), [compositionA, compositionB]);
    const sampleAfterAB = useMemo(() => applyMatrix(matrixAB, sampleVector), [matrixAB, sampleVector]);
    const sampleAfterBA = useMemo(() => applyMatrix(matrixBA, sampleVector), [matrixBA, sampleVector]);
    const basisAfterAB = useMemo(() => matrixColumns(matrixAB), [matrixAB]);
    const basisAfterBA = useMemo(() => matrixColumns(matrixBA), [matrixBA]);
    const squareAfterAB = useMemo(() => unitSquare.map((point) => applyMatrix(matrixAB, point)), [matrixAB, unitSquare]);
    const squareAfterBA = useMemo(() => unitSquare.map((point) => applyMatrix(matrixBA, point)), [matrixBA, unitSquare]);
    const circleAfterAB = useMemo(() => unitCircle.map((point) => applyMatrix(matrixAB, point)), [matrixAB, unitCircle]);
    const circleAfterBA = useMemo(() => unitCircle.map((point) => applyMatrix(matrixBA, point)), [matrixBA, unitCircle]);
    const compositionBounds = useMemo(() => buildPlotBounds([
        ...collectPlotPoints({
            sampleVector,
            transformedSampleVector: sampleAfterAB,
            transformedBasis: basisAfterAB,
            originalSquare: unitSquare,
            transformedSquare: squareAfterAB,
            originalCircle: unitCircle,
            transformedCircle: circleAfterAB,
        }),
        ...collectPlotPoints({
            sampleVector,
            transformedSampleVector: sampleAfterBA,
            transformedBasis: basisAfterBA,
            originalSquare: unitSquare,
            transformedSquare: squareAfterBA,
            originalCircle: unitCircle,
            transformedCircle: circleAfterBA,
        }),
    ]), [basisAfterAB, basisAfterBA, circleAfterAB, circleAfterBA, sampleAfterAB, sampleAfterBA, sampleVector, squareAfterAB, squareAfterBA, unitCircle, unitSquare]);
    const matricesCommute = useMemo(() => areMatricesCommutative(compositionA, compositionB), [compositionA, compositionB]);

    const determinantSummary = useMemo(() => {
        if (determinantA > EPS) {
            return 'det > 0: 向きを保ちながら面積を伸び縮みさせています。';
        }
        if (determinantA < -EPS) {
            return 'det < 0: 向きを反転しながら面積を伸び縮みさせています。';
        }
        return 'det ≈ 0: 平面が潰れて逆行列を持ちません。';
    }, [determinantA]);

    const inverseCardText = inverseA
        ? `逆行列あり。A^{-1} を使うと A で変換したベクトルを元へ戻せます。`
        : '逆行列なし。平面を潰しているため戻せません。';

    const kernelMeterPercent = rankA === 0
        ? 100
        : clampValue((1 - normAx / 3) * 100, 0, 100);
    const workspaceClassName = `linear-algebra-lab-workspace ${activeTab === 'composition' ? 'is-composition' : 'is-single-plot'}`;

    return (
        <main className="content-area linear-algebra-lab-page">
            <div className="detail-header linear-algebra-lab-header">
                <BackButton className="nav-btn" onClick={onBack} label="ホームへ戻る" />
                <div>
                    <h1>ベクトル・行列ラボ</h1>
                    <p className="linear-algebra-lab-header-note">
                        行列を 2 次元平面上の線形写像として見て、図形・基底・像・核の動きを直感的に確認します。
                    </p>
                </div>
            </div>

            <div className="linear-algebra-lab-tab-row" role="tablist" aria-label="ベクトル・行列ラボのタブ">
                {TAB_ITEMS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        className={`linear-algebra-lab-tab ${activeTab === tab.key ? 'is-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'linear' && (
                <div className={workspaceClassName}>
                    <div className="linear-algebra-lab-editor-column">
                        <MatrixEditor
                            title="行列 A"
                            matrix={matrixA}
                            onChange={setMatrixA}
                            caption="数値入力とスライダーの両方で 2x2 行列を調整できます。"
                        />
                        <VectorEditor vector={sampleVector} onChange={setSampleVector} />
                    </div>

                    <div className="linear-algebra-lab-visual-column">
                        <PlaneVisualization
                            title="線形変換の見え方"
                            caption="単位正方形・単位円・基底・サンプルベクトルを同じ平面で重ねて見ます。"
                            sampleVector={sampleVector}
                            transformedSampleVector={transformedSampleVector}
                            transformedBasis={transformedBasis}
                            originalSquare={unitSquare}
                            transformedSquare={transformedSquare}
                            originalCircle={unitCircle}
                            transformedCircle={transformedCircle}
                            helperLine={helperLine}
                            transformedHelperLine={transformedHelperLine}
                            onSampleVectorChange={setSampleVector}
                        />
                    </div>

                    <div className="linear-algebra-lab-summary-column">
                        <SummaryCard title="現在の行列 A">
                            <MatrixDisplay matrix={matrixA} />
                            <div className="linear-algebra-lab-info-list">
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">det(A)</span>
                                    <span className="linear-algebra-lab-info-value">{formatScalar(determinantA)}</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">正則性</span>
                                    <span className="linear-algebra-lab-info-value">{inverseA ? '正則' : '非正則'}</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">一言説明</span>
                                    <span className="linear-algebra-lab-info-value">{describeLinearTransformation(matrixA)}</span>
                                </div>
                            </div>
                        </SummaryCard>

                        <SummaryCard title="列ベクトル = 基底の像">
                            {renderMatrixInfoRows(matrixA)}
                            <p className="linear-algebra-lab-summary-text">
                                行列の列は、基底ベクトルがどこへ移るかを表しています。
                            </p>
                        </SummaryCard>

                        <SummaryCard title="線形写像として見るポイント">
                            <p className="linear-algebra-lab-summary-text">
                                線形写像では 0 ベクトルは必ず 0 ベクトルへ移るため、原点は固定されます。
                            </p>
                            <p className="linear-algebra-lab-summary-text">
                                このアプリは線形写像のみを扱います。平行移動は対象外で、原点を動かす変換は表示しません。
                            </p>
                        </SummaryCard>
                    </div>
                </div>
            )}

            {activeTab === 'composition' && (
                <div className={workspaceClassName}>
                    <div className="linear-algebra-lab-editor-column">
                        <MatrixEditor
                            title="行列 A"
                            matrix={compositionA}
                            onChange={setCompositionA}
                            caption="AB と BA の違いを見るための 1 つ目の変換です。"
                        />
                        <MatrixEditor
                            title="行列 B"
                            matrix={compositionB}
                            onChange={setCompositionB}
                            caption="順序を変えると結果が変わるかを比較します。"
                        />
                        <VectorEditor vector={sampleVector} onChange={setSampleVector} />
                    </div>

                    <div className="linear-algebra-lab-visual-column">
                        <div className="linear-algebra-lab-comparison-layout">
                            <PlaneVisualization
                                title="AB の結果"
                                caption="積 AB が表す合成変換の結果です。"
                                sampleVector={sampleVector}
                                transformedSampleVector={sampleAfterAB}
                                transformedBasis={basisAfterAB}
                                originalSquare={unitSquare}
                                transformedSquare={squareAfterAB}
                                originalCircle={unitCircle}
                                transformedCircle={circleAfterAB}
                                bounds={compositionBounds}
                                onSampleVectorChange={setSampleVector}
                            />
                            <PlaneVisualization
                                title="BA の結果"
                                caption="積 BA に入れ替えると結果がどう変わるかを比較します。"
                                sampleVector={sampleVector}
                                transformedSampleVector={sampleAfterBA}
                                transformedBasis={basisAfterBA}
                                originalSquare={unitSquare}
                                transformedSquare={squareAfterBA}
                                originalCircle={unitCircle}
                                transformedCircle={circleAfterBA}
                                bounds={compositionBounds}
                                onSampleVectorChange={setSampleVector}
                            />
                        </div>
                    </div>

                    <div className="linear-algebra-lab-summary-column">
                        <SummaryCard title="数値比較">
                            <MatrixDisplay matrix={compositionA} label="A" />
                            <MatrixDisplay matrix={compositionB} label="B" />
                            <MatrixDisplay matrix={matrixAB} label="AB" />
                            <MatrixDisplay matrix={matrixBA} label="BA" />
                            <div className="linear-algebra-lab-info-list">
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">AB = BA</span>
                                    <span className="linear-algebra-lab-info-value">{matricesCommute ? 'ほぼ同じ' : '異なる'}</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">max |AB-BA|</span>
                                    <span className="linear-algebra-lab-info-value">{formatScalar(maxAbsDiff(matrixAB, matrixBA), 3)}</span>
                                </div>
                            </div>
                        </SummaryCard>

                        <SummaryCard title="読み取り方">
                            <p className="linear-algebra-lab-summary-text">
                                {matricesCommute
                                    ? 'この組み合わせでは AB と BA がほぼ一致し、順序を変えても結果がほとんど変わりません。'
                                    : 'この組み合わせでは AB と BA が異なり、変換の順序で結果が変わります。'}
                            </p>
                            <p className="linear-algebra-lab-summary-text">
                                行列の積は「変換の合成」を表し、一般には順番を入れ替えられません。
                            </p>
                        </SummaryCard>

                        <SummaryCard title="線形写像として見るポイント">
                            <p className="linear-algebra-lab-summary-text">
                                どちらの合成でも、元の単位正方形・単位円・ベクトル x がどこへ送られるかを同じ縮尺で比較しています。
                            </p>
                        </SummaryCard>
                    </div>
                </div>
            )}

            {activeTab === 'determinant' && (
                <div className={workspaceClassName}>
                    <div className="linear-algebra-lab-editor-column">
                        <MatrixEditor
                            title="行列 A"
                            matrix={matrixA}
                            onChange={setMatrixA}
                            caption="det(A) と逆行列の有無が図形の面積と向きにどう効くかを見ます。"
                        />
                        <VectorEditor vector={sampleVector} onChange={setSampleVector} />
                        <section className="linear-algebra-lab-card linear-algebra-lab-editor-card">
                            <div className="linear-algebra-lab-card-head">
                                <div>
                                    <h3 className="linear-algebra-lab-card-title">逆変換の確認</h3>
                                    <p className="linear-algebra-lab-card-caption">正則なときだけ、A のあとに A^-1 を重ねて元へ戻る様子を表示します。</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className={`linear-algebra-lab-action-btn ${!inverseA ? 'is-disabled' : ''}`}
                                disabled={!inverseA}
                                onClick={() => setShowInverseOverlay((current) => !current)}
                            >
                                {showInverseOverlay ? '逆変換の重ね表示を隠す' : '逆変換を適用'}
                            </button>
                        </section>
                    </div>

                    <div className="linear-algebra-lab-visual-column">
                        <PlaneVisualization
                            title="面積倍率と逆変換"
                            caption="det(A) の大きさは面積倍率、符号は向き、0 付近は潰れを表します。"
                            sampleVector={sampleVector}
                            transformedSampleVector={transformedSampleVector}
                            transformedBasis={transformedBasis}
                            originalSquare={unitSquare}
                            transformedSquare={transformedSquare}
                            originalCircle={unitCircle}
                            transformedCircle={transformedCircle}
                            restoredVectors={inverseOverlayVectors}
                            onSampleVectorChange={setSampleVector}
                        />
                    </div>

                    <div className="linear-algebra-lab-summary-column">
                        <SummaryCard title="行列式と正則性">
                            <div className="linear-algebra-lab-info-list">
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">det(A)</span>
                                    <span className="linear-algebra-lab-info-value">{formatScalar(determinantA)}</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">|det(A)|</span>
                                    <span className="linear-algebra-lab-info-value">{formatScalar(Math.abs(determinantA))} 倍</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">rank(A)</span>
                                    <span className="linear-algebra-lab-info-value">{rankA}</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">nullity(A)</span>
                                    <span className="linear-algebra-lab-info-value">{nullityA}</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">rank + nullity</span>
                                    <span className="linear-algebra-lab-info-value">{rankA + nullityA}</span>
                                </div>
                            </div>
                            <p className="linear-algebra-lab-summary-text">{determinantSummary}</p>
                            <p className="linear-algebra-lab-summary-text">
                                det &gt; 0: 向き保存 / det &lt; 0: 向き反転 / det ≈ 0: 平面が潰れて逆行列なし
                            </p>
                        </SummaryCard>

                        <SummaryCard title="逆行列 A^-1">
                            {inverseA ? (
                                <>
                                    <MatrixDisplay matrix={inverseA} />
                                    <p className="linear-algebra-lab-summary-text">{inverseCardText}</p>
                                    <div className="linear-algebra-lab-info-list">
                                        <div className="linear-algebra-lab-info-row">
                                            <span className="linear-algebra-lab-info-label">A^-1(Ax)</span>
                                            <span className="linear-algebra-lab-info-value">{formatVector(applyMatrix(inverseA, transformedSampleVector))}</span>
                                        </div>
                                        <div className="linear-algebra-lab-info-row">
                                            <span className="linear-algebra-lab-info-label">A^-1(Ae1)</span>
                                            <span className="linear-algebra-lab-info-value">{formatVector(applyMatrix(inverseA, transformedBasis[0]))}</span>
                                        </div>
                                        <div className="linear-algebra-lab-info-row">
                                            <span className="linear-algebra-lab-info-label">A^-1(Ae2)</span>
                                            <span className="linear-algebra-lab-info-value">{formatVector(applyMatrix(inverseA, transformedBasis[1]))}</span>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="linear-algebra-lab-disabled-panel">
                                    <strong>逆行列なし</strong>
                                    <p>平面を潰しているため戻せません。</p>
                                </div>
                            )}
                        </SummaryCard>

                        <SummaryCard title="列ベクトル = 基底の像">
                            {renderMatrixInfoRows(matrixA)}
                        </SummaryCard>
                    </div>
                </div>
            )}

            {activeTab === 'image-kernel' && (
                <div className={workspaceClassName}>
                    <div className="linear-algebra-lab-editor-column">
                        <MatrixEditor
                            title="行列 A"
                            matrix={matrixA}
                            onChange={setMatrixA}
                            caption="像は到達できる場所、核は 0 に潰れる方向として見ます。"
                        />
                        <VectorEditor vector={sampleVector} onChange={setSampleVector} />
                    </div>

                    <div className="linear-algebra-lab-visual-column">
                        <PlaneVisualization
                            title="像と核の可視化"
                            caption="像の点群と、必要なら核方向の直線を同じ平面に重ねています。"
                            sampleVector={sampleVector}
                            transformedSampleVector={transformedSampleVector}
                            transformedBasis={transformedBasis}
                            originalSquare={unitSquare}
                            transformedSquare={transformedSquare}
                            originalCircle={unitCircle}
                            transformedCircle={transformedCircle}
                            imagePoints={imagePoints}
                            kernelDirectionVector={kernelVector}
                            onSampleVectorChange={setSampleVector}
                        />
                    </div>

                    <div className="linear-algebra-lab-summary-column">
                        <SummaryCard title="像と核の分類">
                            <div className="linear-algebra-lab-info-list">
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">rank(A)</span>
                                    <span className="linear-algebra-lab-info-value">{rankA}</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">nullity(A)</span>
                                    <span className="linear-algebra-lab-info-value">{nullityA}</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">image</span>
                                    <span className="linear-algebra-lab-info-value">{imageClassification(rankA)}</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">kernel</span>
                                    <span className="linear-algebra-lab-info-value">{kernelClassification(rankA)}</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">rank + nullity</span>
                                    <span className="linear-algebra-lab-info-value">{rankA + nullityA} = 2</span>
                                </div>
                            </div>
                            <p className="linear-algebra-lab-summary-text">{imageKernelExplanation(rankA)}</p>
                        </SummaryCard>

                        <SummaryCard title="核への近さ">
                            <div className="linear-algebra-lab-meter">
                                <span className="linear-algebra-lab-meter-fill" style={{ width: `${kernelMeterPercent}%` }} />
                            </div>
                            <div className="linear-algebra-lab-info-list">
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">||Ax||</span>
                                    <span className="linear-algebra-lab-info-value">{formatScalar(normAx, 3)}</span>
                                </div>
                                <div className="linear-algebra-lab-info-row">
                                    <span className="linear-algebra-lab-info-label">状態</span>
                                    <span className="linear-algebra-lab-info-value">{kernelStatusText(normAx)}</span>
                                </div>
                            </div>
                            {kernelVector ? (
                                <p className="linear-algebra-lab-summary-text">
                                    singular なため、点線で核方向も表示しています。
                                </p>
                            ) : (
                                <p className="linear-algebra-lab-summary-text">
                                    正則な行列では kernel は {`{0}`} のみなので、特別な核方向は現れません。
                                </p>
                            )}
                        </SummaryCard>

                        <SummaryCard title="列ベクトルと原点固定">
                            {renderMatrixInfoRows(matrixA)}
                            <p className="linear-algebra-lab-summary-text">
                                線形写像では 0 ベクトルは必ず 0 ベクトルへ移るため、原点は固定されます。
                            </p>
                            <p className="linear-algebra-lab-summary-text">
                                このアプリは線形写像のみを扱います。平行移動は対象外で、原点を動かす変換は表示しません。
                            </p>
                        </SummaryCard>
                    </div>
                </div>
            )}
        </main>
    );
};
