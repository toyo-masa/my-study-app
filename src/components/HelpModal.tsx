import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import '../App.css';

const QUIZ_HEADER = `category,text,options,correct_answers,explanation`;
const QUIZ_EXAMPLE = `General,日本の首都は?,東京|大阪|京都,1,東京です`;
const QUIZ_AI_INSTRUCTION = `以下の内容を、指定のCSVフォーマットに変換し、CSVファイルで出力してください。

【CSVフォーマット仕様】
ヘッダー行: category,text,options,correct_answers,explanation

各カラムの説明:
- category: カテゴリ名（例: General, AWS）
- text: 問題文
- options: 選択肢を | 区切りで記述
- correct_answers: 正解番号（1始まり）。複数正解はカンマ区切り
- explanation: 解説文

記述例:
category,text,options,correct_answers,explanation
General,日本の首都は?,東京|大阪|京都,1,東京です

【注意事項】
- 1行目はヘッダー行にしてください
- 選択肢は | で区切ってください
- 正解番号は1始まりです
- テキスト中にカンマが含まれる場合はダブルクォートで囲んでください
- 問題文に問題番号（1. や Q1. など）を含めないでください
- 正解番号はランダムにしてください（全て1が正解のように固定しないでください）
- 問題文および解説文には適切な位置で改行を入れてください（改行には \\n を使用してください）
- 解説文は正解の理由だけでなく、誤りの理由も記述してください
- 全て作成し終わったら、問題の順番をランダムに入れ替えてください
- 誤りの理由は、正解ではないから。といった理由はやめてください。問題文を踏まえて、誤りの選択肢はなぜ正解ではないのかを、与えられている情報を確実に参照して論理的に説明してください
- 複数選択（正解が複数ある）の問題も作成可能であれば、単一選択の問題と混ぜて作成してください
- 数式を表す場合は必ずKaTeX記法を使用し、インライン数式は $...$、ブロック数式は $$...$$ のように囲んでください
- 解説は「その1行だけ読めば理解できる」粒度で、2〜5文程度で具体例も1つ入れてください
- 可能なら「定義 → 直感（日本語） → 代表式（あれば） → 注意点（条件・定義域など）」の順で書いてください
- 解説は記号だけで済ませず、何を意味するかを必ず日本語で説明してください
- 式の意味と前提条件（例：$x\ge0$, $t<\lambda$ など）は明記してください
- 解説文は適切に改行を入れてください
- 問題文は何を回答して欲しいかが明確な文章にしてください
- 省略語を用いる場合は、省略なしのケースを問題文に含めてください

【変換対象の内容】
`;

const MEMO_HEADER = `question,answer,category,explanation`;
const MEMO_EXAMPLE = `日本の四季は?,春|夏|秋|冬,一般常識,それぞれスプリング、サマー、オータム、ウィンターとも呼ばれます`;
const MEMO_AI_INSTRUCTION = `以下の内容を、指定のCSVフォーマットに変換し、CSVファイルで出力してください。

【CSVフォーマット仕様】
ヘッダー行: question,answer,category,explanation

各カラムの説明:
- question: 問題文（例: 日本の四季は?）
- answer: 正解を | 区切りで記述（例: 春|夏|秋|冬）
- category: カテゴリ名（例: 一般常識）
- explanation: 解説文（任意。正解の補足情報などを記入）

記述例:
question,answer,category,explanation
日本の四季は?,春|夏|秋|冬,一般常識,"日本の気候は春・夏・秋・冬の4つの季節に区分されます。英語ではそれぞれ Spring / Summer / Autumn / Winter と表現します。会話では Autumn の代わりに Fall を使うこともあります。"
ポアソン分布 $X\sim\mathrm{Poisson}(\lambda)$ の平均と分散は?,$E[X]=\lambda$|$Var(X)=\lambda$,確率分布,"ポアソン分布は単位時間（または単位区間）あたり平均 $\lambda$ 回起きる事象の回数を表します。平均と分散がどちらも $\lambda$ になる点が重要な暗記ポイントです。$P(X=k)=\dfrac{e^{-\lambda}\lambda^k}{k!}$ からモーメント母関数 $M_X(t)=\exp(\lambda(e^t-1))$ を使って導けますが、暗記カードでは結論（平均＝分散＝$\lambda$）を即答できるようにします。"

【注意事項】
- 1行目はヘッダー行にしてください
- 複数の正解は | で区切ってください
- 出力はCSVテキストとCSVファイルの両方でお願いします
- 問題文に問題番号（1. や Q1. など）を含めないでください
- 全て作成し終わったら、問題の順番をランダムに入れ替えてください
- 数式を表す場合は必ずKaTeX記法を使用し、インライン数式は $...$、ブロック数式は $$...$$ のように囲んでください
- 解説は「その1行だけ読めば理解できる」粒度で、2〜5文程度で具体例も1つ入れてください
- 可能なら「定義 → 直感（日本語） → 代表式（あれば） → 注意点（条件・定義域など）」の順で解説を書いてください
- 解説は記号だけで済ませず、何を意味するかを必ず日本語で説明してください
- 式の意味と前提条件（例：$x\ge0$, $t<\lambda$ など）は明記してください
- 解説文は適切に改行を入れてください
- 問題文は何を回答して欲しいかが明確な文章にしてください
- 省略語を用いる場合は、省略なしのケースを問題文に含めてください

【変換対象の内容】
`;

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<'quiz' | 'memorization'>('quiz');
    const [copied, setCopied] = useState<string | null>(null);

    const handleCopy = async (text: string, label: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="help-popover"
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    style={{ width: '450px', maxWidth: '90vw' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="help-popover-header" style={{ alignItems: 'center' }}>
                        <div className="help-tabs">
                            <button className={activeTab === 'quiz' ? 'active' : ''} onClick={() => setActiveTab('quiz')}>通常問題集</button>
                            <button className={activeTab === 'memorization' ? 'active' : ''} onClick={() => setActiveTab('memorization')}>暗記カード</button>
                        </div>
                        <button className="help-close-btn" onClick={onClose}>
                            <X size={16} />
                        </button>
                    </div>

                    <div className="help-popover-body">
                        {activeTab === 'quiz' ? (
                            <>
                                <p className="help-section-title">ヘッダー行（必須）</p>
                                <div className="help-code-block">
                                    <code>{QUIZ_HEADER}</code>
                                    <button className="help-copy-btn" onClick={() => handleCopy(QUIZ_HEADER, 'header')}>
                                        {copied === 'header' ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>

                                <p className="help-section-title">各カラムの説明</p>
                                <table className="help-table">
                                    <tbody>
                                        <tr><td><code>category</code></td><td>カテゴリ名</td></tr>
                                        <tr><td><code>text</code></td><td>問題文</td></tr>
                                        <tr><td><code>options</code></td><td>選択肢 (<code>|</code> 区切り)</td></tr>
                                        <tr><td><code>correct_answers</code></td><td>正解番号 (1始まり)</td></tr>
                                        <tr><td><code>explanation</code></td><td>解説文</td></tr>
                                    </tbody>
                                </table>

                                <p className="help-section-title">記述例</p>
                                <div className="help-code-block">
                                    <code>{QUIZ_EXAMPLE}</code>
                                    <button className="help-copy-btn" onClick={() => handleCopy(QUIZ_HEADER + '\n' + QUIZ_EXAMPLE, 'example')}>
                                        {copied === 'example' ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>

                                <div className="help-ai-instruction">
                                    <button className="help-ai-copy-btn" onClick={() => handleCopy(QUIZ_AI_INSTRUCTION, 'ai')}>
                                        {copied === 'ai' ? <><Check size={14} /> コピーしました！</> : <><Copy size={14} /> AI用変換指示をコピー</>}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="help-section-title">ヘッダー行（必須）</p>
                                <div className="help-code-block">
                                    <code>{MEMO_HEADER}</code>
                                    <button className="help-copy-btn" onClick={() => handleCopy(MEMO_HEADER, 'header_memo')}>
                                        {copied === 'header_memo' ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>

                                <p className="help-section-title">各カラムの説明</p>
                                <table className="help-table">
                                    <tbody>
                                        <tr><td><code>question</code></td><td>問題文</td></tr>
                                        <tr><td><code>answer</code></td><td>正解 (複数の場合は <code>|</code> 区切り)</td></tr>
                                        <tr><td><code>category</code></td><td>カテゴリ名</td></tr>
                                        <tr><td><code>explanation</code></td><td>解説文 (任意)</td></tr>
                                    </tbody>
                                </table>

                                <p className="help-section-title">記述例</p>
                                <div className="help-code-block">
                                    <code>{MEMO_EXAMPLE}</code>
                                    <button className="help-copy-btn" onClick={() => handleCopy(MEMO_HEADER + '\n' + MEMO_EXAMPLE, 'example_memo')}>
                                        {copied === 'example_memo' ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>

                                <div className="help-ai-instruction">
                                    <button className="help-ai-copy-btn" onClick={() => handleCopy(MEMO_AI_INSTRUCTION, 'ai_memo')}>
                                        {copied === 'ai_memo' ? <><Check size={14} /> コピーしました！</> : <><Copy size={14} /> AI用変換指示をコピー</>}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
