export type QuestionType = 'quiz' | 'memorization';

export interface Question {
    id?: number; // Auto-incremented by Dexie
    quizSetId: number;
    category: string;
    text: string;
    options: string[];
    correctAnswers: (number | string)[]; // quiz: 0-based indices, memorization: answer texts
    explanation: string;
    questionType?: QuestionType; // undefined は 'quiz' として扱う
}

export type QuizSetType = 'quiz' | 'memorization' | 'mixed';

export interface QuizSet {
    id?: number; // Auto-incremented by Dexie
    name: string;
    createdAt: Date;
    updatedAt?: Date;
    type?: QuizSetType; // Default to 'quiz' if undefined
    isDeleted?: boolean; // Logical delete flag
    isArchived?: boolean; // Archive flag
    isReviewExcluded?: boolean; // 復習対象から除外するフラグ
    tags?: string[]; // ユーザー設定タグ
}

export interface QuizSetWithMeta extends QuizSet {
    questionCount: number;
    categories: string[];
}

export interface MemorizationLog {
    questionId: number;
    userInputs: string[];
    isMemorized: boolean; // true = "完全に覚えた", false = "覚えられていない"
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
    feedbackTimingMode?: FeedbackTimingMode;
    // Memorization specific
    memorizationDetail?: MemorizationLog[];
}

export type HistoryMode = 'normal' | 'review_wrong' | 'review_weak' | 'review_weak_strict' | 'review_due';
export type FeedbackTimingMode = 'immediate' | 'delayed_block' | 'delayed_end';

export interface SuspendedSession {
    questions: Question[];
    currentQuestionIndex: number;
    answers: Record<string, number[]>;
    memos: Record<string, string>;
    answeredMap?: Record<string, boolean>;
    showAnswerMap: Record<string, boolean>;
    pendingRevealQuestionIds?: number[];
    feedbackPhase?: 'answering' | 'revealing';
    feedbackTimingMode?: FeedbackTimingMode;
    feedbackBlockSize?: number;
    markedQuestions: number[];
    startTime: Date;
    elapsedSeconds: number;
    historyMode: HistoryMode;
    type: 'study' | 'memorization';
    memorizationLogs?: MemorizationLog[];
    memorizationInputsMap?: Record<string, string[]>;
    updatedAt?: Date;
}

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

export type HomeOnboardingFlowStage = 'home' | 'manage' | 'completed';

export interface HomeOnboardingState {
    homeTutorialCompleted: boolean;
    completedAt: string | null;
    flowStage: HomeOnboardingFlowStage;
    manageQuizSetId: number | null;
}
