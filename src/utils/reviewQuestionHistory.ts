import type { Question, QuizHistory } from '../types';

export type QuestionAttemptSummary =
    | {
        kind: 'quiz';
        dateLabel: string;
        isCorrect: boolean;
        reviewRequested: boolean;
    }
    | {
        kind: 'memorization';
        dateLabel: string;
        isMemorized: boolean;
    };

function formatHistoryDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

function normalizeQuestionType(question: Question): 'quiz' | 'memorization' {
    return question.questionType === 'memorization' ? 'memorization' : 'quiz';
}

function buildQuizAttemptSummary(history: QuizHistory, question: Question): QuestionAttemptSummary | null {
    const questionId = question.id;
    if (questionId === undefined) return null;

    const userAnswers = history.answers[String(questionId)] || [];
    if (userAnswers.length === 0) {
        return null;
    }

    const isCorrect =
        userAnswers.length === question.correctAnswers.length &&
        userAnswers.every((answer) => question.correctAnswers.includes(answer));

    return {
        kind: 'quiz',
        dateLabel: formatHistoryDate(history.date),
        isCorrect,
        reviewRequested: history.confidences?.[String(questionId)] === 'low',
    };
}

function buildMemorizationAttemptSummary(history: QuizHistory, question: Question): QuestionAttemptSummary | null {
    const questionId = question.id;
    if (questionId === undefined) return null;

    const memorizationLog = history.memorizationDetail?.find((log) => log.questionId === questionId);
    if (memorizationLog) {
        return {
            kind: 'memorization',
            dateLabel: formatHistoryDate(history.date),
            isMemorized: memorizationLog.isMemorized,
        };
    }

    const confidence = history.confidences?.[String(questionId)];
    if (confidence === 'high' || confidence === 'low') {
        return {
            kind: 'memorization',
            dateLabel: formatHistoryDate(history.date),
            isMemorized: confidence === 'high',
        };
    }

    return null;
}

export function getQuestionAttemptSummariesFromHistories(
    histories: QuizHistory[],
    question: Question
): QuestionAttemptSummary[] {
    const sortedHistories = [...histories].sort((a, b) => b.date.getTime() - a.date.getTime());

    return sortedHistories.flatMap((history) => {
        const summary = normalizeQuestionType(question) === 'memorization'
            ? buildMemorizationAttemptSummary(history, question)
            : buildQuizAttemptSummary(history, question);

        return summary ? [summary] : [];
    });
}
