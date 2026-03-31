import type { Question, QuizHistory } from '../types';

const REQUIRED_RECENT_ATTEMPT_COUNT = 4;

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
    questions: Question[]
): Set<number> {
    const masteredQuestionIds = new Set<number>();
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
            if (recentAttemptResults.length >= REQUIRED_RECENT_ATTEMPT_COUNT) {
                break;
            }
        }

        if (
            recentAttemptResults.length === REQUIRED_RECENT_ATTEMPT_COUNT &&
            recentAttemptResults.every(Boolean)
        ) {
            masteredQuestionIds.add(question.id);
        }
    }

    return masteredQuestionIds;
}
