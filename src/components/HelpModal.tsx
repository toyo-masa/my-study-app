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
    '|は選択肢の区切りや複数正解の区切りにのみ使用し、問題文や解説文には使用しないでください',
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
    '数学や統計の問題の場合、問題文中に解法がほぼ確定する計算式、公式や定理を書かないでください。代入するだけで解ける問題は禁止します',
    '日本語の言い換えだけで終わらせず、結論や判断の根拠になる情報を含めてください',
];

const QUIZ_HEADER = 'category,text,options,correct_answers,explanation';
const QUIZ_EXAMPLE = `統計学,連続確率変数 $X,Y$ の同時確率密度関数が $f_{X,Y}(x,y)=2$ \\(0<x<y<1\\) であり それ以外では 0 であるとする。このとき $P\\left(X<\\frac{1}{4}\\mid Y<\\frac{1}{2}\\right)$ として最も適切なものを一つ選べ,$\\frac{1}{2}$|$\\frac{2}{3}$|$\\frac{3}{4}$|$1$,3,"結論：
この問題の正解は 3 の $\\frac{3}{4}$ です。

理由：
条件付き確率の定義より
$$
P(A\\mid B)=\\frac{P(A\\cap B)}{P(B)}
$$
です。ここで
$$
A=\\left\\{X<\\frac{1}{4}\\right\\},\\qquad B=\\left\\{Y<\\frac{1}{2}\\right\\}
$$
とおきます。まず分母は
$$
P\\left(Y<\\frac{1}{2}\\right)=\\int_0^{1/2}\\int_0^y 2\\,dx\\,dy
$$
です。内側を積分すると
$$
\\int_0^y 2\\,dx=2y
$$
なので
$$
P\\left(Y<\\frac{1}{2}\\right)=\\int_0^{1/2}2y\\,dy=\\left[y^2\\right]_0^{1/2}=\\frac{1}{4}
$$
です。次に分子は、$x<y$ という条件があるため $y=\\frac{1}{4}$ で積分範囲を分けて
$$
P(A\\cap B)=\\int_0^{1/4}\\int_0^y 2\\,dx\\,dy+\\int_{1/4}^{1/2}\\int_0^{1/4}2\\,dx\\,dy
$$
となります。第1項は $\\frac{1}{16}$、第2項は $\\frac{1}{8}$ なので
$$
P(A\\cap B)=\\frac{3}{16}
$$
です。したがって
$$
P\\left(X<\\frac{1}{4}\\mid Y<\\frac{1}{2}\\right)=\\frac{3/16}{1/4}=\\frac{3}{4}
$$
となります。1、2、4 はいずれも分子か分母の領域の取り方を誤った値です。

具体例・注意点：
この問題のポイントは、条件付き確率を「分子と分母の別々の面積」として考えることです。特に分子では、$x<y$ と $x<\\frac{1}{4}$ が同時にあるため、単純な長方形の積分にはなりません。連続型の条件付き確率では、まず領域図を頭の中で描くことが重要です。"
統計学,A班の点数は 60 60 60 60 60 であり B班の点数は 40 50 60 70 80 である。二つの班の平均点とばらつきの関係として最も適切なものを一つ選べ,A班の平均点が高く ばらつきも大きい|B班の平均点が高く ばらつきも小さい|平均点は等しく B班の方がばらつきが大きい|平均点は等しく A班の方がばらつきが大きい,3,"結論：
この問題の正解は 3 です。A班とB班の平均点はどちらも 60 点ですが、ばらつきは B班の方が大きいです。

理由：
A班の合計は $60+60+60+60+60=300$ なので平均点は $300\\div 5=60$ です。B班の合計も $40+50+60+70+80=300$ なので平均点は同じく 60 点です。しかし、A班は全員が 60 点で平均からのずれが 0 なのに対し、B班は平均の 60 点から 20 点ずれる人もいるため、散らばりが大きくなります。したがって、平均点は等しく、ばらつきは B班の方が大きいと判断できます。1 と 2 は平均点の比較が誤りです。4 は A班の方がばらつきが大きいとしており逆です。

具体例・注意点：
この問題は、平均点だけでは集団の特徴を十分に表せないことを示しています。平均が同じでも、点数がそろっている集団と散らばっている集団では性質が異なります。試験では、代表値と散らばりを分けて考えることが重要です。"
国語,「彼は獅子だ」という表現に用いられている表現技法として最も適切なものを一つ選べ,直喩|隠喩|反復法|倒置法,2,"結論：
この問題の正解は 2 の隠喩です。「彼は獅子だ」は、人を別のものに直接たとえる表現です。

理由：
隠喩は、「ようだ」「みたいだ」などの語を使わずに、あるものを別のものとして言い切る比喩です。この文では、人を獅子に重ねることで、勇ましさや強さを印象的に表しています。したがって隠喩に当たります。1 の直喩なら「彼は獅子のようだ」のように、たとえであることを明示します。3 の反復法は同じ語句を繰り返して強調する表現、4 の倒置法は語順を変えて印象を強める表現なので、この文には当てはまりません。

具体例・注意点：
「彼は獅子のようだ」は直喩、「彼は獅子だ」は隠喩です。試験では、「ようだ」「まるで」などの比喩を示す語があるかどうかを見ると、直喩と隠喩を区別しやすくなります。"`;
const QUIZ_COLUMNS: HelpColumn[] = [
    { name: 'category', description: 'カテゴリ名（例: General, AWS）', tableDescription: 'カテゴリ名' },
    { name: 'text', description: '問題文', tableDescription: '問題文' },
    { name: 'options', description: '選択肢を | 区切りで記述', tableDescription: <>選択肢 (<code>|</code> 区切り)</> },
    { name: 'correct_answers', description: '正解番号（1始まり）。複数正解はカンマ区切り', tableDescription: '正解番号 (1始まり)' },
    { name: 'explanation', description: '解説文', tableDescription: '解説文' },
];

const MEMORIZATION_HEADER = 'question,answer,category,explanation';
const MEMORIZATION_EXAMPLE = `連続型の確率変数で条件付き確率 $P(A\\mid B)$ を求める基本手順は?,まず $P(B)$ を領域積分で求める|次に $P(A\\cap B)$ を領域積分で求める|最後に $P(A\\cap B)/P(B)$ を計算する,統計学,"結論：
連続型の条件付き確率は、まず $P(B)$ を求め、次に $P(A\\cap B)$ を求め、最後に
$$
P(A\\mid B)=\\frac{P(A\\cap B)}{P(B)}
$$
で計算します。

理由：
連続型では、確率は点ではなく領域に対応するので、分子と分母をそれぞれ適切な範囲で積分して求める必要があります。特に同時確率密度関数が与えられている場合は、条件付き確率も結局は面積や体積の比として考えることになります。したがって、いきなり比を作るのではなく、分子と分母の領域を正しく切り分けることが先です。

具体例・注意点：
条件が複数あると、積分範囲を途中で分けなければならないことがあります。たとえば $x<y$ と $x<\\frac{1}{4}$ が同時にあると、単純な長方形ではなくなるので注意が必要です。"
平均点が同じでも ばらつきが違うことはありますか?,ある|平均点が同じでも散らばり方が違えば ばらつきは異なる,統計学,"結論：
平均点が同じでも、ばらつきが違うことはあります。

理由：
平均はデータ全体の中心を表す指標ですが、ばらつきはデータがその中心のまわりにどれだけ広がっているかを表す別の性質です。そのため、平均が等しい二つの集団でも、一方は値が平均の近くに集中し、もう一方は広く散らばっていることがあります。したがって、平均だけではデータの特徴を十分に表しきれません。

具体例・注意点：
たとえば 60,60,60,60,60 と 40,50,60,70,80 はどちらも平均が 60 ですが、後者の方が散らばりは大きいです。試験では、代表値と散らばりの違いを説明できることが大切です。"
隠喩とは何ですか?,「ようだ」などを使わずに直接たとえる比喩,国語,"結論：
隠喩とは、「ようだ」「みたいだ」などの語を使わずに、あるものを別のものとして直接たとえる比喩です。

理由：
隠喩では、たとえであることを明示せずに言い切ることで、表現に強い印象を与えます。たとえば「彼は太陽だ」と言えば、実際に太陽という意味ではなく、明るさや存在感を直接重ねて表しています。このように、対象を別のものとして示す点が特徴です。

具体例・注意点：
「彼は太陽のようだ」であれば直喩になり、「彼は太陽だ」であれば隠喩になります。比喩を示す語があるかどうかを見ると、隠喩と直喩は区別しやすくなります。"`;
const MEMORIZATION_COLUMNS: HelpColumn[] = [
    { name: 'question', description: '問題文（例: 日本の四季は?）', tableDescription: '問題文' },
    { name: 'answer', description: '正解を | 区切りで記述（複数回答可）', tableDescription: <>正解 (複数の場合は <code>|</code> 区切り)</> },
    { name: 'category', description: 'カテゴリ名（例: 一般常識）', tableDescription: 'カテゴリ名' },
    { name: 'explanation', description: '解説文（任意。正解の補足情報などを記入）', tableDescription: '解説文 (任意)' },
];

const MIXED_HEADER = 'category,text,options,correct_answers,explanation';
const MIXED_EXAMPLE = `統計学,連続確率変数 $X,Y$ の同時確率密度関数が $f_{X,Y}(x,y)=2$ \\(0<x<y<1\\) であり それ以外では 0 であるとする。このとき $P\\left(X<\\frac{1}{4}\\mid Y<\\frac{1}{2}\\right)$ として最も適切なものを一つ選べ,$\\frac{1}{2}$|$\\frac{2}{3}$|$\\frac{3}{4}$|$1$,3,"結論：
この問題の正解は 3 の $\\frac{3}{4}$ です。

理由：
条件付き確率の定義より
$$
P(A\\mid B)=\\frac{P(A\\cap B)}{P(B)}
$$
です。ここで
$$
A=\\left\\{X<\\frac{1}{4}\\right\\},\\qquad B=\\left\\{Y<\\frac{1}{2}\\right\\}
$$
とおきます。まず分母は
$$
P\\left(Y<\\frac{1}{2}\\right)=\\int_0^{1/2}\\int_0^y 2\\,dx\\,dy
$$
であり、計算すると
$$
\\frac{1}{4}
$$
です。次に分子は、$x<y$ と $x<\\frac{1}{4}$ を同時に満たす領域で積分するので
$$
P(A\\cap B)=\\int_0^{1/4}\\int_0^y 2\\,dx\\,dy+\\int_{1/4}^{1/2}\\int_0^{1/4}2\\,dx\\,dy
$$
となります。これを計算すると
$$
P(A\\cap B)=\\frac{3}{16}
$$
です。したがって
$$
P\\left(X<\\frac{1}{4}\\mid Y<\\frac{1}{2}\\right)=\\frac{3/16}{1/4}=\\frac{3}{4}
$$
となります。1、2、4 は領域の切り分けや条件付き確率の定義を誤っています。

具体例・注意点：
この問題の本質は、公式の暗記ではなく、条件付き確率を面積の比として扱えるかどうかです。分子と分母を別々に考え、必要なら積分範囲を分けることが重要です。"
統計学,A班の点数は 60 60 60 60 60 であり B班の点数は 40 50 60 70 80 である。二つの班の平均点とばらつきの関係として最も適切なものを一つ選べ,A班の平均点が高く ばらつきも大きい|B班の平均点が高く ばらつきも小さい|平均点は等しく B班の方がばらつきが大きい|平均点は等しく A班の方がばらつきが大きい,3,"結論：
この問題の正解は 3 です。A班とB班の平均点はどちらも 60 点ですが、ばらつきは B班の方が大きいです。

理由：
A班の合計は $60+60+60+60+60=300$ なので平均点は $300\\div 5=60$ です。B班の合計も $40+50+60+70+80=300$ なので平均点は同じく 60 点です。しかし、A班は全員が 60 点で平均からのずれが 0 なのに対し、B班は平均の 60 点から 20 点ずれる人もいるため、散らばりが大きくなります。したがって、平均点は等しく、ばらつきは B班の方が大きいと判断できます。1 と 2 は平均点の比較が誤りです。4 は A班の方がばらつきが大きいとしており逆です。

具体例・注意点：
この問題は、平均点だけでは集団の特徴を十分に表せないことを示しています。平均が同じでも、点数がそろっている集団と散らばっている集団では性質が異なります。試験では、代表値と散らばりを分けて考えることが重要です。"
国語,隠喩とは何ですか?,「ようだ」などを使わずに直接たとえる比喩,,"結論：
隠喩とは、「ようだ」「みたいだ」などの語を使わずに、あるものを別のものとして直接たとえる比喩です。

理由：
隠喩では、たとえであることを明示せずに言い切ることで、表現に強い印象を与えます。たとえば「彼は太陽だ」と言えば、実際に太陽という意味ではなく、明るさや存在感を直接重ねて表しています。このように、対象を別のものとして示す点が特徴です。

具体例・注意点：
「彼は太陽のようだ」であれば直喩になり、「彼は太陽だ」であれば隠喩になります。比喩を示す語があるかどうかを見ると、隠喩と直喩は区別しやすくなります。"`;
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