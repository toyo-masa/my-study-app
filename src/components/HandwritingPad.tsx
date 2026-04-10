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
const MIN_PAD_HEIGHT = 220;
const MAX_PAD_HEIGHT = 560;
const RESIZE_AUTO_SCROLL_EDGE_PX = 72;
const RESIZE_AUTO_SCROLL_MAX_STEP = 16;

interface HandwritingPadProps {
    value?: HandwritingPadState;
    onChange?: (nextValue: HandwritingPadState) => void;
    allowTouchDrawing?: boolean;
}

export const HandwritingPad: React.FC<HandwritingPadProps> = ({
    value = EMPTY_HANDWRITING_PAD_STATE,
    onChange,
    allowTouchDrawing = false,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const resizeHandleRef = useRef<HTMLButtonElement>(null);
    const activePointerIdRef = useRef<number | null>(null);
    const resizePointerIdRef = useRef<number | null>(null);
    const resizeStartHeightRef = useRef(0);
    const resizeStartPageYRef = useRef(0);
    const resizeLatestClientYRef = useRef(0);
    const resizeAutoScrollFrameRef = useRef<number | null>(null);
    const resizeScrollContainerRef = useRef<HTMLElement | Window | null>(null);
    const isDrawingRef = useRef(false);
    const canvasDprRef = useRef(1);
    const currentStrokeRef = useRef<HandwritingStroke | null>(null);
    const [hasPreviewStroke, setHasPreviewStroke] = useState(false);
    const [toolMode, setToolMode] = useState<'draw' | 'erase'>('draw');
    const [padHeight, setPadHeight] = useState<number | null>(null);
    const [isResizing, setIsResizing] = useState(false);
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

    const isPointerTypeAllowed = useCallback((pointerType: string) => {
        if (pointerType === 'touch') {
            return allowTouchDrawing;
        }
        return pointerType === '' || pointerType === 'pen' || pointerType === 'mouse';
    }, [allowTouchDrawing]);

    const clampPadHeight = useCallback((height: number) => {
        return Math.min(MAX_PAD_HEIGHT, Math.max(MIN_PAD_HEIGHT, Math.round(height)));
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

        if (stroke.points.length === 2) {
            const secondPoint = stroke.points[1];
            if (!secondPoint) {
                return;
            }
            ctx.beginPath();
            ctx.moveTo(firstPoint.x, firstPoint.y);
            ctx.lineTo(secondPoint.x, secondPoint.y);
            ctx.stroke();
            ctx.closePath();
            return;
        }

        ctx.beginPath();
        ctx.moveTo(firstPoint.x, firstPoint.y);

        for (let index = 1; index < stroke.points.length - 1; index += 1) {
            const point = stroke.points[index];
            const nextPoint = stroke.points[index + 1];
            const controlX = (point.x + nextPoint.x) / 2;
            const controlY = (point.y + nextPoint.y) / 2;
            ctx.quadraticCurveTo(point.x, point.y, controlX, controlY);
        }

        const lastPoint = stroke.points[stroke.points.length - 1];
        const penultimatePoint = stroke.points[stroke.points.length - 2];
        if (lastPoint && penultimatePoint) {
            ctx.quadraticCurveTo(penultimatePoint.x, penultimatePoint.y, lastPoint.x, lastPoint.y);
        }

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
        if (!canvas || !ctx || !point || activePointerIdRef.current !== null || !isPointerTypeAllowed(event.pointerType)) {
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
    }, [drawStroke, getCanvasPoint, isPointerTypeAllowed, toolMode]);

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
        const midPoint = {
            x: (lastPoint.x + point.x) / 2,
            y: (lastPoint.y + point.y) / 2,
        };
        currentStroke.points.push(midPoint, point);
        applyContextStyle(ctx, currentStroke);
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.quadraticCurveTo(midPoint.x, midPoint.y, point.x, point.y);
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

    const finishResize = useCallback((pointerId?: number) => {
        if (pointerId !== undefined && resizeHandleRef.current?.hasPointerCapture(pointerId)) {
            resizeHandleRef.current.releasePointerCapture(pointerId);
        }
        resizePointerIdRef.current = null;
        document.body.classList.remove('is-resizing-handwriting-pad');
        document.documentElement.classList.remove('is-resizing-handwriting-pad');
        setIsResizing(false);
        resizeScrollContainerRef.current = null;
    }, []);

    const getResizeScrollTop = useCallback(() => {
        const scrollContainer = resizeScrollContainerRef.current;
        if (scrollContainer instanceof HTMLElement) {
            return scrollContainer.scrollTop;
        }

        return typeof window !== 'undefined' ? window.scrollY : 0;
    }, []);

    const scrollResizeContainerBy = useCallback((delta: number) => {
        if (delta === 0) {
            return;
        }

        const scrollContainer = resizeScrollContainerRef.current;
        if (scrollContainer instanceof HTMLElement) {
            scrollContainer.scrollTop += delta;
            return;
        }

        if (typeof window !== 'undefined') {
            window.scrollBy({ top: delta, behavior: 'auto' });
        }
    }, []);

    const updatePadHeightFromClientY = useCallback((clientY: number) => {
        const currentPageY = getResizeScrollTop() + clientY;
        const deltaY = currentPageY - resizeStartPageYRef.current;
        setPadHeight(clampPadHeight(resizeStartHeightRef.current + deltaY));
    }, [clampPadHeight, getResizeScrollTop]);

    const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        const surface = surfaceRef.current;
        if (!surface) {
            return;
        }

        event.preventDefault();
        clearTextSelection();
        resizePointerIdRef.current = event.pointerId;
        resizeLatestClientYRef.current = event.clientY;
        resizeStartHeightRef.current = surface.getBoundingClientRect().height;
        const scrollContainer = surface.closest('.content-area');
        resizeScrollContainerRef.current = scrollContainer instanceof HTMLElement
            ? scrollContainer
            : (typeof window !== 'undefined' ? window : null);
        resizeStartPageYRef.current = getResizeScrollTop() + event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.classList.add('is-resizing-handwriting-pad');
        document.documentElement.classList.add('is-resizing-handwriting-pad');
        setIsResizing(true);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            if (resizePointerIdRef.current !== moveEvent.pointerId) {
                return;
            }

            moveEvent.preventDefault();
            resizeLatestClientYRef.current = moveEvent.clientY;
            updatePadHeightFromClientY(moveEvent.clientY);
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
            if (resizePointerIdRef.current !== upEvent.pointerId) {
                return;
            }

            upEvent.preventDefault();
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            finishResize(upEvent.pointerId);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
    }, [clearTextSelection, finishResize, getResizeScrollTop, updatePadHeightFromClientY]);

    useEffect(() => {
        if (!isResizing || typeof window === 'undefined') {
            resizeAutoScrollFrameRef.current = null;
            return;
        }

        const step = () => {
            const clientY = resizeLatestClientYRef.current;
            const viewportHeight = window.innerHeight;
            let scrollDelta = 0;

            if (clientY >= viewportHeight - RESIZE_AUTO_SCROLL_EDGE_PX) {
                const ratio = Math.min(1, (clientY - (viewportHeight - RESIZE_AUTO_SCROLL_EDGE_PX)) / RESIZE_AUTO_SCROLL_EDGE_PX);
                scrollDelta = RESIZE_AUTO_SCROLL_MAX_STEP * ratio;
            } else if (clientY <= RESIZE_AUTO_SCROLL_EDGE_PX) {
                const ratio = Math.min(1, (RESIZE_AUTO_SCROLL_EDGE_PX - clientY) / RESIZE_AUTO_SCROLL_EDGE_PX);
                scrollDelta = -RESIZE_AUTO_SCROLL_MAX_STEP * ratio;
            }

            if (scrollDelta !== 0) {
                scrollResizeContainerBy(scrollDelta);
                updatePadHeightFromClientY(clientY);
            }

            resizeAutoScrollFrameRef.current = window.requestAnimationFrame(step);
        };

        resizeAutoScrollFrameRef.current = window.requestAnimationFrame(step);
        return () => {
            if (resizeAutoScrollFrameRef.current !== null) {
                window.cancelAnimationFrame(resizeAutoScrollFrameRef.current);
                resizeAutoScrollFrameRef.current = null;
            }
        };
    }, [isResizing, scrollResizeContainerBy, updatePadHeightFromClientY]);

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
            document.body.classList.remove('is-resizing-handwriting-pad');
            document.documentElement.classList.remove('is-resizing-handwriting-pad');
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
                style={padHeight !== null ? { height: `${padHeight}px` } : undefined}
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
            <button
                ref={resizeHandleRef}
                type="button"
                className="handwriting-pad-resize-handle"
                aria-label="手書きメモの高さを調整"
                title="上下にドラッグして高さを調整"
                onPointerDown={handleResizePointerDown}
            >
                <span className="handwriting-pad-resize-bar" />
                <span className="handwriting-pad-resize-text">下端をドラッグして広げる</span>
            </button>
        </div>
    );
};
