import type { Question, QuestionType, QuizSetType } from '../../types';

export type QuestionGenerationTargetType = QuestionType;

export type QuestionDraftFormValue = {
    category: string;
    text: string;
    options: string[];
    correctAnswers: number[];
    explanation: string;
    questionType: QuestionType;
};

export type ExistingQuestionReference = {
    question: Question;
    textSimilarity: number;
    combinedSimilarity: number;
    reason: string;
};

export type SimilarQuestionCandidate = {
    question: Question;
    textSimilarity: number;
    combinedSimilarity: number;
    reason: string;
};

export type DuplicateWarningLevel = 'none' | 'warning' | 'high';

export type DuplicateCheckResult = {
    level: DuplicateWarningLevel;
    exactTextMatches: SimilarQuestionCandidate[];
    normalizedTextMatches: SimilarQuestionCandidate[];
    similarMatches: SimilarQuestionCandidate[];
};

export type QuestionGenerationContext = {
    quizSetName: string;
    quizSetType: QuizSetType | undefined;
    targetType: QuestionGenerationTargetType;
    requestText: string;
    duplicateReferences: ExistingQuestionReference[];
};
