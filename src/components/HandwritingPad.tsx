import React, { useCallback, useEffect, useRef, useState } from 'react';

export const HandwritingPad: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const activePointerIdRef = useRef<number | null>(null);
    const isDrawingRef = useRef(false);
    const canvasDprRef = useRef(1);
    const hasStrokeRef = useRef(false);
    const [hasStroke, setHasStroke] = useState(false);

    const setStrokePresence = useCallback((next: boolean) => {
        hasStrokeRef.current = next;
        setHasStroke(next);
    }, []);

    const applyContextStyle = useCallback((ctx: CanvasRenderingContext2D) => {
        const canvas = canvasRef.current;
        const strokeColor = canvas ? getComputedStyle(canvas).getPropertyValue('--text-color').trim() : '';
        const dpr = canvasDprRef.current || 1;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = strokeColor || '#111827';
    }, []);

    const resizeCanvas = useCallback((preserveDrawing: boolean, syncState = true) => {
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
            const ctx = canvas.getContext('2d');
            if (ctx) {
                applyContextStyle(ctx);
            }
            return;
        }

        let snapshot: HTMLCanvasElement | null = null;
        if (preserveDrawing && hasStrokeRef.current && canvas.width > 0 && canvas.height > 0) {
            snapshot = document.createElement('canvas');
            snapshot.width = canvas.width;
            snapshot.height = canvas.height;
            snapshot.getContext('2d')?.drawImage(canvas, 0, 0);
        }

        canvas.width = nextWidth;
        canvas.height = nextHeight;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        canvasDprRef.current = dpr;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, nextWidth, nextHeight);
        if (snapshot) {
            ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, nextWidth, nextHeight);
        }
        applyContextStyle(ctx);
        if (syncState) {
            setStrokePresence(Boolean(snapshot));
        } else {
            hasStrokeRef.current = Boolean(snapshot);
        }
    }, [applyContextStyle, setStrokePresence]);

    const clearCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        applyContextStyle(ctx);
        setStrokePresence(false);
    }, [applyContextStyle, setStrokePresence]);

    const finishStroke = useCallback((pointerId?: number) => {
        const canvas = canvasRef.current;
        if (canvas && pointerId !== undefined && canvas.hasPointerCapture(pointerId)) {
            canvas.releasePointerCapture(pointerId);
        }

        activePointerIdRef.current = null;
        isDrawingRef.current = false;
        canvas?.getContext('2d')?.closePath();
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

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const point = getCanvasPoint(event);
        if (!canvas || !ctx || !point || activePointerIdRef.current !== null) {
            return;
        }

        event.preventDefault();
        activePointerIdRef.current = event.pointerId;
        isDrawingRef.current = true;
        canvas.setPointerCapture(event.pointerId);
        applyContextStyle(ctx);
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        setStrokePresence(true);
    }, [applyContextStyle, getCanvasPoint, setStrokePresence]);

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current || activePointerIdRef.current !== event.pointerId) {
            return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const point = getCanvasPoint(event);
        if (!ctx || !point) {
            return;
        }

        event.preventDefault();
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
    }, [getCanvasPoint]);

    const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        if (activePointerIdRef.current !== event.pointerId) {
            return;
        }

        event.preventDefault();
        finishStroke(event.pointerId);
    }, [finishStroke]);

    useEffect(() => {
        const frameId = window.requestAnimationFrame(() => resizeCanvas(true));

        const handleResize = () => resizeCanvas(true);
        window.addEventListener('resize', handleResize);

        const surface = surfaceRef.current;
        let observer: ResizeObserver | null = null;
        if (surface && typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => resizeCanvas(true));
            observer.observe(surface);
        }

        return () => {
            window.cancelAnimationFrame(frameId);
            window.removeEventListener('resize', handleResize);
            observer?.disconnect();
        };
    }, [resizeCanvas]);

    return (
        <div className="handwriting-pad-section">
            <div className="handwriting-pad-header">
                <div>
                    <span className="handwriting-pad-title">手書きメモ</span>
                    <p className="handwriting-pad-hint">ここに指やペンで書けます。保存はされません。</p>
                </div>
                <button
                    type="button"
                    className="nav-btn handwriting-pad-clear-btn"
                    onClick={clearCanvas}
                >
                    全消し
                </button>
            </div>
            <div ref={surfaceRef} className="handwriting-pad-surface">
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
