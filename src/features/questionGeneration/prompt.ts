import type { Question } from '../../types';
import type { ExistingQuestionReference, QuestionGenerationContext } from './types';

const resolveQuestionTypeLabel = (value: Question['questionType']) => (
    value === 'memorization' ? '暗記カード' : '選択式問題'
);

const formatCorrectAnswerText = (question: Question) => {
    if ((question.questionType ?? 'quiz') === 'memorization') {
        return '説明文側に含める';
    }

    const labels = question.correctAnswers
        .filter((answer): answer is number => typeof answer === 'number')
        .map((answer) => {
            const optionText = question.options[answer];
            return optionText ? `${answer}: ${optionText}` : String(answer);
        });

    return labels.length > 0 ? labels.join(' / ') : '未設定';
};

const formatReferenceQuestion = (reference: ExistingQuestionReference, index: number) => {
    const { question, reason } = reference;
    return [
        `${index + 1}. 種別: ${resolveQuestionTypeLabel(question.questionType)}`,
        `カテゴリ: ${question.category || '未設定'}`,
        `問題文: ${question.text.trim() || '未設定'}`,
        question.options.length > 0
            ? `選択肢: ${question.options.map((option, optionIndex) => `${optionIndex}. ${option}`).join(' / ')}`
            : '選択肢: なし',
        `正答: ${formatCorrectAnswerText(question)}`,
        `解説: ${question.explanation.trim() || '未設定'}`,
        `避けたい理由: ${reason}`,
    ].join('\n');
};

export const buildQuestionGenerationSystemPrompt = () => {
    return [
        'あなたは日本語の学習問題作成アシスタントです。',
        '必ず 1 問分だけ作成してください。',
        '出力は JSON オブジェクト 1 個だけにしてください。',
        'Markdown、コードブロック、前置き、補足説明、<think> タグは禁止です。',
        'ユーザーの依頼を尊重しつつ、問題文・選択肢・正答・解説がフォームへそのまま入れられる粒度で返してください。',
        '既存問題と重複しないことを優先してください。',
    ].join('\n');
};

export const buildQuestionGenerationUserPrompt = ({
    quizSetName,
    quizSetType,
    targetType,
    requestText,
    duplicateReferences,
}: QuestionGenerationContext) => {
    const typeSection = targetType === 'memorization'
        ? [
            '今回は暗記カードとして 1 問作成してください。',
            'JSON スキーマ:',
            '{"category":"string","questionType":"memorization","text":"string","options":[],"correctAnswers":[],"explanation":"string"}',
            'explanation には、答えだけでなく覚えるポイントや簡潔な補足も含めてください。',
        ]
        : [
            '今回は選択式問題として 1 問作成してください。',
            'JSON スキーマ:',
            '{"category":"string","questionType":"quiz","text":"string","options":["string"],"correctAnswers":[0],"explanation":"string"}',
            'correctAnswers は 0 始まりの整数 index 配列にしてください。',
            'options は空文字を含めず、correctAnswers の index と必ず整合させてください。',
        ];

    const duplicateSection = duplicateReferences.length > 0
        ? [
            '次の既存問題とは、問題文の表現だけでなく、選択肢・正答・論点まで近くならないようにしてください。',
            duplicateReferences.map(formatReferenceQuestion).join('\n\n'),
        ].join('\n\n')
        : '既存問題の直接参照候補は見つかっていません。ただし、一般的でありふれた出題に寄せすぎず、独自性を保ってください。';

    return [
        `問題集名: ${quizSetName}`,
        `問題集の種別: ${quizSetType ?? 'quiz'}`,
        `今回の生成対象: ${targetType}`,
        '',
        'ユーザー依頼:',
        requestText.trim(),
        '',
        ...typeSection,
        '',
        '必須ルール:',
        '- category は依頼に合う短いカテゴリ名にしてください。不要なら空文字でも構いません。',
        '- text は問題文だけを書いてください。',
        '- explanation は、保存前に人が確認しやすい自然な日本語で書いてください。',
        '- 情報が足りない場合は、安全な前提で補ってください。',
        '',
        duplicateSection,
    ].join('\n');
};
