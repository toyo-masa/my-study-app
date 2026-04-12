import type { Question } from '../types';

const normalizeBaseText = (value: string) => (
    value
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
);

export const normalizeQuestionSearchValue = (value: string) => normalizeBaseText(value);

export const normalizeQuestionComparisonValue = (value: string) => (
    normalizeBaseText(value).replace(/\s+/g, '')
);

export const buildQuestionSearchText = (question: Question) => {
    return normalizeQuestionSearchValue([
        question.text,
        ...(question.options || []),
        question.explanation,
    ].join(' '));
};

export const buildQuestionComparisonText = (question: Question) => {
    return normalizeQuestionComparisonValue([
        question.text,
        ...(question.options || []),
        question.explanation,
    ].join(' '));
};

export const buildCharacterNgramSet = (value: string, size = 2) => {
    const normalized = normalizeQuestionComparisonValue(value);
    if (normalized.length === 0) {
        return new Set<string>();
    }

    if (normalized.length <= size) {
        return new Set([normalized]);
    }

    const ngrams = new Set<string>();
    for (let index = 0; index <= normalized.length - size; index += 1) {
        ngrams.add(normalized.slice(index, index + size));
    }
    return ngrams;
};

export const calculateNgramJaccardSimilarity = (left: string, right: string, size = 2) => {
    const leftSet = buildCharacterNgramSet(left, size);
    const rightSet = buildCharacterNgramSet(right, size);

    if (leftSet.size === 0 || rightSet.size === 0) {
        return 0;
    }

    let intersectionSize = 0;
    leftSet.forEach((token) => {
        if (rightSet.has(token)) {
            intersectionSize += 1;
        }
    });

    const unionSize = leftSet.size + rightSet.size - intersectionSize;
    if (unionSize === 0) {
        return 0;
    }

    return intersectionSize / unionSize;
};
