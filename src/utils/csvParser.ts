import Papa from 'papaparse';
import type { Question } from '../types';

// Helper to protect commas inside math formulas $...$ or $$...$$
const protectMathCommas = (text: string): string => {
    // Replace commas inside $...$ or $$...$$ with a rare placeholder
    return text.replace(/(\$\$?)([^$]+)\1/g, (_, p1, p2) => {
        return p1 + p2.replace(/,/g, '___COMMA___') + p1;
    });
};

const restoreMathCommas = (text: string | undefined): string => {
    if (!text) return text || '';
    return text.replace(/___COMMA___/g, ',');
};

// Keep | inside math formulas as a literal (e.g. |x|), not as answer separator.
const protectMathPipes = (text: string): string => {
    return text.replace(/(\$\$?)([^$]+)\1/g, (_, p1, p2) => {
        return p1 + p2.replace(/\|/g, '___PIPE___') + p1;
    });
};

const restoreMathPipes = (text: string): string => {
    return text.replace(/___PIPE___/g, '|');
};

const splitPipeSeparatedValues = (text: string | undefined): string[] => {
    if (!text) return [];
    return protectMathPipes(text)
        .split('|')
        .map(value => restoreMathPipes(value).trim())
        .filter(value => value.length > 0);
};

interface RawQuestion {
    id: string;
    category: string;
    text: string;
    options: string; // JSON array or pipe separated
    correct_answers: string; // comma separated indices like "1,2"
    explanation: string;
    questiontype?: string;
    question_type?: string;
}

export type ParsedQuestion = Omit<Question, 'id' | 'quizSetId'>;

export const parseQuestions = (file: File): Promise<ParsedQuestion[]> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: 'UTF-8',
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: (results) => {
                const data = results.data as any[];
                if (data.length > 0 && Object.keys(data[0] || {}).length <= 1) {
                    Papa.parse(file, {
                        header: true,
                        skipEmptyLines: true,
                        encoding: 'Shift-JIS',
                        transformHeader: (h) => h.trim().toLowerCase(),
                        complete: (res) => resolve(processRows(res.data as any[])),
                        error: (err) => reject(err)
                    });
                } else {
                    resolve(processRows(data));
                }
            },
            error: (error: any) => {
                reject(error);
            }
        });
    });
};

const processRows = (data: any[]): ParsedQuestion[] => {
    try {
        return data.map((row: any) => {
            const raw = row as RawQuestion;
            let options: string[] = [];
            if (raw.options) {
                try {
                    const parsedOptions = JSON.parse(raw.options);
                    if (Array.isArray(parsedOptions)) {
                        options = parsedOptions
                            .map((option) => restoreMathCommas(String(option)).trim())
                            .filter((option) => option.length > 0);
                    }
                } catch {
                    options = splitPipeSeparatedValues(restoreMathCommas(raw.options));
                }
            }

            // Fallback for "option 1", "option 2", etc.
            if (options.length === 0) {
                for (let i = 1; i <= 10; i++) {
                    const opt = row[`option ${i}`] || row[`option${i}`] || row[`選択肢${i}`] || row[`選択肢 ${i}`];
                    if (opt) {
                        options.push(restoreMathCommas(String(opt)).trim());
                    }
                }
            }

            const rawCorrectAnswers = raw.correct_answers || row['correct answer'] || row['correct answer (1-4)'] || row['正解'] || row['正解 (1-4)'];
            const correctAnswers = rawCorrectAnswers
                ? String(rawCorrectAnswers).split(',').map(s => parseInt(s.trim()) - 1).filter(n => !isNaN(n))
                : [];

            let qType: 'quiz' | 'memorization' = 'quiz';
            const explicitType = String(raw.questiontype || raw.question_type || row['問題タイプ'] || row['タイプ'] || row['questiontype'] || '').toLowerCase().trim();
            if (explicitType === 'memorization' || explicitType === '暗記') {
                qType = 'memorization';
            } else if (explicitType === 'quiz' || explicitType === '選択') {
                qType = 'quiz';
            } else {
                // Infer based on provided columns
                if (correctAnswers.length === 0) {
                    qType = 'memorization';
                } else {
                    qType = 'quiz';
                }
            }

            const categoryText = restoreMathCommas(raw.category || row['カテゴリ'] || '') || 'General';
            const questionText = restoreMathCommas(raw.text || row['問題文'] || row['question'] || '') || '';
            let explanationText = restoreMathCommas(raw.explanation || row['解説'] || '') || '';

            if (qType === 'memorization') {
                const ansText = options.join('\n');
                if (ansText) {
                    explanationText = explanationText ? `${ansText}\n\n${explanationText}` : ansText;
                }
                return {
                    category: categoryText,
                    text: questionText,
                    options: [],
                    correctAnswers: [],
                    explanation: explanationText,
                    questionType: qType
                };
            }

            return {
                category: categoryText,
                text: questionText,
                options,
                correctAnswers,
                explanation: explanationText,
                questionType: qType
            };
        }).filter(q => q.text && (q.questionType === 'memorization' ? q.explanation.length > 0 : q.options.length > 0));
    } catch (error) {
        console.error('Error processing rows:', error);
        return [];
    }
};

export const parseQuestionsFromText = (text: string): Promise<ParsedQuestion[]> => {
    return new Promise((resolve, reject) => {
        const processedText = protectMathCommas(text);
        Papa.parse(processedText, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: (results) => {
                resolve(processRows(results.data as any[]));
            },
            error: (error: any) => {
                reject(error);
            }
        });
    });
};

interface RawMemorizationQuestion {
    question: string;
    answer: string;
    category: string;
    explanation?: string;
}

const processMemorizationRows = (data: any[]): ParsedQuestion[] => {
    return data.map((row: any) => {
        const raw = row as RawMemorizationQuestion;
        const answers = splitPipeSeparatedValues(restoreMathCommas(raw.answer));
        const ansText = answers.join('\n');
        const expText = restoreMathCommas(raw.explanation) || '';

        let mergedExplanation = expText;
        if (ansText) {
            mergedExplanation = expText ? `${ansText}\n\n${expText}` : ansText;
        }

        return {
            category: restoreMathCommas(raw.category) || 'General',
            text: restoreMathCommas(raw.question) || '',
            options: [],
            correctAnswers: [],
            explanation: mergedExplanation,
            questionType: 'memorization' as const
        };
    }).filter(q => q.text && q.explanation.length > 0);
};

export const parseMemorizationQuestions = (file: File): Promise<ParsedQuestion[]> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: 'UTF-8',
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: (results) => {
                const data = results.data as any[];
                if (data.length > 0) {
                    const firstRow = data[0] as RawMemorizationQuestion;
                    if (!firstRow.question && !firstRow.answer) {
                        Papa.parse(file, {
                            header: true,
                            skipEmptyLines: true,
                            encoding: 'Shift-JIS',
                            transformHeader: (h) => h.trim().toLowerCase(),
                            complete: (res) => resolve(processMemorizationRows(res.data as any[])),
                            error: (err) => reject(err)
                        });
                        return;
                    }
                }
                resolve(processMemorizationRows(data));
            },
            error: (error: any) => {
                reject(error);
            }
        });
    });
};

export const parseMemorizationQuestionsFromText = (text: string): Promise<ParsedQuestion[]> => {
    return new Promise((resolve, reject) => {
        const processedText = protectMathCommas(text);
        Papa.parse(processedText, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: (results) => {
                resolve(processMemorizationRows(results.data as any[]));
            },
            error: (error: any) => {
                reject(error);
            }
        });
    });
};
