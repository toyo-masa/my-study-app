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

interface RawQuestion {
    id: string;
    category: string;
    text: string;
    options: string; // JSON array or pipe separated
    correct_answers: string; // comma separated indices like "1,2"
    explanation: string;
}

export type ParsedQuestion = Omit<Question, 'id' | 'quizSetId'>;

export const parseQuestions = (file: File): Promise<ParsedQuestion[]> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: (results) => {
                try {
                    const parsedQuestions: ParsedQuestion[] = results.data.map((row: any) => {
                        const raw = row as RawQuestion;
                        let options: string[] = [];
                        try {
                            options = JSON.parse(raw.options);
                        } catch {
                            options = raw.options ? raw.options.split('|').map(o => o.trim()) : [];
                        }

                        const correctAnswers = raw.correct_answers
                            ? raw.correct_answers.split(',').map(s => parseInt(s.trim()) - 1).filter(n => !isNaN(n))
                            : [];

                        return {
                            category: raw.category || 'General',
                            text: raw.text || '',
                            options,
                            correctAnswers,
                            explanation: raw.explanation || ''
                        };
                    }).filter(q => q.text && q.options.length > 0);

                    resolve(parsedQuestions);
                } catch (error) {
                    reject(error);
                }
            },
            error: (error: any) => {
                reject(error);
            }
        });
    });
};

export const parseQuestionsFromText = (text: string): Promise<ParsedQuestion[]> => {
    return new Promise((resolve, reject) => {
        const processedText = protectMathCommas(text);
        Papa.parse(processedText, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: (results) => {
                try {
                    const parsedQuestions: ParsedQuestion[] = results.data.map((row: any) => {
                        const raw = row as RawQuestion;
                        let options: string[] = [];
                        try {
                            options = JSON.parse(raw.options);
                        } catch {
                            options = raw.options ? raw.options.split('|').map(o => o.trim()) : [];
                        }

                        const correctAnswers = raw.correct_answers
                            ? raw.correct_answers.split(',').map(s => parseInt(s.trim()) - 1).filter(n => !isNaN(n))
                            : [];

                        return {
                            category: raw.category || 'General',
                            text: raw.text || '',
                            options,
                            correctAnswers,
                            explanation: raw.explanation || ''
                        };
                    }).filter(q => q.text && q.options.length > 0);

                    resolve(parsedQuestions);
                } catch (error) {
                    reject(error);
                }
            },
            error: (error: any) => {
                reject(error);
            }
        });
    });
};

interface RawMemorizationQuestion {
    question: string;
    answer: string; // pipe separated
    category: string;
    explanation?: string;
}

export const parseMemorizationQuestions = (file: File): Promise<ParsedQuestion[]> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
            complete: (results) => {
                try {
                    const parsedQuestions: ParsedQuestion[] = results.data.map((row: any) => {
                        const raw = row as RawMemorizationQuestion;
                        // answer needs to be split by pipe
                        const answers = raw.answer ? restoreMathCommas(raw.answer).split('|').map(a => a.trim()).filter(a => a) : [];

                        return {
                            category: restoreMathCommas(raw.category) || 'General',
                            text: restoreMathCommas(raw.question) || '',
                            options: answers, // storage for correct answers
                            correctAnswers: [], // unused in memorization mode
                            explanation: restoreMathCommas(raw.explanation) || ''
                        };
                    }).filter(q => q.text && q.options.length > 0);

                    resolve(parsedQuestions);
                } catch (error) {
                    reject(error);
                }
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
                try {
                    const parsedQuestions: ParsedQuestion[] = results.data.map((row: any) => {
                        const raw = row as RawMemorizationQuestion;
                        const answers = raw.answer ? restoreMathCommas(raw.answer).split('|').map(a => a.trim()).filter(a => a) : [];

                        return {
                            category: restoreMathCommas(raw.category) || 'General',
                            text: restoreMathCommas(raw.question) || '',
                            options: answers,
                            correctAnswers: [],
                            explanation: restoreMathCommas(raw.explanation) || ''
                        };
                    }).filter(q => q.text && q.options.length > 0);

                    resolve(parsedQuestions);
                } catch (error) {
                    reject(error);
                }
            },
            error: (error: any) => {
                reject(error);
            }
        });
    });
};
