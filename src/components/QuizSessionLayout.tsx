import React from 'react';
import { Menu, ArrowLeft, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingView } from './LoadingView';

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
    children,
}) => {
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
                {showRightPanel && showRightPanelToggle && onToggleRightPanel && (
                    <div className="header-right">
                        <button
                            className={`menu-btn right-panel-toggle-btn ${rightPanelOpen ? 'active' : ''}`}
                            onClick={onToggleRightPanel}
                            aria-label="AIチャットを開く"
                            title="AIチャット"
                        >
                            <Bot size={18} />
                        </button>
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
                            style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}
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

                            <main className={`content-area ${showRightPanel ? 'with-right-panel' : ''}`}>{children}</main>

                            <AnimatePresence>
                                {showRightPanel && rightPanelModal && rightPanelOpen && (
                                    <motion.div
                                        className="right-panel-overlay"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        onClick={onCloseRightPanel}
                                    />
                                )}
                            </AnimatePresence>

                            {showRightPanel && (
                                <aside
                                    className={`right-panel-container ${rightPanelModal ? 'modal' : 'docked'} ${rightPanelOpen ? 'open' : 'closed'}`}
                                >
                                    {rightPanelContent}
                                </aside>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};
