import type { Question, QuestionType } from '../../types';
import {
    calculateNgramJaccardSimilarity,
    normalizeQuestionComparisonValue,
} from '../../utils/questionSearch';
import type {
    DuplicateCheckResult,
    ExistingQuestionReference,
    QuestionDraftFormValue,
    QuestionGenerationTargetType,
    SimilarQuestionCandidate,
} from './types';

const getResolvedQuestionType = (question: Question, fallbackQuizSetType?: QuestionType | 'mixed') => {
    if (question.questionType) {
        return question.questionType;
    }
    if (fallbackQuizSetType === 'memorization') {
        return 'memorization';
    }
    return 'quiz';
};

const buildQuestionAnswerSummary = (question: Question, questionType: QuestionType) => {
    if (questionType === 'memorization') {
        return question.explanation.trim();
    }

    return question.correctAnswers
        .filter((answer): answer is number => typeof answer === 'number')
        .map((answer) => question.options[answer] ?? '')
        .filter((answer) => answer.trim().length > 0)
        .join(' ');
};

const buildExistingComparisonText = (question: Question, questionType: QuestionType) => {
    return [
        question.text,
        ...question.options,
        buildQuestionAnswerSummary(question, questionType),
        question.explanation,
    ].join(' ');
};

const buildDraftComparisonText = (draft: QuestionDraftFormValue) => {
    const correctAnswerText = draft.correctAnswers
        .map((answer) => draft.options[answer] ?? '')
        .filter((answer) => answer.trim().length > 0)
        .join(' ');

    return [
        draft.text,
        ...draft.options,
        correctAnswerText,
        draft.explanation,
    ].join(' ');
};

const toCandidate = (
    question: Question,
    textSimilarity: number,
    combinedSimilarity: number,
    reason: string
): SimilarQuestionCandidate => ({
    question,
    textSimilarity,
    combinedSimilarity,
    reason,
});

export const pickDuplicateReferenceQuestions = (
    questions: Question[],
    requestText: string,
    targetType: QuestionGenerationTargetType,
    fallbackQuizSetType?: QuestionType | 'mixed',
    limit = 4
): ExistingQuestionReference[] => {
    const normalizedRequest = normalizeQuestionComparisonValue(requestText);
    if (normalizedRequest.length === 0) {
        return [];
    }

    return questions
        .map((question) => {
            const questionType = getResolvedQuestionType(question, fallbackQuizSetType);
            if (questionType !== targetType) {
                return null;
            }

            const textSimilarity = calculateNgramJaccardSimilarity(requestText, question.text);
            const combinedSimilarity = calculateNgramJaccardSimilarity(
                requestText,
                buildExistingComparisonText(question, questionType)
            );
            const score = Math.max(textSimilarity, combinedSimilarity * 0.9);

            if (score < 0.08) {
                return null;
            }

            const reason = textSimilarity >= combinedSimilarity
                ? '依頼文と問題文の近さが高い'
                : '依頼文と論点・選択肢の近さが高い';

            return {
                question,
                textSimilarity,
                combinedSimilarity,
                reason,
            };
        })
        .filter((candidate): candidate is ExistingQuestionReference => candidate !== null)
        .sort((left, right) => (
            Math.max(right.textSimilarity, right.combinedSimilarity)
            - Math.max(left.textSimilarity, left.combinedSimilarity)
        ))
        .slice(0, limit);
};

export const findDraftDuplicateCandidates = (
    draft: QuestionDraftFormValue,
    questions: Question[],
    fallbackQuizSetType?: QuestionType | 'mixed'
): DuplicateCheckResult => {
    const normalizedDraftText = normalizeQuestionComparisonValue(draft.text);
    const draftComparisonText = buildDraftComparisonText(draft);
    const exactTextMatches: SimilarQuestionCandidate[] = [];
    const normalizedTextMatches: SimilarQuestionCandidate[] = [];
    const similarMatches: SimilarQuestionCandidate[] = [];

    questions.forEach((question) => {
        const questionType = getResolvedQuestionType(question, fallbackQuizSetType);
        if (questionType !== draft.questionType) {
            return;
        }

        const normalizedQuestionText = normalizeQuestionComparisonValue(question.text);
        const textSimilarity = calculateNgramJaccardSimilarity(draft.text, question.text);
        const combinedSimilarity = calculateNgramJaccardSimilarity(
            draftComparisonText,
            buildExistingComparisonText(question, questionType)
        );

        if (draft.text.trim() === question.text.trim()) {
            exactTextMatches.push(toCandidate(question, textSimilarity, combinedSimilarity, '問題文が完全一致しています。'));
            return;
        }

        if (normalizedDraftText.length > 0 && normalizedDraftText === normalizedQuestionText) {
            normalizedTextMatches.push(toCandidate(question, textSimilarity, combinedSimilarity, '空白や表記ゆれを除くと問題文が一致しています。'));
            return;
        }

        if (textSimilarity >= 0.72 || combinedSimilarity >= 0.6) {
            const reason = combinedSimilarity >= 0.78
                ? '問題文・選択肢・正答・解説を合わせた類似度が高めです。'
                : textSimilarity >= 0.82
                    ? '問題文の類似度が高めです。'
                    : '論点や選択肢の組み合わせが近い可能性があります。';
            similarMatches.push(toCandidate(question, textSimilarity, combinedSimilarity, reason));
        }
    });

    similarMatches.sort((left, right) => (
        Math.max(right.textSimilarity, right.combinedSimilarity)
        - Math.max(left.textSimilarity, left.combinedSimilarity)
    ));

    const level = exactTextMatches.length > 0 || normalizedTextMatches.length > 0
        ? 'high'
        : similarMatches.some((candidate) => candidate.textSimilarity >= 0.82 || candidate.combinedSimilarity >= 0.78)
            ? 'high'
            : similarMatches.length > 0
                ? 'warning'
                : 'none';

    return {
        level,
        exactTextMatches,
        normalizedTextMatches,
        similarMatches: similarMatches.slice(0, 5),
    };
};
