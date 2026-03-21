import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Grid3X3,
    BarChart3,
    CalendarCheck2,
    GraduationCap,
    ShieldCheck,
    FileText,
    Bot,
} from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';

interface AppItem {
    id: string;
    name: string;
    icon: React.ReactNode;
    color: string;
    requiresAdmin?: boolean;
}

const apps: AppItem[] = [
    { id: 'distribution-sim', name: '分布シミュレーション', icon: <BarChart3 size={24} />, color: '#6366f1' },
    { id: 'distribution-tables', name: '統計分布表', icon: <FileText size={24} />, color: '#8b5cf6' },
    { id: 'local-llm-chat', name: 'ローカルLLMチャット（試作）', icon: <Bot size={24} />, color: '#f59e0b' },
    { id: 'review-board', name: '復習ボード（試作）', icon: <CalendarCheck2 size={24} />, color: '#0d9488' },
    { id: 'tutorial', name: 'チュートリアル', icon: <GraduationCap size={24} />, color: '#2563eb' },
    { id: 'admin', name: '管理コンソール', icon: <ShieldCheck size={24} />, color: '#dc2626', requiresAdmin: true },
];

interface AppLauncherProps {
    onOpenApp?: (appId: string) => void;
}

export const AppLauncher: React.FC<AppLauncherProps> = ({ onOpenApp }) => {
    const { currentUser } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const visibleApps = apps.filter(app => !app.requiresAdmin || !!currentUser?.isAdmin);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleAppClick = (appId: string) => {
        setIsOpen(false);
        onOpenApp?.(appId);
    };

    return (
        <div className="app-launcher" ref={menuRef}>
            <motion.button
                className={`launcher-trigger ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                aria-label="アプリ起動ツール"
                data-tooltip="アプリを起動"
            >
                <Grid3X3 size={24} />
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="launcher-menu"
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                    >
                        <div className="launcher-header">
                            <span className="launcher-title">アプリ一覧</span>
                        </div>

                        <div className="launcher-grid">
                            {visibleApps.map((app) => (
                                <motion.div
                                    key={app.id}
                                    className="launcher-item"
                                    whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)' }}
                                    onClick={() => handleAppClick(app.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="item-icon" style={{ color: app.color }}>
                                        {app.icon}
                                    </div>
                                    <span className="item-name">{app.name}</span>
                                </motion.div>
                            ))}
                        </div>

                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
