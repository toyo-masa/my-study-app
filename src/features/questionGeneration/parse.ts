import { parseAssistantMessageContent } from '../../utils/webLlmBudgetedGeneration';
import type { QuestionGenerationTargetType, QuestionDraftFormValue } from './types';

const extractJsonLikeText = (rawText: string) => {
    const answerText = parseAssistantMessageContent(rawText).answerContent.trim() || rawText.trim();
    const fencedMatch = answerText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? answerText;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return candidate;
    }

    return candidate.slice(firstBrace, lastBrace + 1);
};

const ensureString = (value: unknown, fieldName: string, allowEmpty = false) => {
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} が文字列ではありません。`);
    }

    const trimmed = value.trim();
    if (!allowEmpty && trimmed.length === 0) {
        throw new Error(`${fieldName} が空です。`);
    }

    return trimmed;
};

const normalizeOptions = (value: unknown) => {
    if (!Array.isArray(value)) {
        throw new Error('options が配列ではありません。');
    }

    return value
        .map((option) => (typeof option === 'string' ? option.trim() : ''))
        .filter((option) => option.length > 0);
};

const normalizeCorrectAnswers = (value: unknown, optionsLength: number) => {
    if (!Array.isArray(value)) {
        throw new Error('correctAnswers が配列ではありません。');
    }

    const answers = value
        .map((answer) => (
            typeof answer === 'number'
                ? Math.trunc(answer)
                : typeof answer === 'string' && answer.trim().length > 0
                    ? Number.parseInt(answer.trim(), 10)
                    : Number.NaN
        ))
        .filter((answer) => Number.isInteger(answer) && answer >= 0 && answer < optionsLength);

    if (answers.length === 0) {
        throw new Error('correctAnswers に有効な正答 index がありません。');
    }

    return Array.from(new Set(answers)).sort((left, right) => left - right);
};

export const parseQuestionDraftResponse = (
    rawText: string,
    targetType: QuestionGenerationTargetType
): QuestionDraftFormValue => {
    const jsonText = extractJsonLikeText(rawText);
    let parsed: unknown;

    try {
        parsed = JSON.parse(jsonText);
    } catch {
        throw new Error('AI の出力を JSON として解釈できませんでした。');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('AI の出力が問題データのオブジェクトではありません。');
    }

    const source = parsed as Record<string, unknown>;
    const questionType = targetType;
    const category = typeof source.category === 'string' ? source.category.trim() : '';
    const text = ensureString(source.text, 'text');
    const explanation = ensureString(source.explanation, 'explanation');

    if (questionType === 'memorization') {
        return {
            category,
            questionType,
            text,
            options: [],
            correctAnswers: [],
            explanation,
        };
    }

    const options = normalizeOptions(source.options);
    if (options.length < 2) {
        throw new Error('選択式問題の options は 2 件以上必要です。');
    }

    const correctAnswers = normalizeCorrectAnswers(source.correctAnswers, options.length);

    return {
        category,
        questionType,
        text,
        options,
        correctAnswers,
        explanation,
    };
};
