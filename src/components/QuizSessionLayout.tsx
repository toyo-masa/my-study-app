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
    onToggleSidebar,
    onCloseSidebar,
    sidebarContent,
    children,
}) => {
    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <button className="menu-btn" onClick={onBack}>
                        <ArrowLeft size={20} />
                    </button>
                    <button className="menu-btn" onClick={onToggleSidebar}>
                        <Menu />
                    </button>
                    <h1>{title}</h1>
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
                            style={{ flex: 1, display: 'flex', minHeight: 0 }}
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
