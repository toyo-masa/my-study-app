import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Grid3X3,
    Mail,
    Cloud,
    FileText,
    Table,
    Presentation,
    Book,
    CheckSquare,
    Calendar
} from 'lucide-react';

interface AppItem {
    name: string;
    icon: React.ReactNode;
    color: string;
}

const apps: AppItem[] = [
    { name: 'Outlook', icon: <Mail size={24} />, color: '#0078d4' },
    { name: 'OneDrive', icon: <Cloud size={24} />, color: '#0078d4' },
    { name: 'Word', icon: <FileText size={24} />, color: '#2b579a' },
    { name: 'Excel', icon: <Table size={24} />, color: '#217346' },
    { name: 'PowerPoint', icon: <Presentation size={24} />, color: '#b7472a' },
    { name: 'OneNote', icon: <Book size={24} />, color: '#7719aa' },
    { name: 'To Do', icon: <CheckSquare size={24} />, color: '#3c6df0' },
    { name: 'Calendar', icon: <Calendar size={24} />, color: '#0078d4' },
];

export const AppLauncher: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

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
                            <span className="launcher-title">My Application</span>
                        </div>

                        <div className="launcher-grid">
                            {apps.map((app) => (
                                <motion.div
                                    key={app.name}
                                    className="launcher-item"
                                    whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)' }}
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
