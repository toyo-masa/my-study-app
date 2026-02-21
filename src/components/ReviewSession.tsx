import React, { useState, useRef, useCallback } from 'react';
import type { Question, ReviewSchedule, ConfidenceLevel } from '../types';
import { upsertReviewSchedule, addReviewLog } from '../db';
import { calculateNextInterval, calculateNextDue, updateConsecutiveCorrect } from '../utils/spacedRepetition';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronRight, Bookmark } from 'lucide-react';
import { MarkdownText } from './MarkdownText';

/** 復習セッションに渡すアイテム */
export type ReviewItem = ReviewSchedule & { question?: Question };

interface ReviewSessionProps {
    reviewItems: ReviewItem[];
    quizSetName: string;
    onBack: () => void;
    onComplete: () => void;
}

export const ReviewSession: React.FC<ReviewSessionProps> = ({
    reviewItems,
    quizSetName,
    onBack,
    onComplete,
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
    const [showAnswer, setShowAnswer] = useState(false);
    const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
    const [memo, setMemo] = useState('');
    const [completedCount, setCompletedCount] = useState(0);
    const questionStartTimeRef = useRef<Date>(new Date());
    const sessionIdRef = useRef<string>(`session-${Date.now()}`);

    const currentItem = reviewItems[currentIndex];
    const question = currentItem?.question;
    const totalCount = reviewItems.length;

    // 選択肢のトグル
    const handleToggleOption = useCallback((optionIndex: number) => {
        if (showAnswer) return;
        if (!question) return;

        const isSingleChoice = question.correctAnswers.length === 1;
        if (isSingleChoice) {
            setSelectedOptions([optionIndex]);
        } else {
            setSelectedOptions(prev =>
                prev.includes(optionIndex)
                    ? prev.filter(i => i !== optionIndex)
                    : [...prev, optionIndex]
            );
        }
    }, [showAnswer, question]);

    // 解答を確認する
    const handleShowAnswer = useCallback(async () => {
        if (!question || !currentItem) return;

        // 自信度未選択の場合は「確信」をデフォルトに
        const finalConfidence = confidence || 'high';
        if (!confidence) setConfidence('high');

        setShowAnswer(true);

        // 正誤判定
        const isCorrect = selectedOptions.length === question.correctAnswers.length &&
            selectedOptions.every(a => question.correctAnswers.includes(a));

        // 間隔計算
        const newInterval = calculateNextInterval(isCorrect, finalConfidence, currentItem.intervalDays);
        const newNextDue = calculateNextDue(newInterval);
        const newConsecutive = updateConsecutiveCorrect(isCorrect, currentItem.consecutiveCorrect);

        // 所要時間を計算
        const durationSeconds = Math.round(
            (new Date().getTime() - questionStartTimeRef.current.getTime()) / 1000
        );

        // DB 更新: スケジュール
        await upsertReviewSchedule({
            questionId: currentItem.questionId,
            quizSetId: currentItem.quizSetId,
            intervalDays: newInterval,
            nextDue: newNextDue,
            lastReviewedAt: new Date().toISOString(),
            consecutiveCorrect: newConsecutive,
        });

        // DB 更新: ログ
        await addReviewLog({
            questionId: currentItem.questionId,
            quizSetId: currentItem.quizSetId,
            reviewedAt: new Date().toISOString(),
            isCorrect,
            confidence: finalConfidence,
            intervalDays: newInterval,
            nextDue: newNextDue,
            memo: memo || undefined,
            durationSeconds,
            sessionId: sessionIdRef.current,
        });

        setCompletedCount(prev => prev + 1);
    }, [question, currentItem, selectedOptions, confidence, memo]);

    // 次の問題へ
    const handleNext = useCallback(() => {
        if (currentIndex < totalCount - 1) {
            setCurrentIndex(prev => prev + 1);
            setSelectedOptions([]);
            setShowAnswer(false);
            setConfidence(null);
            setMemo('');
            questionStartTimeRef.current = new Date();
        } else {
            onComplete();
        }
    }, [currentIndex, totalCount, onComplete]);

    if (!question) {
        return (
            <div className="review-session">
                <div className="review-empty">
                    <p>復習する問題がありません</p>
                    <button className="nav-btn" onClick={onBack}>戻る</button>
                </div>
            </div>
        );
    }

    const isSingleChoice = question.correctAnswers.length === 1;

    return (
        <div className="review-session">
            {/* ヘッダー */}
            <div className="review-session-header">
                <button className="nav-btn" onClick={onBack}>
                    <ArrowLeft size={16} /> 戻る
                </button>
                <h2>{quizSetName} - 復習</h2>
            </div>

            {/* 進捗バー */}
            <div className="review-progress">
                <span className="review-progress-text">
                    {completedCount}/{totalCount} 完了
                </span>
                <div className="progress-bar-track">
                    <div
                        className="progress-bar-fill"
                        style={{ width: `${(completedCount / totalCount) * 100}%` }}
                    />
                </div>
            </div>

            {/* メインコンテンツ */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    className="question-content"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                >
                    {/* 問題ヘッダー */}
                    <div className="question-header">
                        <Bookmark size={20} color="var(--text-secondary)" />
                        <h2 className="question-text">
                            <span className="question-number-prefix">復習 {currentIndex + 1}: </span>
                            <div style={{ display: 'inline-block', width: '100%' }}>
                                <MarkdownText content={question.text} />
                            </div>
                        </h2>
                    </div>

                    <p className="instruction">
                        {question.correctAnswers.length > 1
                            ? `${question.correctAnswers.length} つ選択してください`
                            : '1つ選択してください'
                        }
                    </p>

                    {/* 選択肢（通常テストと同じUI） */}
                    <div className="options-list">
                        {question.options.map((option, idx) => {
                            const isSelected = selectedOptions.includes(idx);
                            const isCorrectOption = question.correctAnswers.includes(idx);

                            let optionClass = `option-item ${isSelected ? 'selected' : ''}`;
                            if (showAnswer) {
                                if (isCorrectOption) optionClass += ' correct';
                                if (isSelected && !isCorrectOption) optionClass += ' incorrect';
                            }

                            return (
                                <div
                                    key={idx}
                                    className={optionClass}
                                    onClick={() => handleToggleOption(idx)}
                                >
                                    {isSingleChoice ? (
                                        <div className={`radio-button ${isSelected ? 'checked' : ''}`}>
                                            {isSelected && <div className="radio-inner" />}
                                        </div>
                                    ) : (
                                        <div className={`checkbox ${isSelected ? 'checked' : ''}`}>
                                            {isSelected && <span className="check-mark">✓</span>}
                                        </div>
                                    )}
                                    <div className="option-text" style={{ flex: 1 }}>
                                        <MarkdownText content={option} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 解説（解答後） */}
                    {showAnswer && question.explanation && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="explanation-box"
                        >
                            <h3>解説</h3>
                            <MarkdownText content={question.explanation?.replace(/\\n/g, '\n')} />
                        </motion.div>
                    )}

                    {/* ナビゲーション */}
                    <div className="navigation-buttons inline-nav">
                        {!showAnswer && (
                            <div className="confidence-select-section">
                                <span className="confidence-prompt">自信度</span>
                                <div className="confidence-buttons-inline">
                                    <button
                                        className={`confidence-btn-inline low ${confidence === 'low' ? 'active' : ''}`}
                                        onClick={() => setConfidence('low')}
                                    >
                                        😟 自信なし
                                    </button>
                                    <button
                                        className={`confidence-btn-inline high ${confidence === 'high' ? 'active' : ''}`}
                                        onClick={() => setConfidence('high')}
                                    >
                                        😊 確信
                                    </button>
                                </div>
                            </div>
                        )}
                        {!showAnswer && <div style={{ flex: 1 }} />}
                        <div className="nav-right">
                            {!showAnswer ? (
                                <button onClick={handleShowAnswer} className="nav-btn action-btn">解答を確認する</button>
                            ) : currentIndex < totalCount - 1 ? (
                                <button onClick={handleNext} className="nav-btn action-btn">
                                    次の問題 <ChevronRight size={16} />
                                </button>
                            ) : (
                                <button onClick={handleNext} className="nav-btn action-btn complete-btn">復習を完了する</button>
                            )}
                        </div>
                    </div>

                    {/* メモ */}
                    <div className="memo-section">
                        <div className="memo-header">
                            <span className="memo-title">学習メモ (後で調べたいことなど)</span>
                        </div>
                        <textarea
                            className="memo-input"
                            placeholder="調べたいキーワードやメモを入力..."
                            value={memo}
                            onChange={(e) => setMemo(e.target.value)}
                        />
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};
