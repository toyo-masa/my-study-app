import { useCallback, useEffect, useRef, useState } from 'react';
import { clearWindowTimeout } from '../utils/quizSession';

export type SessionPointerNotice = {
    message: string;
    x: number;
    y: number;
};

export type SessionNoticeClickPosition = {
    x: number;
    y: number;
};

const SESSION_NOTICE_DURATION_MS = 1800;

export function useSessionNotices() {
    const [sessionInlineNotice, setSessionInlineNotice] = useState<string | null>(null);
    const [sessionPointerNotice, setSessionPointerNotice] = useState<SessionPointerNotice | null>(null);
    const sessionInlineNoticeTimeoutRef = useRef<number | null>(null);
    const sessionPointerNoticeTimeoutRef = useRef<number | null>(null);

    const resetSessionNotices = useCallback(() => {
        clearWindowTimeout(sessionInlineNoticeTimeoutRef);
        clearWindowTimeout(sessionPointerNoticeTimeoutRef);
        setSessionInlineNotice(null);
        setSessionPointerNotice(null);
    }, []);

    const flashSessionInlineNotice = useCallback((message: string) => {
        clearWindowTimeout(sessionInlineNoticeTimeoutRef);
        setSessionInlineNotice(message);
        sessionInlineNoticeTimeoutRef.current = window.setTimeout(() => {
            setSessionInlineNotice(null);
            sessionInlineNoticeTimeoutRef.current = null;
        }, SESSION_NOTICE_DURATION_MS);
    }, []);

    const flashSessionPointerNotice = useCallback((message: string, clickPosition?: SessionNoticeClickPosition) => {
        if (!clickPosition) {
            return;
        }

        clearWindowTimeout(sessionPointerNoticeTimeoutRef);
        const maxNoticeWidth = 320;
        const x = Math.min(Math.max(clickPosition.x + 14, 8), window.innerWidth - maxNoticeWidth - 8);
        const y = Math.min(Math.max(clickPosition.y + 14, 72), window.innerHeight - 44);
        setSessionPointerNotice({ message, x, y });
        sessionPointerNoticeTimeoutRef.current = window.setTimeout(() => {
            setSessionPointerNotice(null);
            sessionPointerNoticeTimeoutRef.current = null;
        }, SESSION_NOTICE_DURATION_MS);
    }, []);

    useEffect(() => {
        return () => {
            clearWindowTimeout(sessionInlineNoticeTimeoutRef);
            clearWindowTimeout(sessionPointerNoticeTimeoutRef);
        };
    }, []);

    return {
        sessionInlineNotice,
        sessionPointerNotice,
        resetSessionNotices,
        flashSessionInlineNotice,
        flashSessionPointerNotice,
    };
}
