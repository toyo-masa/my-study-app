import React from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface LoadingViewProps {
    message?: string;
    fullPage?: boolean;
}

export const LoadingView: React.FC<LoadingViewProps> = ({
    message = "読み込み中...",
    fullPage = false
}) => {
    const content = (
        <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: fullPage ? '100vh' : '100%',
                gap: '1rem',
                padding: '2rem'
            }}
        >
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                style={{ display: 'flex' }}
            >
                <Loader2 size={40} color="var(--primary-color)" />
            </motion.div>
            <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="loading-text"
                style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    fontWeight: 500
                }}
            >
                {message}
            </motion.div>
        </motion.div>
    );

    if (fullPage) {
        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'var(--bg-color)',
                backdropFilter: 'blur(4px)',
                zIndex: 9999,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            }}>
                {content}
            </div>
        );
    }

    return content;
};
