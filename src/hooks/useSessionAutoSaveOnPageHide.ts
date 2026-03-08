import { useEffect } from 'react';

export function useSessionAutoSaveOnPageHide(autoSaveRef: { current: () => void }): void {
    useEffect(() => {
        const runAutoSave = () => autoSaveRef.current();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                runAutoSave();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', runAutoSave);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', runAutoSave);
        };
    }, [autoSaveRef]);
}
