import React, { useEffect, useState } from 'react';
import type { QuizSet, QuizHistory } from '../types';
import { getHistories } from '../db';
import { ArrowLeft, Play, Clock, CheckCircle, RotateCw, Shuffle, X, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

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
    onUpdateQuizSet: (quizSetId: number, changes: Partial<QuizSet>) => Promise<void>;
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
    onUpdateQuizSet,
}) => {
    const [histories, setHistories] = useState<QuizHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [localSettings, setLocalSettings] = useState<QuizSetSettings>(settings);

    const [newTagInput, setNewTagInput] = useState('');

    const currentTags = quizSet.tags || [];

    const handleAddTag = async () => {
        const trimmed = newTagInput.trim();
        if (trimmed && !currentTags.includes(trimmed)) {
            const finalTags = [...currentTags, trimmed];
            if (quizSet.id !== undefined) {
                await onUpdateQuizSet(quizSet.id, { tags: finalTags });
            }
            setNewTagInput('');
        }
    };

    const handleRemoveTag = async (tagToRemove: string) => {
        const finalTags = currentTags.filter(t => t !== tagToRemove);
        if (quizSet.id !== undefined) {
            await onUpdateQuizSet(quizSet.id, { tags: finalTags });
        }
    };

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
                    <div className="info-row" style={{ alignItems: 'flex-start' }}>
                        <span className="info-label" style={{ marginTop: '0.5rem' }}>タグ</span>
                        <div style={{ flex: 1 }}>
                            <div className="tags-edit-container">
                                <div className="info-tags" style={{ flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                    {currentTags.map(tag => (
                                        <span key={tag} className="tag edit-tag" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            {tag}
                                            <button onClick={() => handleRemoveTag(tag)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }} title="削除"><X size={12} /></button>
                                        </span>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <input
                                        type="text"
                                        value={newTagInput}
                                        onChange={(e) => setNewTagInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                                        placeholder="新しいタグを入力して追加"
                                        style={{ padding: '0.25rem 0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.9rem', flex: 1 }}
                                    />
                                    <button onClick={handleAddTag} className="nav-btn primary" style={{ padding: '0.25rem 0.5rem', background: 'var(--primary-color)', color: 'white' }}><Plus size={16} /> 追加</button>
                                </div>
                            </div>
                        </div>
                    </div>

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
                    {loading ? (
                        <p className="loading-text">読み込み中...</p>
                    ) : histories.length > 0 ? (
                        <div className="history-list">
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
                                        {history.mode === 'review_weak' && <span className="mode-badge weak">復習(苦手)</span>}
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
                        </div>
                    ) : (
                        <div className="empty-history">
                            <p>まだ履歴がありません</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
