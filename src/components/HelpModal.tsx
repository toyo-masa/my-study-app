import React, { useCallback, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTemporaryCopiedState } from '../hooks/useTemporaryCopiedState';
import { copyTextToClipboard } from '../utils/clipboard';
import '../App.css';

type HelpTabKey = 'quiz' | 'memorization' | 'mixed';
type CopyTarget = 'header' | 'example' | 'instruction';

type HelpColumn = {
    name: string;
    description: string;
    tableDescription?: React.ReactNode;
};

type HelpTabConfig = {
    key: HelpTabKey;
    label: string;
    header: string;
    example: string;
    columns: HelpColumn[];
    instruction: string;
};

const COMMON_OUTPUT_GUIDELINES = [
    '今回の出力形式や問題形式についてユーザーが明示した指示がある場合は、その指示を最優先してください',
    '1行目はヘッダー行にしてください',
    'テキスト中にカンマが含まれる場合は、該当セル全体をダブルクォートで囲んでください',
    '問題文に問題番号（1. や Q1. など）を含めないでください',
    '問題文や解説文に改行を入れる場合は、CSVセル内で実際の改行文字を使い、そのセル全体をダブルクォートで囲んでください',
    '文字列としての \\n は使わず、実際に改行してください',
    '解説文を複数段落にする場合は、段落ごとに空行を1行入れてください',
    '数式を表す場合は必ずKaTeX記法を使用し、インライン数式は $...$、ブロック数式は $$...$$ のように囲んでください',
    '問題文は、何を回答してほしいかが明確に伝わる文章にしてください',
    '省略語を使う場合は、省略なしの表現を明示するか意味が分かる形にしてください',
    '全て作成し終わったら、問題の順番をランダムに入れ替えてください',
];

const COMMON_EXPLANATION_GUIDELINES = [
    '解説は短くまとめすぎず、読んだ人が「なぜその答えになるか」を追える情報量にしてください',
    '解説は原則として3段落以上に分け、「結論」「理由」「具体例・注意点」を分けて書いてください',
    '「結論」では、質問に対する答えを簡潔に書いてください。選択問題であれば、正解の選択肢を明示してください',
    '「理由」では、定義・判断基準・仕組み・因果関係・比較観点など、その問題の理解に必要な根拠を省略せずに書いてください',
    '「理由」では、誤りの選択肢がある場合は、選択肢番号ごとに、なぜそれが誤りなのかも説明してください',
    '「具体例・注意点」は、ユーザーが問題と解説の内容をより深く理解できるような情報を書いてください',
    '数学や統計の問題の場合、途中式や途中判断を省略せず、どのように考えてその答えに至るのかが分かるようにしてください',
    '日本語の言い換えだけで終わらせず、結論や判断の根拠になる情報を含めてください',
];

const QUIZ_HEADER = 'category,text,options,correct_answers,explanation';
const QUIZ_EXAMPLE = 'General,日本の首都は?,東京|大阪|京都,1,東京です';
const QUIZ_COLUMNS: HelpColumn[] = [
    { name: 'category', description: 'カテゴリ名（例: General, AWS）', tableDescription: 'カテゴリ名' },
    { name: 'text', description: '問題文', tableDescription: '問題文' },
    { name: 'options', description: '選択肢を | 区切りで記述', tableDescription: <>選択肢 (<code>|</code> 区切り)</> },
    { name: 'correct_answers', description: '正解番号（1始まり）。複数正解はカンマ区切り', tableDescription: '正解番号 (1始まり)' },
    { name: 'explanation', description: '解説文', tableDescription: '解説文' },
];

const MEMORIZATION_HEADER = 'question,answer,category,explanation';
const MEMORIZATION_EXAMPLE = '日本の四季は?,春|夏|秋|冬,一般常識,それぞれ春夏秋冬を指します';
const MEMORIZATION_COLUMNS: HelpColumn[] = [
    { name: 'question', description: '問題文（例: 日本の四季は?）', tableDescription: '問題文' },
    { name: 'answer', description: '正解を | 区切りで記述（複数回答可）', tableDescription: <>正解 (複数の場合は <code>|</code> 区切り)</> },
    { name: 'category', description: 'カテゴリ名（例: 一般常識）', tableDescription: 'カテゴリ名' },
    { name: 'explanation', description: '解説文（任意。正解の補足情報などを記入）', tableDescription: '解説文 (任意)' },
];

const MIXED_HEADER = 'category,text,options,correct_answers,explanation';
const MIXED_EXAMPLE = `General,日本の首都は?,東京|大阪|京都,1,東京です
一般常識,日本の四季は?,春|夏|秋|冬,,それぞれ春夏秋冬を指します`;
const MIXED_COLUMNS: HelpColumn[] = [
    { name: 'category', description: 'カテゴリ名（例: General, 日常）', tableDescription: 'カテゴリ名' },
    { name: 'text', description: '問題文', tableDescription: '問題文' },
    { name: 'options', description: '選択問題では選択肢、暗記問題では正解を | 区切りで記述', tableDescription: <>選択肢 / 暗記の正解 (<code>|</code> 区切り)</> },
    { name: 'correct_answers', description: '選択問題では正解番号（1始まり）を記述し、暗記問題では空欄にする', tableDescription: '正解番号 (quiz用)' },
    { name: 'explanation', description: '解説文', tableDescription: '解説文' },
];

const buildInstruction = ({
    header,
    columns,
    example,
    outputGuidelines,
    explanationGuidelines,
}: {
    header: string;
    columns: HelpColumn[];
    example: string;
    outputGuidelines: string[];
    explanationGuidelines: string[];
}) => {
    return [
        '以下の内容を、指定のCSVフォーマットに変換し、CSVファイルで出力してください。',
        '',
        '【CSVフォーマット仕様】',
        `ヘッダー行: ${header}`,
        '',
        '各カラムの説明:',
        ...columns.map((column) => `- ${column.name}: ${column.description}`),
        '',
        '記述例:',
        header,
        example,
        '',
        '【注意事項】',
        ...outputGuidelines.map((guideline) => `- ${guideline}`),
        '',
        '【解説品質の要件】',
        ...explanationGuidelines.map((guideline) => `- ${guideline}`),
        '',
        '【変換対象の内容】',
        '',
    ].join('\n');
};

const HELP_TABS: HelpTabConfig[] = [
    {
        key: 'quiz',
        label: '通常問題集',
        header: QUIZ_HEADER,
        example: QUIZ_EXAMPLE,
        columns: QUIZ_COLUMNS,
        instruction: buildInstruction({
            header: QUIZ_HEADER,
            columns: QUIZ_COLUMNS,
            example: QUIZ_EXAMPLE,
            outputGuidelines: [
                ...COMMON_OUTPUT_GUIDELINES,
                '選択肢は | で区切ってください',
                '正解番号は1始まりです',
                '正解番号が偏りすぎないようにし、全て同じ番号を正解にしないでください',
            ],
            explanationGuidelines: [
                ...COMMON_EXPLANATION_GUIDELINES,
                '正解の理由だけでなく、誤りの選択肢がなぜ誤りかも簡潔に説明してください',
                '誤りの選択肢については、「正解ではないから」で終わらせず、問題文や与えられた情報に基づいて説明してください',
            ],
        }),
    },
    {
        key: 'memorization',
        label: '暗記カード',
        header: MEMORIZATION_HEADER,
        example: MEMORIZATION_EXAMPLE,
        columns: MEMORIZATION_COLUMNS,
        instruction: buildInstruction({
            header: MEMORIZATION_HEADER,
            columns: MEMORIZATION_COLUMNS,
            example: MEMORIZATION_EXAMPLE,
            outputGuidelines: [
                ...COMMON_OUTPUT_GUIDELINES,
                '複数の正解は | で区切ってください',
            ],
            explanationGuidelines: [
                ...COMMON_EXPLANATION_GUIDELINES,
                '暗記問題でも、答えの意味、使い分け、関連知識など、覚える根拠が分かる補足を書いてください',
            ],
        }),
    },
    {
        key: 'mixed',
        label: '混合セット',
        header: MIXED_HEADER,
        example: MIXED_EXAMPLE,
        columns: MIXED_COLUMNS,
        instruction: buildInstruction({
            header: MIXED_HEADER,
            columns: MIXED_COLUMNS,
            example: MIXED_EXAMPLE,
            outputGuidelines: [
                ...COMMON_OUTPUT_GUIDELINES,
                '選択問題では options に選択肢を入れ、correct_answers に正解番号（1始まり）を書いてください',
                '暗記問題では options に正解を入れ、correct_answers は必ず空欄にしてください',
                '選択肢や暗記の正解は | で区切ってください',
                'ユーザーから今回の形式指定がない場合は、選択問題と暗記問題を混ぜて作成してください',
                '選択問題の正解番号が偏りすぎないようにし、全て同じ番号を正解にしないでください',
            ],
            explanationGuidelines: [
                ...COMMON_EXPLANATION_GUIDELINES,
                '選択問題の解説では、正解理由に加えて誤りの選択肢がなぜ誤りかも簡潔に説明してください',
                '誤りの選択肢については、「正解ではないから」で終わらせず、問題文や与えられた情報に基づいて説明してください',
                '暗記問題の解説では、答えの意味、使い分け、関連知識など、覚える根拠が分かる補足を書いてください',
            ],
        }),
    },
];

const buildCopyKey = (tabKey: HelpTabKey, target: CopyTarget) => `${tabKey}:${target}`;

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
    popoverStyle?: React.CSSProperties;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, popoverStyle }) => {
    const [activeTab, setActiveTab] = useState<HelpTabKey>('quiz');
    const { copiedKey, markCopied } = useTemporaryCopiedState();
    const activeContent = HELP_TABS.find((tab) => tab.key === activeTab) ?? HELP_TABS[0];

    const handleCopy = useCallback(async (text: string, label: string) => {
        try {
            await copyTextToClipboard(text);
            markCopied(label);
        } catch {
            // モーダル内ではコピー失敗通知の UI を持たないため黙って維持する
        }
    }, [markCopied]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="help-popover"
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    style={popoverStyle}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="help-popover-header" style={{ alignItems: 'center' }}>
                        <div className="help-tabs">
                            {HELP_TABS.map((tab) => (
                                <button key={tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <button className="help-close-btn" onClick={onClose}>
                            <X size={16} />
                        </button>
                    </div>

                    <div className="help-popover-body">
                        <p className="help-section-title">ヘッダー行（必須）</p>
                        <div className="help-code-block">
                            <code>{activeContent.header}</code>
                            <button className="help-copy-btn" onClick={() => handleCopy(activeContent.header, buildCopyKey(activeContent.key, 'header'))}>
                                {copiedKey === buildCopyKey(activeContent.key, 'header') ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                        </div>

                        <p className="help-section-title">各カラムの説明</p>
                        <table className="help-table">
                            <tbody>
                                {activeContent.columns.map((column) => (
                                    <tr key={column.name}>
                                        <td><code>{column.name}</code></td>
                                        <td>{column.tableDescription ?? column.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <p className="help-section-title">記述例</p>
                        <div className="help-code-block">
                            <code>{activeContent.example}</code>
                            <button
                                className="help-copy-btn"
                                onClick={() => handleCopy(`${activeContent.header}\n${activeContent.example}`, buildCopyKey(activeContent.key, 'example'))}
                            >
                                {copiedKey === buildCopyKey(activeContent.key, 'example') ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                        </div>

                        <div className="help-ai-instruction">
                            <button
                                className="help-ai-copy-btn"
                                onClick={() => handleCopy(activeContent.instruction, buildCopyKey(activeContent.key, 'instruction'))}
                            >
                                {copiedKey === buildCopyKey(activeContent.key, 'instruction')
                                    ? <><Check size={14} /> コピーしました！</>
                                    : <><Copy size={14} /> AI用変換指示をコピー</>}
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};