import type {
    OrchestrationConversationMessage,
    OrchestrationState,
    ToolExecutionResult,
} from './types';

const formatConversationHistory = (messages: OrchestrationConversationMessage[]) => {
    if (messages.length === 0) {
        return 'なし';
    }

    return messages.map((message, index) => {
        const speaker = message.role === 'user' ? 'user' : 'assistant';
        return `${index + 1}. ${speaker}\n${message.content.trim()}`;
    }).join('\n\n');
};

const formatToolResults = (toolResults: ToolExecutionResult[]) => {
    if (toolResults.length === 0) {
        return 'なし';
    }

    return toolResults.map((result, index) => {
        const exactLine = result.exactValue ? `\nexactValue: ${result.exactValue}` : '';
        const latexLine = result.latex ? `\nlatex: ${result.latex}` : '';
        const errorLine = result.errorCode ? `\nerrorCode: ${result.errorCode}` : '';
        return [
            `${index + 1}. capability=${result.capability}, op=${result.op}, success=${result.success}`,
            result.outputText.trim().length > 0 ? `outputText:\n${result.outputText.trim()}` : 'outputText: なし',
            exactLine,
            latexLine,
            errorLine,
        ].filter(Boolean).join('\n');
    }).join('\n\n');
};

export const buildPlannerSystemPrompt = () => {
    return [
        'あなたは問題解決オーケストレータです。',
        'あなたの役割は答えを直接書くことではなく、必要な外部能力を判断し、次の1手だけを JSON で返すことです。',
        '説明文やコードブロックは禁止です。JSON 以外を出力してはいけません。',
        '通常の知識質問、要約、説明、文章整理、アイデア出しで十分なら direct_answer を選んでください。',
        '厳密計算や決定的な外部処理が必要なときだけ tool_augmented_answer を選んでください。',
        '現時点で使える補助能力は deterministic_calc または symbolic_math だけです。',
        'deterministic_calc の op は evaluate、symbolic_math の op は simplify / solve / integrate / differentiate です。',
        'capability と op の組み合わせは必ず一致させてください。evaluate は deterministic_calc にしか使えません。',
        '積分・微分・方程式の解・式の簡約が必要なら symbolic_math を使ってください。',
        'deterministic_calc.evaluate は四則演算、分数、小数化、既に得た式の数値評価など、決定的な評価だけに使ってください。',
        'nextAction は必ず 1 件以下です。複数 action を同時に返してはいけません。',
        'nextAction を返す場合は mode を必ず tool_augmented_answer にしてください。',
        'nextAction を返す場合は done を必ず false にしてください。',
        'mode が direct_answer の場合、nextAction は必ず null にしてください。',
        'done=true にするのは nextAction が null で、これ以上の外部処理が不要なときだけです。',
        'factsToAdd には新しく確定した事実だけを短文で入れてください。',
        'factsToAdd に JSON 断片、数式オブジェクト、引用符を含む構造化文字列を入れてはいけません。',
        'factsToAdd は人間向けの短い日本語または英語の文だけにしてください。',
        '十分な情報が揃ったら done=true にしてください。',
        '返す JSON の形は次です:',
        '{"mode":"direct_answer|tool_augmented_answer","problemType":"unknown|symbolic_math|reading|factual|mixed","neededCapabilities":["deterministic_calc|symbolic_math"],"factsToAdd":["..."],"done":false,"nextAction":{"capability":"...","op":"...","payload":{}}}',
        'integrate の payload 例: {"expr":"x^2","variable":"x","lower":"0","upper":"1"}',
        'solve の payload 例: {"expr":"x^2-4","variable":"x"}',
        'differentiate の payload 例: {"expr":"sin(x)","variable":"x"}',
        'evaluate の payload 例: {"expr":"(1/10)+(1/4)"}',
    ].join('\n');
};

export const buildPlannerUserPrompt = (
    state: OrchestrationState,
    conversationMessages: OrchestrationConversationMessage[],
    invalidPreviousResponse?: string
) => {
    const repairSection = invalidPreviousResponse
        ? [
            '前回の出力は JSON として解析できませんでした。',
            '説明文を混ぜず、必ず有効な JSON 1 個だけを返してください。',
            `前回の出力:\n${invalidPreviousResponse.trim()}`,
            '',
        ].join('\n')
        : '';

    return [
        '/no_think',
        repairSection,
        '現在のユーザー入力を解くために、次に必要な 1 手だけを判断してください。',
        '',
        `syntheticContext:\n${state.syntheticContext.trim() || 'なし'}`,
        '',
        `originalUserMessage:\n${state.originalUserMessage}`,
        '',
        `problemType(current): ${state.problemType}`,
        `neededCapabilities(current): ${state.neededCapabilities.join(', ') || 'なし'}`,
        `stepCount: ${state.stepCount}`,
        '',
        `facts:\n${state.facts.length > 0 ? state.facts.join('\n') : 'なし'}`,
        '',
        `toolResults:\n${formatToolResults(state.toolResults)}`,
        '',
        `recentConversation:\n${formatConversationHistory(conversationMessages)}`,
    ].join('\n');
};

export const buildExplainerSystemPrompt = () => {
    return [
        'あなたは日本語の学習アシスタントです。',
        '外部ツールの結果を使って最終回答を整えてください。',
        '新しい計算や再計算は禁止です。',
        '<think> タグや独白は禁止です。',
    ].join('\n');
};

export const buildExplainerUserPrompt = (
    state: OrchestrationState,
    conversationMessages: OrchestrationConversationMessage[]
) => {
    const reliabilitySection = state.toolRequiredButUnavailable
        ? [
            '補助ツールが利用できなかった、または途中で失敗しました。',
            'このため、ここから先の説明は確実性が下がることを明示してください。',
            '断定的に数値を言い切らず、何が未確定かを説明してください。',
        ].join('\n')
        : [
            'toolResults をそのまま使って説明してください。',
            '新しい計算や別解の再検討はしないでください。',
        ].join('\n');

    return [
        '/no_think',
        '上の内容を踏まえて、日本語で最終回答を整えて出してください。',
        reliabilitySection,
        '必要最小限の根拠を 2〜4 文で添えてください。',
        '式・条件・単位・結論のうち必要なものは省略しないでください。',
        '',
        `syntheticContext:\n${state.syntheticContext.trim() || 'なし'}`,
        '',
        `originalUserMessage:\n${state.originalUserMessage}`,
        '',
        `recentConversation:\n${formatConversationHistory(conversationMessages)}`,
        '',
        `facts:\n${state.facts.length > 0 ? state.facts.join('\n') : 'なし'}`,
        '',
        `toolResults:\n${formatToolResults(state.toolResults)}`,
    ].join('\n');
};
