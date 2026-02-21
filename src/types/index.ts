export interface Question {
    id?: number; // Auto-incremented by Dexie
    quizSetId: number;
    category: string;
    text: string;
    options: string[];
    correctAnswers: number[]; // 0-based indices
    explanation: string;
}

export type QuizSetType = 'quiz' | 'memorization';

export interface QuizSet {
    id?: number; // Auto-incremented by Dexie
    name: string;
    createdAt: Date;
    type?: QuizSetType; // Default to 'quiz' if undefined
    isDeleted?: boolean; // Logical delete flag
    isArchived?: boolean; // Archive flag
    tags?: string[]; // ユーザー設定タグ
}

export interface QuizHistory {
    id?: number; // Auto-incremented
    quizSetId: number;
    date: Date;
    correctCount: number;
    totalCount: number;
    durationSeconds: number;
    answers: Record<string, number[]>;
    markedQuestionIds: number[];
    memos?: Record<string, string>;
    confidences?: Record<string, ConfidenceLevel>;
    questionIds?: number[];
    mode?: HistoryMode;
    // Memorization specific
    memorizationDetail?: {
        questionId: number;
        userInputs: string[];
        isMemorized: boolean; // true = "完全に覚えた", false = "覚えられていない"
    }[];
}

export type HistoryMode = 'normal' | 'review_wrong' | 'review_weak' | 'review_weak_strict';

export type StudyMode = 'practice' | 'test' | 'review';

// === 復習スケジューラ（間隔反復）用の型 ===

/** 自信度レベル */
export type ConfidenceLevel = 'low' | 'high'; // 自信なし / 確信

/** 問題ごとの復習スケジュール */
export interface ReviewSchedule {
    id?: number;              // Dexie 自動採番
    questionId: number;       // Question.id への参照
    quizSetId: number;        // QuizSet.id への参照
    intervalDays: number;     // 現在の間隔（日数）
    nextDue: string;          // 'YYYY-MM-DD' 形式の次回出題日
    lastReviewedAt?: string;  // 最終復習日時（ISO形式）
    consecutiveCorrect: number; // 連続正解数（統計用）
}

/** 復習ログ（1回解くたびに保存） */
export interface ReviewLog {
    id?: number;              // Dexie 自動採番
    questionId: number;
    quizSetId: number;
    reviewedAt: string;       // 復習日時（ISO形式）
    isCorrect: boolean;       // 正誤
    confidence: ConfidenceLevel; // 自信度
    intervalDays: number;     // この時点で計算された interval
    nextDue: string;          // 計算された次回出題日
    memo?: string;            // 任意メモ
    durationSeconds?: number; // 所要時間（秒）
    sessionId?: string;       // セッションID（任意）
}
