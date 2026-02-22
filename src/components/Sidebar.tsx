import React from 'react';
import type { Question } from '../types';
import { CheckCircle, Circle, Bookmark, XCircle } from 'lucide-react';
import { MarkdownText } from './MarkdownText';
// Wait, I didn't install clsx. I'll just use standard string concat or template literals.

interface SidebarProps {
    questions: Question[];
    currentQuestionIndex: number;
    onSelectQuestion: (index: number) => void;
    answers: Record<string, number[]>;
    showAnswerMap: Record<string, boolean>;
    markedQuestionIds: number[];
    onToggleMark: (questionId: number) => void;
    mode?: 'normal' | 'memorization';
    memorizationStatus?: Record<number, 'memorized' | 'not_memorized' | 'unanswered'>;
}

export const Sidebar: React.FC<SidebarProps> = ({
    questions,
    currentQuestionIndex,
    onSelectQuestion,
    answers,
    showAnswerMap,
    markedQuestionIds,
    onToggleMark,
    mode = 'normal',
    memorizationStatus = {}
}) => {
    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <h2>すべての質問</h2>
            </div>
            <div className="question-list">
                {questions.map((q, index) => {
                    const qIdStr = String(q.id);
                    const isCurrent = index === currentQuestionIndex;

                    let icon;
                    if (mode === 'memorization') {
                        const status = memorizationStatus[q.id!] || 'unanswered';
                        if (status === 'memorized') {
                            icon = <CheckCircle size={16} className="icon-correct" />;
                        } else if (status === 'not_memorized') {
                            icon = <XCircle size={16} className="icon-incorrect" />;
                        } else {
                            icon = <Circle size={16} className="icon-unanswered" />;
                        }
                    } else {
                        // Normal mode logic
                        const userAnswers = answers[qIdStr] || [];
                        const isAnswered = userAnswers.length > 0;
                        const isRevealed = showAnswerMap[qIdStr];

                        const isCorrect = isAnswered &&
                            userAnswers.length === q.correctAnswers.length &&
                            userAnswers.every(val => q.correctAnswers.includes(val));

                        if (isRevealed) {
                            icon = isCorrect ? (
                                <CheckCircle size={16} className="icon-correct" />
                            ) : (
                                <XCircle size={16} className="icon-incorrect" />
                            );
                        } else {
                            icon = <Circle size={16} className="icon-unanswered" />;
                        }
                    }

                    return (
                        <div
                            key={q.id}
                            className={`question-item ${isCurrent ? 'active' : ''}`}
                            onClick={() => onSelectQuestion(index)}
                        >
                            <div className="question-item-icon">
                                {icon}
                            </div>
                            <div className="question-item-content">
                                <span className="question-id">問題 {index + 1}</span>
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
