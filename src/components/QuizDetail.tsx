import React, { useEffect, useMemo, useState } from 'react';
import type { QuizSet, QuizHistory } from '../types';
import { getHistories } from '../db';
import { ArrowLeft, Play, Clock, CheckCircle, RotateCw, Table2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingView } from './LoadingView';
import type { QuizSetSettings } from '../utils/quizSettings';

const INITIAL_VISIBLE_HISTORY_COUNT = 10;
const HISTORY_BATCH_SIZE = 10;

interface QuizDetailProps {
    quizSet: QuizSet & { questionCount: number; categories: string[] };
    onBack: () => void;
    onStart: () => void;
    onSelectHistory: (history: QuizHistory) => void;
    onOpenHistoryTable: () => void;
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
    onOpenHistoryTable,
    hasSuspendedSession,
    onResume,
    settings,
    onSettingsChange,
}) => {
    const [histories, setHistories] = useState<QuizHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [visibleHistoryCount, setVisibleHistoryCount] = useState(INITIAL_VISIBLE_HISTORY_COUNT);

    const currentTags = quizSet.tags || [];
    const feedbackBlockSizeMax = Math.max(1, quizSet.questionCount);

    const normalizedSettings = useMemo<QuizSetSettings>(() => {
        const normalizedSize = Math.min(
            feedbackBlockSizeMax,
            Math.max(1, Math.round(settings.feedbackBlockSize || 1)),
        );
        return {
            ...settings,
            feedbackTimingMode: 'delayed_block',
            feedbackBlockSize: normalizedSize,
        };
    }, [settings, feedbackBlockSizeMax]);

    const handleSettingsChange = (newSettings: QuizSetSettings) => {
        onSettingsChange({
            ...newSettings,
            feedbackTimingMode: 'delayed_block',
            feedbackBlockSize: Math.min(
                feedbackBlockSizeMax,
                Math.max(1, Math.round(newSettings.feedbackBlockSize || 1)),
            ),
        });
    };

    const handleFeedbackBlockSizeChange = (value: number) => {
        const normalized = Math.min(feedbackBlockSizeMax, Math.max(1, Math.round(value)));
        handleSettingsChange({ ...normalizedSettings, feedbackBlockSize: normalized });
    };

    useEffect(() => {
        const normalizedSize = Math.min(
            feedbackBlockSizeMax,
            Math.max(1, Math.round(settings.feedbackBlockSize || 1)),
        );
        if (settings.feedbackTimingMode !== 'delayed_block' || settings.feedbackBlockSize !== normalizedSize) {
            const nextSettings: QuizSetSettings = {
                ...settings,
                feedbackTimingMode: 'delayed_block',
                feedbackBlockSize: normalizedSize,
            };
            onSettingsChange(nextSettings);
        }
    }, [settings, onSettingsChange, feedbackBlockSizeMax]);

    useEffect(() => {
        const loadHistories = async () => {
            if (quizSet.id !== undefined) {
                const data = await getHistories(quizSet.id);
                setHistories(data);
                setVisibleHistoryCount(INITIAL_VISIBLE_HISTORY_COUNT);
            }
            setLoading(false);
        };
        loadHistories();
    }, [quizSet.id]);

    const sortedHistories = useMemo(() => {
        return [...histories].sort((a, b) => {
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
    }, [histories]);

    const visibleHistories = sortedHistories.slice(0, visibleHistoryCount);
    const hasHiddenHistories = visibleHistoryCount < sortedHistories.length;
    const isHistoryExpanded = visibleHistoryCount > INITIAL_VISIBLE_HISTORY_COUNT;

    const showMoreHistories = () => {
        setVisibleHistoryCount((prev) => Math.min(prev + HISTORY_BATCH_SIZE, sortedHistories.length));
    };

    const collapseHistories = () => {
        setVisibleHistoryCount(INITIAL_VISIBLE_HISTORY_COUNT);
    };

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
                    {currentTags.length > 0 && (
                        <div className="info-tags" aria-label="タグ">
                            {currentTags.map(tag => (
                                <span key={tag} className="tag">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="quiz-count-row">
                        <span className="info-label">問題数</span>
                        <span className="info-value compact">{quizSet.questionCount}問</span>
                    </div>

                    <div className="quiz-setup-grid">
                        <div className="quiz-setup-row">
                            <span className="quiz-setup-label">ランダム設定</span>
                            <div className="quiz-setup-controls">
                                <label className={`quiz-setting-chip compact ${normalizedSettings.shuffleQuestions ? 'active' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={normalizedSettings.shuffleQuestions}
                                        onChange={(e) => handleSettingsChange({ ...normalizedSettings, shuffleQuestions: e.target.checked })}
                                    />
                                    出題順ランダム
                                </label>
                                <label className={`quiz-setting-chip compact ${normalizedSettings.shuffleOptions ? 'active' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={normalizedSettings.shuffleOptions}
                                        onChange={(e) => handleSettingsChange({ ...normalizedSettings, shuffleOptions: e.target.checked })}
                                    />
                                    選択肢ランダム
                                </label>
                            </div>
                        </div>
                        <div className="quiz-setup-row">
                            <span className="quiz-setup-label">回答表示間隔</span>
                            <div className="quiz-feedback-inline-controls">
                                <input
                                    type="number"
                                    min={1}
                                    max={feedbackBlockSizeMax}
                                    step={1}
                                    className="field-input quiz-feedback-size-input"
                                    value={normalizedSettings.feedbackBlockSize}
                                    onChange={(e) => handleFeedbackBlockSizeChange(Number(e.target.value))}
                                />
                                <span className="quiz-feedback-size-help">問（1〜{feedbackBlockSizeMax}）</span>
                            </div>
                        </div>
                        <div className="mode-settings-divider" aria-hidden="true" />
                    </div>

                    <div className="quiz-start-actions">
                        {hasSuspendedSession && (
                            <button className="start-test-btn-large secondary" onClick={onResume} style={{ backgroundColor: 'var(--success-color, #10b981)' }}>
                                <RotateCw size={20} /> 中断から再開
                            </button>
                        )}
                        <button className="start-test-btn-large" onClick={onStart}>
                            <Play size={20} fill="currentColor" /> {hasSuspendedSession ? '新しく始める' : 'テストを開始する'}
                        </button>
                    </div>
                </div>

                <div className="history-section">
                    <div className="history-section-header">
                        <h2>解答履歴</h2>
                        <button
                            type="button"
                            className="nav-btn history-table-open-btn"
                            onClick={onOpenHistoryTable}
                            disabled={loading || histories.length === 0}
                        >
                            <Table2 size={15} />
                            問題ごとの回答履歴を見る
                        </button>
                    </div>
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
                                {visibleHistories.map((history) => (
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
                                            {history.feedbackTimingMode === 'delayed_block' && <span className="mode-badge weak">遅延（件数）</span>}
                                            {history.feedbackTimingMode === 'delayed_end' && <span className="mode-badge weak">遅延（まとめ）</span>}
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
                                {sortedHistories.length > INITIAL_VISIBLE_HISTORY_COUNT && (
                                    <div style={{ width: '100%', textAlign: 'center', marginTop: '0.5rem' }}>
                                        {hasHiddenHistories && (
                                            <button className="nav-btn" onClick={showMoreHistories}>
                                                さらに{Math.min(HISTORY_BATCH_SIZE, sortedHistories.length - visibleHistoryCount)}件表示
                                            </button>
                                        )}
                                        {isHistoryExpanded && (
                                            <button
                                                className="nav-btn"
                                                onClick={collapseHistories}
                                                style={{ marginLeft: hasHiddenHistories ? '0.75rem' : 0 }}
                                            >
                                                最新{INITIAL_VISIBLE_HISTORY_COUNT}件に戻す
                                            </button>
                                        )}
                                        <div style={{ marginTop: '0.65rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            表示中: {visibleHistories.length} / {sortedHistories.length} 件
                                        </div>
                                    </div>
                                )}
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
