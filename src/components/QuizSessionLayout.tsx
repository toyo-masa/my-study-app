import React from 'react';
import { Menu, ArrowLeft } from 'lucide-react';
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

                            <main className="content-area">{children}</main>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};
