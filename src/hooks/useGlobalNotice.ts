import { useCallback, useEffect, useRef, useState } from 'react';

export interface GlobalNotice {
    text: string;
    type: 'success' | 'error';
}

const GLOBAL_NOTICE_DURATION_MS = 3000;

export function useGlobalNotice() {
    const [globalNotice, setGlobalNotice] = useState<GlobalNotice | null>(null);
    const globalNoticeTimeoutRef = useRef<number | null>(null);

    const showGlobalNotice = useCallback((text: string, type: 'success' | 'error') => {
        if (globalNoticeTimeoutRef.current !== null) {
            window.clearTimeout(globalNoticeTimeoutRef.current);
            globalNoticeTimeoutRef.current = null;
        }

        setGlobalNotice({ text, type });
        globalNoticeTimeoutRef.current = window.setTimeout(() => {
            setGlobalNotice(null);
            globalNoticeTimeoutRef.current = null;
        }, GLOBAL_NOTICE_DURATION_MS);
    }, []);

    useEffect(() => {
        return () => {
            if (globalNoticeTimeoutRef.current !== null) {
                window.clearTimeout(globalNoticeTimeoutRef.current);
                globalNoticeTimeoutRef.current = null;
            }
        };
    }, []);

    return {
        globalNotice,
        showGlobalNotice,
    };
}
