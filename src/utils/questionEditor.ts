import type { Question, QuestionType, QuizSetType } from '../types';
import type { QuestionDraftFormValue } from '../features/questionGeneration/types';

export type EditableQuestionDraft = QuestionDraftFormValue & { id?: number };

type QuestionSavePayload = Pick<Question, 'category' | 'text' | 'options' | 'correctAnswers' | 'explanation' | 'questionType'>;

const normalizeQuestionType = (questionType: QuestionType | undefined, quizSetType?: QuizSetType): QuestionType => {
    if (questionType) {
        return questionType;
    }

    return quizSetType === 'memorization' ? 'memorization' : 'quiz';
};

const mergeLegacyMemorizationAnswerIntoExplanation = (question: Question): string => {
    const mergedExplanation = question.explanation || '';
    const answerTexts: string[] = [];

    if (question.options?.length > 0) {
        answerTexts.push(...question.options);
    } else if (question.correctAnswers?.length > 0) {
        question.correctAnswers.forEach((answer) => {
            if (typeof answer === 'string') {
                answerTexts.push(answer);
            }
        });
    }

    if (answerTexts.length === 0) {
        return mergedExplanation;
    }

    const combinedAnswers = answerTexts.join('\n');
    if (mergedExplanation.includes(combinedAnswers)) {
        return mergedExplanation;
    }

        return mergedExplanation ? `${combinedAnswers}\n\n${mergedExplanation}` : combinedAnswers;
    };

export const isMemorizationDraft = (
    quizSetType: QuizSetType | undefined,
    draft: Pick<EditableQuestionDraft, 'questionType'>
): boolean => {
    return quizSetType === 'memorization' || (quizSetType === 'mixed' && draft.questionType === 'memorization');
};

export const buildQuestionEditorDraft = (question: Question, quizSetType?: QuizSetType): EditableQuestionDraft => {
    const questionType = normalizeQuestionType(question.questionType, quizSetType);
    const isMemorization = questionType === 'memorization';

    return {
        id: question.id,
        category: question.category || '',
        text: question.text,
        options: isMemorization ? [] : [...question.options],
        correctAnswers: isMemorization
            ? []
            : question.correctAnswers.filter((answer): answer is number => typeof answer === 'number'),
        explanation: isMemorization
            ? mergeLegacyMemorizationAnswerIntoExplanation(question)
            : (question.explanation || ''),
        questionType,
    };
};

export const validateQuestionDraft = (draft: EditableQuestionDraft, quizSetType?: QuizSetType): string | null => {
    if (!draft.text.trim()) {
        return '問題文を入力してください';
    }

    const isMemorization = isMemorizationDraft(quizSetType, draft);
    const cleanOptions = draft.options.filter((option) => option.trim() !== '');

    if (isMemorization) {
        if (!draft.explanation.trim()) {
            return '暗記問題の解答（解説）を入力してください';
        }
        return null;
    }

    if (cleanOptions.length < 2) {
        return '選択肢は2つ以上必要です';
    }

    return null;
};

export const buildQuestionSavePayload = (
    draft: EditableQuestionDraft,
    quizSetType?: QuizSetType
): QuestionSavePayload => {
    const isMemorization = isMemorizationDraft(quizSetType, draft);
    const cleanOptions = draft.options.filter((option) => option.trim() !== '');

    return {
        category: draft.category,
        text: draft.text,
        options: isMemorization ? [] : cleanOptions,
        correctAnswers: isMemorization ? [] : [...draft.correctAnswers],
        explanation: draft.explanation,
        questionType: draft.questionType,
    };
};

const areArraysEqual = <T,>(left: T[], right: T[]): boolean => {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => value === right[index]);
};

export const isQuestionDraftDirty = (params: {
    draft: EditableQuestionDraft | null;
    originalQuestion?: Question;
    quizSetType?: QuizSetType;
    isNew: boolean;
}): boolean => {
    const { draft, originalQuestion, quizSetType, isNew } = params;

    if (!draft) {
        return false;
    }

    if (isNew) {
        return true;
    }

    if (!originalQuestion) {
        return true;
    }

    const currentPayload = buildQuestionSavePayload(draft, quizSetType);
    const originalPayload = buildQuestionSavePayload(
        buildQuestionEditorDraft(originalQuestion, quizSetType),
        quizSetType
    );

    return (
        currentPayload.category !== originalPayload.category ||
        currentPayload.text !== originalPayload.text ||
        currentPayload.explanation !== originalPayload.explanation ||
        currentPayload.questionType !== originalPayload.questionType ||
        !areArraysEqual(currentPayload.options, originalPayload.options) ||
        !areArraysEqual(
            [...currentPayload.correctAnswers].map(String).sort(),
            [...originalPayload.correctAnswers].map(String).sort()
        )
    );
};
