import React, { useEffect, useState, useCallback } from 'react';
import type { Question, ReviewSchedule } from '../types';
import {
    getDueReviews,
    getReviewCounts,
    resetReviewSchedules,
    getCategoriesForQuizSet,
    getWeakestQuestions,
} from '../db';
import { estimateDuration, formatEstimatedTime } from '../utils/spacedRepetition';
import { ArrowLeft, Clock, AlertTriangle, RotateCcw, Play, Filter, Target } from 'lucide-react';
import { motion } from 'framer-motion';

interface ReviewDashboardProps {
    quizSetId: number;
    quizSetName: string;
    onBack: () => void;
    onStartReview: (reviews: (ReviewSchedule & { question?: Question })[]) => void;
}

export const ReviewDashboard: React.FC<ReviewDashboardProps> = ({
    quizSetId,
    quizSetName,
    onBack,
    onStartReview,
}) => {
    const [dueReviews, setDueReviews] = useState<(ReviewSchedule & { question?: Question })[]>([]);
    const [counts, setCounts] = useState<{ total: number; due: number }>({ total: 0, due: 0 });
    const [categories, setCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // フィルタ状態
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [overdueOnly, setOverdueOnly] = useState(false);
    const [lowConfidenceOnly, setLowConfidenceOnly] = useState(false);
    const [showFilters, setShowFilters] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const filters = {
                overdueOnly,
                lowConfidenceOnly,
                categories: selectedCategories.length > 0 ? selectedCategories : undefined,
            };
            const reviews = await getDueReviews(quizSetId, filters);
            setDueReviews(reviews);
            const c = await getReviewCounts(quizSetId);
            setCounts(c);
            const cats = await getCategoriesForQuizSet(quizSetId);
            setCategories(cats);
        } catch (err) {
            console.error('復習データの読み込みに失敗:', err);
        }
        setLoading(false);
    }, [quizSetId, overdueOnly, lowConfidenceOnly, selectedCategories]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // 復習スケジュールをリセット
    const handleReset = async () => {
        if (!window.confirm('この問題集の復習スケジュールをすべてリセットしますか？\n復習履歴も削除されます。')) return;
        const deleted = await resetReviewSchedules(quizSetId);
        alert(`${deleted}件のスケジュールをリセットしました`);
        await loadData();
    };

    // 苦手特訓モード開始
    const handleStartWeakMode = async () => {
        setLoading(true);
        try {
            const weakQuestions = await getWeakestQuestions(quizSetId, 10);
            if (weakQuestions.length === 0) {
                alert('復習すべき苦手問題が見つかりませんでした。\nまずはテストを実施してデータを蓄積してください。');
                setLoading(false);
                return;
            }
            onStartReview(weakQuestions);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    // カテゴリフィルタのトグル
    const toggleCategory = (cat: string) => {
        setSelectedCategories(prev =>
            prev.includes(cat)
                ? prev.filter(c => c !== cat)
                : [...prev, cat]
        );
    };

    const estimatedTime = formatEstimatedTime(estimateDuration(dueReviews.length));

    return (
        <div className="review-dashboard">
            <div className="detail-header">
                <button className="nav-btn" onClick={onBack}>
                    <ArrowLeft size={16} /> 戻る
                </button>
                <h1>📅 今日の復習 - {quizSetName}</h1>
            </div>

            {loading ? (
                <div className="loading-text">読み込み中...</div>
            ) : (
                <div className="review-dashboard-content">
                    {/* 統計カード */}
                    <div className="review-stats-grid">
                        <motion.div
                            className="review-stat-card due"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <div className="stat-icon">
                                <AlertTriangle size={24} />
                            </div>
                            <div className="stat-info">
                                <span className="stat-number">{dueReviews.length}</span>
                                <span className="stat-label">今日の復習件数</span>
                            </div>
                        </motion.div>

                        <motion.div
                            className="review-stat-card time"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <div className="stat-icon">
                                <Clock size={24} />
                            </div>
                            <div className="stat-info">
                                <span className="stat-number">{estimatedTime}</span>
                                <span className="stat-label">目安時間</span>
                            </div>
                        </motion.div>

                        <motion.div
                            className="review-stat-card total"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <div className="stat-info">
                                <span className="stat-number">{counts.total}</span>
                                <span className="stat-label">スケジュール済み</span>
                            </div>
                        </motion.div>
                    </div>

                    {/* アクションボタン */}
                    <div className="review-actions">
                        <button
                            className="review-action-btn primary"
                            onClick={() => onStartReview(dueReviews)}
                            disabled={dueReviews.length === 0}
                        >
                            <Play size={18} fill="currentColor" />
                            復習を開始する
                        </button>
                        <button
                            className="review-action-btn weak-mode"
                            onClick={handleStartWeakMode}
                            disabled={counts.total === 0}
                        >
                            <Target size={18} />
                            苦手問題を特訓 (10問)
                        </button>
                        <button
                            className="review-action-btn danger"
                            onClick={handleReset}
                            disabled={counts.total === 0}
                        >
                            <RotateCcw size={18} />
                            スケジュールをリセット
                        </button>
                    </div>

                    {/* フィルタ */}
                    <div className="review-filter-section">
                        <button
                            className={`review-filter-toggle ${showFilters ? 'active' : ''}`}
                            onClick={() => setShowFilters(!showFilters)}
                        >
                            <Filter size={16} />
                            フィルタ
                        </button>

                        {showFilters && (
                            <motion.div
                                className="review-filters"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                            >
                                <div className="filter-group">
                                    <label className="filter-label">カテゴリ</label>
                                    <div className="filter-tags">
                                        {categories.map(cat => (
                                            <button
                                                key={cat}
                                                className={`filter-tag ${selectedCategories.includes(cat) ? 'active' : ''}`}
                                                onClick={() => toggleCategory(cat)}
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="filter-group">
                                    <label className="filter-checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={overdueOnly}
                                            onChange={(e) => setOverdueOnly(e.target.checked)}
                                        />
                                        期限超過のみ
                                    </label>
                                    <label className="filter-checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={lowConfidenceOnly}
                                            onChange={(e) => setLowConfidenceOnly(e.target.checked)}
                                        />
                                        自信なしのみ
                                    </label>
                                </div>
                            </motion.div>
                        )}
                    </div>

                    {/* Due 一覧 */}
                    {dueReviews.length > 0 ? (
                        <div className="review-queue-list">
                            <h3>復習キュー</h3>
                            {dueReviews.map((item, index) => (
                                <motion.div
                                    key={item.id}
                                    className="review-queue-item"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                >
                                    <div className="queue-item-number">{index + 1}</div>
                                    <div className="queue-item-content">
                                        <span className="queue-item-text">
                                            {item.question?.text?.substring(0, 60) || '問題が見つかりません'}
                                            {(item.question?.text?.length || 0) > 60 ? '...' : ''}
                                        </span>
                                        <div className="queue-item-meta">
                                            <span className="tag">{item.question?.category || 'General'}</span>
                                            <span className="queue-item-due">
                                                期限: {item.nextDue}
                                            </span>
                                            <span className="queue-item-interval">
                                                間隔: {item.intervalDays}日
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="review-empty">
                            <p>🎉 今日の復習はすべて完了です！</p>
                            <p className="review-empty-sub">
                                テストで間違えた問題や自信のなかった問題が自動的にスケジュールされます。
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
