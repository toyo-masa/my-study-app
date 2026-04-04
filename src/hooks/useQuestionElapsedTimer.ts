import { useCallback, useEffect, useRef, useState } from 'react';

const TICK_INTERVAL_MS = 1000;

function normalizeQuestionElapsedMsById(
    value: Record<string, number> | undefined
): Record<string, number> {
    if (!value) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(value).flatMap(([questionId, elapsedMs]) => {
            if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
                return [];
            }
            return [[questionId, Math.round(elapsedMs)]];
        })
    );
}

export function useQuestionElapsedTimer(currentQuestionId: number | undefined, shouldTrack: boolean) {
    const [questionElapsedMsById, setQuestionElapsedMsByIdState] = useState<Record<string, number>>({});
    const [currentQuestionElapsedSeconds, setCurrentQuestionElapsedSeconds] = useState<number | null>(null);
    const questionElapsedMsByIdRef = useRef<Record<string, number>>({});
    const activeQuestionIdRef = useRef<number | null>(null);
    const activeStartedAtRef = useRef<number | null>(null);

    const calculateCurrentQuestionElapsedSecondsSnapshot = useCallback((
        targetQuestionId: number | undefined = currentQuestionId,
        targetShouldTrack: boolean = shouldTrack
    ): number | null => {
        if (!targetShouldTrack || typeof targetQuestionId !== 'number') {
            return null;
        }

        const questionKey = String(targetQuestionId);
        const baseElapsedMs = questionElapsedMsByIdRef.current[questionKey] || 0;
        const activeElapsedMs = activeQuestionIdRef.current === targetQuestionId && activeStartedAtRef.current !== null
            ? Math.max(0, Date.now() - activeStartedAtRef.current)
            : 0;

        return Math.floor((baseElapsedMs + activeElapsedMs) / 1000);
    }, [currentQuestionId, shouldTrack]);

    const replaceQuestionElapsedMsById = useCallback((value: Record<string, number> | undefined) => {
        activeQuestionIdRef.current = null;
        activeStartedAtRef.current = null;
        const normalized = normalizeQuestionElapsedMsById(value);
        questionElapsedMsByIdRef.current = normalized;
        setQuestionElapsedMsByIdState(normalized);
        setCurrentQuestionElapsedSeconds(calculateCurrentQuestionElapsedSecondsSnapshot());
    }, [calculateCurrentQuestionElapsedSecondsSnapshot]);

    const resetQuestionElapsedMsById = useCallback(() => {
        replaceQuestionElapsedMsById({});
    }, [replaceQuestionElapsedMsById]);

    const commitActiveQuestionElapsedMs = useCallback((commitState: boolean) => {
        const activeQuestionId = activeQuestionIdRef.current;
        const activeStartedAt = activeStartedAtRef.current;
        if (activeQuestionId === null || activeStartedAt === null) {
            return questionElapsedMsByIdRef.current;
        }

        const elapsedMs = Math.max(0, Date.now() - activeStartedAt);
        if (elapsedMs <= 0) {
            return questionElapsedMsByIdRef.current;
        }

        const questionKey = String(activeQuestionId);
        const nextMap = {
            ...questionElapsedMsByIdRef.current,
            [questionKey]: (questionElapsedMsByIdRef.current[questionKey] || 0) + elapsedMs,
        };
        questionElapsedMsByIdRef.current = nextMap;
        if (commitState) {
            setQuestionElapsedMsByIdState(nextMap);
        }
        return nextMap;
    }, []);

    const getQuestionElapsedMsSnapshot = useCallback(() => {
        const activeQuestionId = activeQuestionIdRef.current;
        const activeStartedAt = activeStartedAtRef.current;
        if (activeQuestionId === null || activeStartedAt === null) {
            return questionElapsedMsByIdRef.current;
        }

        const elapsedMs = Math.max(0, Date.now() - activeStartedAt);
        if (elapsedMs <= 0) {
            return questionElapsedMsByIdRef.current;
        }

        const questionKey = String(activeQuestionId);
        return {
            ...questionElapsedMsByIdRef.current,
            [questionKey]: (questionElapsedMsByIdRef.current[questionKey] || 0) + elapsedMs,
        };
    }, []);

    useEffect(() => {
        commitActiveQuestionElapsedMs(true);
        activeQuestionIdRef.current = null;
        activeStartedAtRef.current = null;

        if (shouldTrack && typeof currentQuestionId === 'number') {
            const startedAt = Date.now();
            activeQuestionIdRef.current = currentQuestionId;
            activeStartedAtRef.current = startedAt;
        }

        const timeoutId = window.setTimeout(() => {
            setCurrentQuestionElapsedSeconds(
                calculateCurrentQuestionElapsedSecondsSnapshot(currentQuestionId, shouldTrack)
            );
        }, 0);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [calculateCurrentQuestionElapsedSecondsSnapshot, commitActiveQuestionElapsedMs, currentQuestionId, shouldTrack]);

    useEffect(() => {
        return () => {
            commitActiveQuestionElapsedMs(false);
        };
    }, [commitActiveQuestionElapsedMs]);

    useEffect(() => {
        if (!shouldTrack || typeof currentQuestionId !== 'number') {
            return;
        }

        const intervalId = window.setInterval(() => {
            setCurrentQuestionElapsedSeconds(
                calculateCurrentQuestionElapsedSecondsSnapshot(currentQuestionId, shouldTrack)
            );
        }, TICK_INTERVAL_MS);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [calculateCurrentQuestionElapsedSecondsSnapshot, currentQuestionId, shouldTrack]);

    return {
        currentQuestionElapsedSeconds,
        getQuestionElapsedMsSnapshot,
        questionElapsedMsById,
        replaceQuestionElapsedMsById,
        resetQuestionElapsedMsById,
    };
}
