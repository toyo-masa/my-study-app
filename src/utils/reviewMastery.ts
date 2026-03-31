import type { Question, QuizHistory } from '../types';

const DEFAULT_REQUIRED_RECENT_ATTEMPT_COUNT = 4;

function normalizeRequiredRecentAttemptCount(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_REQUIRED_RECENT_ATTEMPT_COUNT;
    }

    return Math.max(1, Math.round(value));
}

function normalizeQuestionType(question: Question): 'quiz' | 'memorization' {
    return question.questionType === 'memorization' ? 'memorization' : 'quiz';
}

function isQuizAttemptMastered(history: QuizHistory, question: Question): boolean | null {
    const questionId = question.id;
    if (questionId === undefined) return null;

    const userAnswers = history.answers[String(questionId)] || [];
    if (userAnswers.length === 0) {
        return null;
    }

    const isCorrect =
        userAnswers.length === question.correctAnswers.length &&
        userAnswers.every((answer) => question.correctAnswers.includes(answer));

    return isCorrect && history.confidences?.[String(questionId)] !== 'low';
}

function isMemorizationAttemptMastered(history: QuizHistory, question: Question): boolean | null {
    const questionId = question.id;
    if (questionId === undefined) return null;

    const memorizationLog = history.memorizationDetail?.find((log) => log.questionId === questionId);
    if (memorizationLog) {
        return memorizationLog.isMemorized;
    }

    const confidence = history.confidences?.[String(questionId)];
    if (confidence === 'high' || confidence === 'low') {
        return confidence === 'high';
    }

    return null;
}

function isAttemptMastered(history: QuizHistory, question: Question): boolean | null {
    return normalizeQuestionType(question) === 'memorization'
        ? isMemorizationAttemptMastered(history, question)
        : isQuizAttemptMastered(history, question);
}

export function getMasteredQuestionIdsFromHistories(
    histories: QuizHistory[],
    questions: Question[],
    requiredRecentAttemptCount: number = DEFAULT_REQUIRED_RECENT_ATTEMPT_COUNT
): Set<number> {
    const masteredQuestionIds = new Set<number>();
    const normalizedRequiredRecentAttemptCount = normalizeRequiredRecentAttemptCount(requiredRecentAttemptCount);
    const sortedHistories = [...histories].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    for (const question of questions) {
        if (question.id === undefined) {
            continue;
        }

        const recentAttemptResults: boolean[] = [];
        for (const history of sortedHistories) {
            const mastered = isAttemptMastered(history, question);
            if (mastered === null) {
                continue;
            }

            recentAttemptResults.push(mastered);
            if (recentAttemptResults.length >= normalizedRequiredRecentAttemptCount) {
                break;
            }
        }

        if (
            recentAttemptResults.length === normalizedRequiredRecentAttemptCount &&
            recentAttemptResults.every(Boolean)
        ) {
            masteredQuestionIds.add(question.id);
        }
    }

    return masteredQuestionIds;
}
