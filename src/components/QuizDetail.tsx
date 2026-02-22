import React, { useEffect, useState } from 'react';
import type { QuizSet, QuizHistory } from '../types';
import { getHistories } from '../db';
import { ArrowLeft, Play, Clock, CheckCircle, RotateCw, Shuffle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingView } from './LoadingView';

export interface QuizSetSettings {
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
}

interface QuizDetailProps {
    quizSet: QuizSet & { questionCount: number; categories: string[] };
    onBack: () => void;
    onStart: () => void;
    onSelectHistory: (history: QuizHistory) => void;
    hasSuspendedSession: boolean;
    onResume: () => void;
    settings: QuizSetSettings;
    onSettingsChange: (settings: QuizSetSettings) => void;
}

export const QuizDetail: React.FC<QuizDetailProps> = ({
    quizSet,
    onBack,
    onStart,
    onSelectHistory,
    hasSuspendedSession,
    onResume,
    settings,
    onSettingsChange,
}) => {
    const [histories, setHistories] = useState<QuizHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [localSettings, setLocalSettings] = useState<QuizSetSettings>(settings);

    const currentTags = quizSet.tags || [];

    const handleSettingsChange = (newSettings: QuizSetSettings) => {
        setLocalSettings(newSettings);
        onSettingsChange(newSettings);
    };

    useEffect(() => {
        const loadHistories = async () => {
            if (quizSet.id !== undefined) {
                const data = await getHistories(quizSet.id);
                setHistories(data);
            }
            setLoading(false);
        };
        loadHistories();
    }, [quizSet.id]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}分${secs}秒`;
    };

    return (
        <div className="quiz-detail-container">
            <div className="detail-header">
                <button className="nav-btn" onClick={onBack}>
                    <ArrowLeft size={16} /> 戻る
                </button>
                <h1>{quizSet.name}</h1>
            </div>

            <div className="detail-content">
                <div className="detail-info-card">
                    <div className="info-row">
                        <span className="info-label">問題数</span>
                        <span className="info-value">{quizSet.questionCount}問</span>
                    </div>
                    {currentTags.length > 0 && (
                        <div className="info-row" style={{ alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, paddingTop: '0.5rem' }}>
                                <div className="info-tags" style={{ flexWrap: 'wrap' }}>
                                    {currentTags.map(tag => (
                                        <span key={tag} className="tag">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 出題設定 */}
                    <div className="quiz-settings-row">
                        <label className={`quiz-setting-chip ${localSettings.shuffleQuestions ? 'active' : ''}`}>
                            <input
                                type="checkbox"
                                checked={localSettings.shuffleQuestions}
                                onChange={(e) => handleSettingsChange({ ...localSettings, shuffleQuestions: e.target.checked })}
                            />
                            <Shuffle size={14} />
                            <span>出題順ランダム</span>
                        </label>
                        <label className={`quiz-setting-chip ${localSettings.shuffleOptions ? 'active' : ''}`}>
                            <input
                                type="checkbox"
                                checked={localSettings.shuffleOptions}
                                onChange={(e) => handleSettingsChange({ ...localSettings, shuffleOptions: e.target.checked })}
                            />
                            <Shuffle size={14} />
                            <span>選択肢ランダム</span>
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        {hasSuspendedSession && (
                            <button className="start-test-btn-large secondary" onClick={onResume} style={{ flex: 1, backgroundColor: 'var(--success-color, #10b981)' }}>
                                <RotateCw size={20} /> 中断から再開
                            </button>
                        )}
                        <button className="start-test-btn-large" onClick={onStart} style={{ flex: 1 }}>
                            <Play size={20} fill="currentColor" /> {hasSuspendedSession ? '新しく始める' : 'テストを開始する'}
                        </button>
                    </div>
                </div>

                <div className="history-section">
                    <h2>解答履歴</h2>
                    <AnimatePresence mode="wait">
                        {loading ? (
                            <LoadingView key="loading" message="履歴を読み込み中..." />
                        ) : histories.length > 0 ? (
                            <motion.div
                                key="history-list"
                                className="history-list"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                {histories.map((history) => (
                                    <motion.div
                                        key={history.id}
                                        className="history-item clickable"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        onClick={() => onSelectHistory(history)}
                                    >
                                        <div className="history-header">
                                            <span className="history-date">
                                                {new Date(history.date).toLocaleString('ja-JP', {
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </span>
                                            {history.mode === 'review_wrong' && <span className="mode-badge wrong">復習（誤りのみ）</span>}
                                            {(history.mode === 'review_weak' || history.mode === 'review_weak_strict') && <span className="mode-badge weak">復習(苦手)</span>}
                                            {history.mode === 'review_due' && <span className="mode-badge weak">復習</span>}
                                        </div>
                                        <div className="history-stats">
                                            <div className="stat-pill score">
                                                <CheckCircle size={14} />
                                                {Math.round((history.correctCount / history.totalCount) * 100)}% 正解
                                                <span className="stat-sub">({history.correctCount}/{history.totalCount})</span>
                                            </div>
                                            <div className="stat-pill time">
                                                <Clock size={14} />
                                                {formatTime(history.durationSeconds)}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="empty-history"
                                className="empty-history"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                <p>まだ履歴がありません</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};
