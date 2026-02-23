import React from 'react';
import type { Question } from '../types';
import { CheckCircle, Circle, Bookmark, XCircle, Clock3, Lock } from 'lucide-react';
import { MarkdownText } from './MarkdownText';
// Wait, I didn't install clsx. I'll just use standard string concat or template literals.

export type SidebarClickPosition = {
    x: number;
    y: number;
};

interface SidebarProps {
    questions: Question[];
    currentQuestionIndex: number;
    onSelectQuestion: (index: number, clickPosition?: SidebarClickPosition) => void;
    answers: Record<string, number[]>;
    answeredMap?: Record<string, boolean>;
    showAnswerMap: Record<string, boolean>;
    markedQuestionIds: number[];
    onToggleMark: (questionId: number) => void;
    mode?: 'normal' | 'memorization';
    memorizationStatus?: Record<number, 'memorized' | 'not_memorized' | 'unanswered'>;
    lockedQuestionIds?: number[];
}

export const Sidebar: React.FC<SidebarProps> = ({
    questions,
    currentQuestionIndex,
    onSelectQuestion,
    answers,
    answeredMap = {},
    showAnswerMap,
    markedQuestionIds,
    onToggleMark,
    mode = 'normal',
    memorizationStatus = {},
    lockedQuestionIds = [],
}) => {
    const lockedQuestionIdSet = new Set(lockedQuestionIds);

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <h2>すべての質問</h2>
            </div>
            <div className="question-list">
                {questions.map((q, index) => {
                    const qIdStr = String(q.id);
                    const isCurrent = index === currentQuestionIndex;
                    const isLocked = lockedQuestionIdSet.has(q.id!);
                    let isTemporarilyAnswered = false;

                    let icon;
                    if (mode === 'memorization') {
                        const status = memorizationStatus[q.id!] || 'unanswered';
                        isTemporarilyAnswered = status === 'unanswered' && answeredMap[qIdStr] === true;

                        if (status === 'memorized') {
                            icon = <CheckCircle size={16} className="icon-correct" />;
                        } else if (status === 'not_memorized') {
                            icon = <XCircle size={16} className="icon-incorrect" />;
                        } else if (isTemporarilyAnswered) {
                            icon = <Clock3 size={16} className="icon-pending" />;
                        } else {
                            icon = <Circle size={16} className="icon-unanswered" />;
                        }
                    } else {
                        // Normal mode logic
                        const userAnswers = answers[qIdStr] || [];
                        const isAnswered = answeredMap[qIdStr] === true || userAnswers.length > 0;
                        const isRevealed = isAnswered && showAnswerMap[qIdStr];
                        isTemporarilyAnswered = isAnswered && !isRevealed;

                        const isCorrect = isAnswered &&
                            userAnswers.length === q.correctAnswers.length &&
                            userAnswers.every(val => q.correctAnswers.includes(val));

                        if (isRevealed) {
                            icon = isCorrect ? (
                                <CheckCircle size={16} className="icon-correct" />
                            ) : (
                                <XCircle size={16} className="icon-incorrect" />
                            );
                        } else if (isAnswered) {
                            icon = <Clock3 size={16} className="icon-pending" />;
                        } else {
                            icon = <Circle size={16} className="icon-unanswered" />;
                        }
                    }

                    return (
                        <div
                            key={q.id}
                            className={`question-item ${isCurrent ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                            onClick={(e) => onSelectQuestion(index, { x: e.clientX, y: e.clientY })}
                            title={isLocked ? '回答確認中のため移動できません' : undefined}
                        >
                            <div className="question-item-icon">
                                {icon}
                            </div>
                            <div className="question-item-content">
                                <div className="question-id-row">
                                    <span className="question-id">問題 {index + 1}</span>
                                    {isTemporarilyAnswered && (
                                        <span className="question-status-badge pending">一時回答済み</span>
                                    )}
                                    {isLocked && (
                                        <span className="question-status-badge locked">
                                            <Lock size={10} />
                                            回答確認待ち
                                        </span>
                                    )}
                                </div>
                                <div className="question-preview sidebar-preview">
                                    <MarkdownText content={q.text} />
                                </div>
                            </div>
                            <button
                                className={`sidebar-bookmark-btn ${markedQuestionIds.includes(q.id!) ? 'marked' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleMark(q.id!);
                                }}
                                title={markedQuestionIds.includes(q.id!) ? "見直しマークを外す" : "見直しマークを付ける"}
                            >
                                <Bookmark size={14} fill={markedQuestionIds.includes(q.id!) ? "#f59e0b" : "none"} color={markedQuestionIds.includes(q.id!) ? "#f59e0b" : "#94a3b8"} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
