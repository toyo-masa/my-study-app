import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Pencil, RotateCcw, RotateCw } from 'lucide-react';

type HandwritingPoint = {
    x: number;
    y: number;
};

export type HandwritingStroke = {
    points: HandwritingPoint[];
    lineWidth: number;
    mode: 'draw' | 'erase';
};

export type HandwritingPadState = {
    strokes: HandwritingStroke[];
    redoStrokes: HandwritingStroke[];
};

const EMPTY_HANDWRITING_PAD_STATE: HandwritingPadState = {
    strokes: [],
    redoStrokes: [],
};

const DEFAULT_LINE_WIDTH = 1.875;
const DEFAULT_ERASER_WIDTH = 12;

interface HandwritingPadProps {
    value?: HandwritingPadState;
    onChange?: (nextValue: HandwritingPadState) => void;
}

export const HandwritingPad: React.FC<HandwritingPadProps> = ({
    value = EMPTY_HANDWRITING_PAD_STATE,
    onChange,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const activePointerIdRef = useRef<number | null>(null);
    const isDrawingRef = useRef(false);
    const canvasDprRef = useRef(1);
    const currentStrokeRef = useRef<HandwritingStroke | null>(null);
    const [hasPreviewStroke, setHasPreviewStroke] = useState(false);
    const [toolMode, setToolMode] = useState<'draw' | 'erase'>('draw');
    const strokes = value.strokes;
    const redoStrokes = value.redoStrokes;

    const updateValue = useCallback((nextStrokes: HandwritingStroke[], nextRedoStrokes: HandwritingStroke[]) => {
        onChange?.({
            strokes: nextStrokes,
            redoStrokes: nextRedoStrokes,
        });
    }, [onChange]);

    const clearTextSelection = useCallback(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            return;
        }

        selection.removeAllRanges();
    }, []);

    const applyContextStyle = useCallback((ctx: CanvasRenderingContext2D, stroke: HandwritingStroke) => {
        const canvas = canvasRef.current;
        const strokeColor = canvas ? getComputedStyle(canvas).getPropertyValue('--text-color').trim() : '';
        const dpr = canvasDprRef.current || 1;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.lineWidth;
        ctx.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = strokeColor || '#111827';
        ctx.fillStyle = strokeColor || '#111827';
    }, []);

    const clearCanvasPixels = useCallback((ctx: CanvasRenderingContext2D) => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }, []);

    const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: HandwritingStroke) => {
        const firstPoint = stroke.points[0];
        if (!firstPoint) {
            return;
        }

        applyContextStyle(ctx, stroke);

        if (stroke.points.length === 1) {
            ctx.beginPath();
            ctx.arc(firstPoint.x, firstPoint.y, stroke.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
            return;
        }

        ctx.beginPath();
        ctx.moveTo(firstPoint.x, firstPoint.y);
        stroke.points.slice(1).forEach((point) => {
            ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
        ctx.closePath();
    }, [applyContextStyle]);

    const redrawCanvas = useCallback((nextStrokes: HandwritingStroke[], activeStroke?: HandwritingStroke | null) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx) {
            return;
        }

        clearCanvasPixels(ctx);
        nextStrokes.forEach((stroke) => drawStroke(ctx, stroke));
        if (activeStroke) {
            drawStroke(ctx, activeStroke);
        }
    }, [clearCanvasPixels, drawStroke]);

    const syncCanvasSize = useCallback(() => {
        const canvas = canvasRef.current;
        const surface = surfaceRef.current;
        if (!canvas || !surface) {
            return;
        }

        const rect = surface.getBoundingClientRect();
        const cssWidth = Math.max(1, Math.round(rect.width));
        const cssHeight = Math.max(1, Math.round(rect.height));
        const dpr = typeof window !== 'undefined' ? Math.max(window.devicePixelRatio || 1, 1) : 1;
        const nextWidth = Math.max(1, Math.round(cssWidth * dpr));
        const nextHeight = Math.max(1, Math.round(cssHeight * dpr));

        if (canvas.width === nextWidth && canvas.height === nextHeight) {
            canvas.style.width = `${cssWidth}px`;
            canvas.style.height = `${cssHeight}px`;
            canvasDprRef.current = dpr;
            redrawCanvas(strokes, currentStrokeRef.current);
            return;
        }

        canvas.width = nextWidth;
        canvas.height = nextHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        canvasDprRef.current = dpr;
        redrawCanvas(strokes, currentStrokeRef.current);
    }, [redrawCanvas, strokes]);

    const finishStroke = useCallback((pointerId?: number) => {
        const canvas = canvasRef.current;
        if (canvas && pointerId !== undefined && canvas.hasPointerCapture(pointerId)) {
            canvas.releasePointerCapture(pointerId);
        }

        activePointerIdRef.current = null;
        isDrawingRef.current = false;
    }, []);

    const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return null;
        }

        const rect = canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
    }, []);

    const commitCurrentStroke = useCallback(() => {
        const currentStroke = currentStrokeRef.current;
        if (!currentStroke || currentStroke.points.length === 0) {
            return;
        }

        const completedStroke = {
            ...currentStroke,
            points: currentStroke.points.map((point) => ({ ...point })),
        };
        currentStrokeRef.current = null;
        updateValue([...strokes, completedStroke], []);
    }, [strokes, updateValue]);

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const point = getCanvasPoint(event);
        if (!canvas || !ctx || !point || activePointerIdRef.current !== null) {
            return;
        }

        event.preventDefault();
        const nextStroke: HandwritingStroke = {
            points: [point],
            lineWidth: toolMode === 'erase' ? DEFAULT_ERASER_WIDTH : DEFAULT_LINE_WIDTH,
            mode: toolMode,
        };

        activePointerIdRef.current = event.pointerId;
        isDrawingRef.current = true;
        currentStrokeRef.current = nextStroke;
        canvas.setPointerCapture(event.pointerId);
        drawStroke(ctx, nextStroke);
        setHasPreviewStroke(true);
    }, [drawStroke, getCanvasPoint, toolMode]);

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current || activePointerIdRef.current !== event.pointerId) {
            return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const point = getCanvasPoint(event);
        const currentStroke = currentStrokeRef.current;
        if (!ctx || !point || !currentStroke) {
            return;
        }

        event.preventDefault();
        const lastPoint = currentStroke.points[currentStroke.points.length - 1];
        currentStroke.points.push(point);
        applyContextStyle(ctx, currentStroke);
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        ctx.closePath();
    }, [applyContextStyle, getCanvasPoint]);

    const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        if (activePointerIdRef.current !== event.pointerId) {
            return;
        }

        event.preventDefault();
        commitCurrentStroke();
        finishStroke(event.pointerId);
        setHasPreviewStroke(false);
    }, [commitCurrentStroke, finishStroke]);

    const handleClear = useCallback(() => {
        currentStrokeRef.current = null;
        finishStroke(activePointerIdRef.current ?? undefined);
        updateValue([], []);
        setHasPreviewStroke(false);
    }, [finishStroke, updateValue]);

    const handleUndo = useCallback(() => {
        if (strokes.length === 0) {
            return;
        }

        currentStrokeRef.current = null;
        finishStroke(activePointerIdRef.current ?? undefined);
        const removedStroke = strokes[strokes.length - 1];
        const nextStrokes = strokes.slice(0, -1);
        updateValue(nextStrokes, [removedStroke, ...redoStrokes]);
        setHasPreviewStroke(false);
    }, [finishStroke, redoStrokes, strokes, updateValue]);

    const handleRedo = useCallback(() => {
        if (redoStrokes.length === 0) {
            return;
        }

        currentStrokeRef.current = null;
        finishStroke(activePointerIdRef.current ?? undefined);
        const [restoredStroke, ...nextRedoStrokes] = redoStrokes;
        const nextStrokes = [...strokes, restoredStroke];
        updateValue(nextStrokes, nextRedoStrokes);
        setHasPreviewStroke(false);
    }, [finishStroke, redoStrokes, strokes, updateValue]);

    useEffect(() => {
        redrawCanvas(strokes, currentStrokeRef.current);
    }, [redrawCanvas, strokes]);

    const hasStroke = hasPreviewStroke || strokes.length > 0;

    useEffect(() => {
        const frameId = window.requestAnimationFrame(syncCanvasSize);

        const handleResize = () => syncCanvasSize();
        window.addEventListener('resize', handleResize);

        const surface = surfaceRef.current;
        let observer: ResizeObserver | null = null;
        if (surface && typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => syncCanvasSize());
            observer.observe(surface);
        }

        return () => {
            window.cancelAnimationFrame(frameId);
            window.removeEventListener('resize', handleResize);
            observer?.disconnect();
        };
    }, [syncCanvasSize]);

    return (
        <div
            className="handwriting-pad-section"
            onPointerDownCapture={clearTextSelection}
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="handwriting-pad-header">
                <div>
                    <span className="handwriting-pad-title">手書きメモ</span>
                    <p className="handwriting-pad-hint">ここに指やペンで書けます。保存はされません。</p>
                </div>
                <div className="handwriting-pad-actions">
                    <button
                        type="button"
                        className={`icon-btn handwriting-pad-icon-btn handwriting-pad-tool-btn ${toolMode === 'draw' ? 'active' : ''}`}
                        onClick={() => setToolMode('draw')}
                        aria-label="ペン"
                        title="ペン"
                    >
                        <Pencil size={16} />
                    </button>
                    <button
                        type="button"
                        className={`icon-btn handwriting-pad-icon-btn handwriting-pad-tool-btn ${toolMode === 'erase' ? 'active' : ''}`}
                        onClick={() => setToolMode('erase')}
                        aria-label="消しゴム"
                        title="消しゴム"
                    >
                        <Eraser size={16} />
                    </button>
                    <button
                        type="button"
                        className="icon-btn handwriting-pad-icon-btn"
                        onClick={handleUndo}
                        disabled={strokes.length === 0}
                        aria-label="元に戻す"
                        title="元に戻す"
                    >
                        <RotateCcw size={16} />
                    </button>
                    <button
                        type="button"
                        className="icon-btn handwriting-pad-icon-btn"
                        onClick={handleRedo}
                        disabled={redoStrokes.length === 0}
                        aria-label="やり直し"
                        title="やり直し"
                    >
                        <RotateCw size={16} />
                    </button>
                    <button
                        type="button"
                        className="nav-btn handwriting-pad-clear-btn"
                        onClick={handleClear}
                        disabled={!hasStroke}
                    >
                        全消し
                    </button>
                </div>
            </div>
            <div
                ref={surfaceRef}
                className="handwriting-pad-surface is-grid"
            >
                {!hasStroke && (
                    <div className="handwriting-pad-empty">
                        ここに手書きできます
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    className="handwriting-pad-canvas"
                    aria-label="手書きメモ欄"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onContextMenu={(event) => event.preventDefault()}
                />
            </div>
        </div>
    );
};
