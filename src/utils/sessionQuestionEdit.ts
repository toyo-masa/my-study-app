import type { ConfidenceLevel, MemorizationLog, Question } from '../types';

type FeedbackPhase = 'answering' | 'revealing';

type StudyQuestionSessionState = {
    questions: Question[];
    answers: Record<string, number[]>;
    answeredMap: Record<string, boolean>;
    showAnswerMap: Record<string, boolean>;
    confidences: Record<string, ConfidenceLevel>;
    memorizationAnswers: Record<string, string>;
    pendingRevealQuestionIds: number[];
    questionElapsedMsById: Record<string, number>;
    feedbackPhase: FeedbackPhase;
    overflowRevealAfterCurrentQuestionId: number | null;
};

type MemorizationQuestionSessionState = {
    questions: Question[];
    answeredMap: Record<string, boolean>;
    showAnswerMap: Record<string, boolean>;
    memorizationInputsMap: Record<string, string[]>;
    memorizationLogs: MemorizationLog[];
    pendingRevealQuestionIds: number[];
    questionElapsedMsById: Record<string, number>;
    feedbackPhase: FeedbackPhase;
};

type ResetSummary = {
    quizAnswerStateReset: boolean;
    memorizationStateReset: boolean;
};

const normalizeQuestionType = (question: Question): 'quiz' | 'memorization' => {
    return question.questionType === 'memorization' ? 'memorization' : 'quiz';
};

const areArraysEqual = <T,>(left: T[], right: T[]): boolean => {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => value === right[index]);
};

const normalizeCorrectAnswers = (question: Question): string[] => {
    return [...question.correctAnswers].map(String).sort();
};

const omitRecordEntry = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
    if (!(key in record)) {
        return record;
    }

    const nextRecord = { ...record };
    delete nextRecord[key];
    return nextRecord;
};

const removeQuestionId = (questionIds: number[], targetQuestionId: number): number[] => {
    if (!questionIds.includes(targetQuestionId)) {
        return questionIds;
    }

    return questionIds.filter((questionId) => questionId !== targetQuestionId);
};

export const didQuizAnswerBasisChange = (previousQuestion: Question, updatedQuestion: Question): boolean => {
    return (
        normalizeQuestionType(previousQuestion) !== normalizeQuestionType(updatedQuestion) ||
        !areArraysEqual(previousQuestion.options, updatedQuestion.options) ||
        !areArraysEqual(normalizeCorrectAnswers(previousQuestion), normalizeCorrectAnswers(updatedQuestion))
    );
};

export const didMemorizationJudgementBasisChange = (previousQuestion: Question, updatedQuestion: Question): boolean => {
    const previousType = normalizeQuestionType(previousQuestion);
    const updatedType = normalizeQuestionType(updatedQuestion);

    if (previousType !== 'memorization' && updatedType !== 'memorization') {
        return false;
    }

    return (
        previousType !== updatedType ||
        previousQuestion.text !== updatedQuestion.text ||
        previousQuestion.explanation !== updatedQuestion.explanation ||
        !areArraysEqual(previousQuestion.options, updatedQuestion.options) ||
        !areArraysEqual(normalizeCorrectAnswers(previousQuestion), normalizeCorrectAnswers(updatedQuestion))
    );
};

export const applyQuestionEditToStudySession = (params: {
    previousQuestion: Question;
    updatedQuestion: Question;
    state: StudyQuestionSessionState;
}): {
    nextState: StudyQuestionSessionState;
    resetSummary: ResetSummary;
} => {
    const { previousQuestion, updatedQuestion, state } = params;
    const questionId = updatedQuestion.id;

    if (questionId === undefined) {
        return {
            nextState: {
                ...state,
                questions: state.questions,
            },
            resetSummary: {
                quizAnswerStateReset: false,
                memorizationStateReset: false,
            },
        };
    }

    const questionKey = String(questionId);
    const quizAnswerStateReset = didQuizAnswerBasisChange(previousQuestion, updatedQuestion);
    const memorizationStateReset = didMemorizationJudgementBasisChange(previousQuestion, updatedQuestion);
    const shouldResetAnySessionState = quizAnswerStateReset || memorizationStateReset;

    let nextState: StudyQuestionSessionState = {
        ...state,
        questions: state.questions.map((question) => (
            question.id === questionId ? updatedQuestion : question
        )),
    };

    if (quizAnswerStateReset) {
        nextState = {
            ...nextState,
            answers: omitRecordEntry(nextState.answers, questionKey),
            answeredMap: omitRecordEntry(nextState.answeredMap, questionKey),
            showAnswerMap: omitRecordEntry(nextState.showAnswerMap, questionKey),
            confidences: omitRecordEntry(nextState.confidences, questionKey),
            pendingRevealQuestionIds: removeQuestionId(nextState.pendingRevealQuestionIds, questionId),
            questionElapsedMsById: omitRecordEntry(nextState.questionElapsedMsById, questionKey),
        };
    }

    if (memorizationStateReset) {
        nextState = {
            ...nextState,
            answeredMap: omitRecordEntry(nextState.answeredMap, questionKey),
            showAnswerMap: omitRecordEntry(nextState.showAnswerMap, questionKey),
            confidences: omitRecordEntry(nextState.confidences, questionKey),
            memorizationAnswers: omitRecordEntry(nextState.memorizationAnswers, questionKey),
            pendingRevealQuestionIds: removeQuestionId(nextState.pendingRevealQuestionIds, questionId),
            questionElapsedMsById: omitRecordEntry(nextState.questionElapsedMsById, questionKey),
        };
    }

    if (shouldResetAnySessionState) {
        nextState = {
            ...nextState,
            overflowRevealAfterCurrentQuestionId:
                nextState.overflowRevealAfterCurrentQuestionId === questionId
                    ? null
                    : nextState.overflowRevealAfterCurrentQuestionId,
            feedbackPhase:
                nextState.feedbackPhase === 'revealing' && nextState.pendingRevealQuestionIds.length === 0
                    ? 'answering'
                    : nextState.feedbackPhase,
        };
    }

    return {
        nextState,
        resetSummary: {
            quizAnswerStateReset,
            memorizationStateReset,
        },
    };
};

export const applyQuestionEditToMemorizationSession = (params: {
    previousQuestion: Question;
    updatedQuestion: Question;
    state: MemorizationQuestionSessionState;
}): {
    nextState: MemorizationQuestionSessionState;
    resetSummary: ResetSummary;
} => {
    const { previousQuestion, updatedQuestion, state } = params;
    const questionId = updatedQuestion.id;

    if (questionId === undefined) {
        return {
            nextState: {
                ...state,
                questions: state.questions,
            },
            resetSummary: {
                quizAnswerStateReset: false,
                memorizationStateReset: false,
            },
        };
    }

    const questionKey = String(questionId);
    const memorizationStateReset = didMemorizationJudgementBasisChange(previousQuestion, updatedQuestion);

    let nextState: MemorizationQuestionSessionState = {
        ...state,
        questions: state.questions.map((question) => (
            question.id === questionId ? updatedQuestion : question
        )),
    };

    if (memorizationStateReset) {
        nextState = {
            ...nextState,
            answeredMap: omitRecordEntry(nextState.answeredMap, questionKey),
            showAnswerMap: omitRecordEntry(nextState.showAnswerMap, questionKey),
            memorizationInputsMap: omitRecordEntry(nextState.memorizationInputsMap, questionKey),
            memorizationLogs: nextState.memorizationLogs.filter((log) => log.questionId !== questionId),
            pendingRevealQuestionIds: removeQuestionId(nextState.pendingRevealQuestionIds, questionId),
            questionElapsedMsById: omitRecordEntry(nextState.questionElapsedMsById, questionKey),
            feedbackPhase:
                nextState.feedbackPhase === 'revealing' &&
                removeQuestionId(nextState.pendingRevealQuestionIds, questionId).length === 0
                    ? 'answering'
                    : nextState.feedbackPhase,
        };
    }

    return {
        nextState,
        resetSummary: {
            quizAnswerStateReset: false,
            memorizationStateReset,
        },
    };
};
