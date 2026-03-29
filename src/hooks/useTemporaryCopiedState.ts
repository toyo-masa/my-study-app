import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_COPIED_STATE_DURATION_MS = 2000;

export const useTemporaryCopiedState = (durationMs = DEFAULT_COPIED_STATE_DURATION_MS) => {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const timeoutRef = useRef<number | null>(null);

    const clearCopied = useCallback(() => {
        if (timeoutRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = null;
        setCopiedKey(null);
    }, []);

    const markCopied = useCallback((key: string) => {
        clearCopied();
        setCopiedKey(key);

        if (typeof window === 'undefined') {
            return;
        }

        timeoutRef.current = window.setTimeout(() => {
            timeoutRef.current = null;
            setCopiedKey(null);
        }, durationMs);
    }, [clearCopied, durationMs]);

    useEffect(() => () => {
        if (timeoutRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(timeoutRef.current);
        }
    }, []);

    return {
        copiedKey,
        markCopied,
        clearCopied,
    };
};
