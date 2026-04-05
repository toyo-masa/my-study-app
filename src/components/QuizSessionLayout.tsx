import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, ArrowLeft, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingView } from './LoadingView';

const RIGHT_PANEL_WIDTH_STORAGE_KEY = 'quizSessionRightPanelWidth';
const DEFAULT_RIGHT_PANEL_WIDTH = 380;
const MIN_RIGHT_PANEL_WIDTH = 320;
const MAX_RIGHT_PANEL_WIDTH = 720;

const normalizeRightPanelWidth = (value: number) => {
    if (!Number.isFinite(value)) {
        return DEFAULT_RIGHT_PANEL_WIDTH;
    }

    return Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, Math.round(value)));
};

const loadStoredRightPanelWidth = () => {
    if (typeof window === 'undefined') {
        return DEFAULT_RIGHT_PANEL_WIDTH;
    }

    const raw = window.localStorage.getItem(RIGHT_PANEL_WIDTH_STORAGE_KEY);
    if (raw === null) {
        return DEFAULT_RIGHT_PANEL_WIDTH;
    }

    const parsed = Number.parseFloat(raw);
    return normalizeRightPanelWidth(parsed);
};

interface QuizSessionLayoutProps {
    title: string;
    isLoading: boolean;
    sidebarOpen: boolean;
    showSidebar: boolean;
    onBack: () => void;
    sessionBadge?: string;
    hideMenuButton?: boolean;
    onToggleSidebar: () => void;
    onCloseSidebar: () => void;
    sidebarContent: React.ReactNode;
    showRightPanel?: boolean;
    rightPanelOpen?: boolean;
    rightPanelModal?: boolean;
    showRightPanelToggle?: boolean;
    onToggleRightPanel?: () => void;
    onCloseRightPanel?: () => void;
    rightPanelContent?: React.ReactNode;
    headerActions?: React.ReactNode;
    children: React.ReactNode;
}

export const QuizSessionLayout: React.FC<QuizSessionLayoutProps> = ({
    title,
    isLoading,
    sidebarOpen,
    showSidebar,
    onBack,
    sessionBadge,
    hideMenuButton,
    onToggleSidebar,
    onCloseSidebar,
    sidebarContent,
    showRightPanel = false,
    rightPanelOpen = false,
    rightPanelModal = false,
    showRightPanelToggle = false,
    onToggleRightPanel,
    onCloseRightPanel,
    rightPanelContent,
    headerActions,
    children,
}) => {
    const showDockedRightPanel = showRightPanel && !rightPanelModal;
    const showModalRightPanel = showRightPanel && rightPanelModal;
    const showAiToggle = showRightPanel && showRightPanelToggle && onToggleRightPanel;
    const shouldShowHeaderRight = Boolean(headerActions) || Boolean(showAiToggle);
    const [rightPanelWidth, setRightPanelWidth] = useState(loadStoredRightPanelWidth);
    const draggingPointerIdRef = useRef<number | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(RIGHT_PANEL_WIDTH_STORAGE_KEY, String(rightPanelWidth));
    }, [rightPanelWidth]);

    const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!showDockedRightPanel || !rightPanelOpen) {
            return;
        }

        draggingPointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const viewportWidth = window.innerWidth;
            const nextWidth = normalizeRightPanelWidth(viewportWidth - moveEvent.clientX);
            setRightPanelWidth(nextWidth);
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
            if (draggingPointerIdRef.current !== upEvent.pointerId) {
                return;
            }

            draggingPointerIdRef.current = null;
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            document.body.classList.remove('is-resizing-right-panel');
        };

        document.body.classList.add('is-resizing-right-panel');
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
    }, [rightPanelOpen, showDockedRightPanel]);

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button
                        className="nav-btn quiz-session-back-btn"
                        onClick={onBack}
                        aria-label="戻る"
                        title="戻る"
                    >
                        <ArrowLeft size={16} />
                        戻る
                    </button>
                    {!hideMenuButton && (
                        <button className="menu-btn" onClick={onToggleSidebar}>
                            <Menu />
                        </button>
                    )}
                    <div className="header-title-wrap">
                        <h1>{title}</h1>
                        {sessionBadge && <span className="session-mode-badge">{sessionBadge}</span>}
                    </div>
                </div>
                {shouldShowHeaderRight && (
                    <div className="header-right">
                        {headerActions}
                        {showAiToggle && (
                            <button
                                className={`menu-btn right-panel-toggle-btn ${rightPanelOpen ? 'active' : ''}`}
                                onClick={onToggleRightPanel}
                                aria-label="AIチャットを開く"
                                title="AIチャット"
                            >
                                <Bot size={18} />
                            </button>
                        )}
                    </div>
                )}
            </header>

            <div className="main-layout">
                <AnimatePresence mode="wait">
                    {isLoading ? (
                        <LoadingView key="loader" />
                    ) : (
                        <motion.div
                            key="content"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, width: '100%', overflow: 'hidden' }}
                        >
                            <AnimatePresence>
                                {sidebarOpen && showSidebar && (
                                    <motion.div
                                        className="sidebar-overlay"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        onClick={onCloseSidebar}
                                    />
                                )}
                            </AnimatePresence>

                            {showSidebar && (
                                <aside className={`sidebar-container ${sidebarOpen ? 'open' : 'closed'}`}>
                                    {sidebarContent}
                                </aside>
                            )}

                            <main className={`content-area ${showDockedRightPanel && rightPanelOpen ? 'with-right-panel' : ''}`}>{children}</main>

                            {showDockedRightPanel && (
                                <>
                                    {rightPanelOpen && (
                                        <div
                                            className="right-panel-resizer"
                                            onPointerDown={handleResizePointerDown}
                                            role="separator"
                                            aria-orientation="vertical"
                                            aria-label="AIチャット幅を調整"
                                        />
                                    )}
                                    <aside
                                        className={`right-panel-container docked ${rightPanelOpen ? 'open' : 'closed'}`}
                                        style={rightPanelOpen ? { width: `${rightPanelWidth}px` } : undefined}
                                    >
                                        {rightPanelContent}
                                    </aside>
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {showModalRightPanel && (
                <>
                    <AnimatePresence>
                        {rightPanelOpen && (
                            <motion.div
                                className="right-panel-overlay"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={onCloseRightPanel}
                            />
                        )}
                    </AnimatePresence>

                    <aside
                        className={`right-panel-container modal ${rightPanelOpen ? 'open' : 'closed'}`}
                        aria-hidden={!rightPanelOpen}
                    >
                        {rightPanelContent}
                    </aside>
                </>
            )}
        </>
    );
};
