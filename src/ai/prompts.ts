import type {
    FunctionCallingConversationMessage,
    FunctionCallingState,
    ToolDefinition,
    ToolExecutionResult,
} from './types';

const formatConversationHistory = (messages: FunctionCallingConversationMessage[]) => {
    if (messages.length === 0) {
        return 'なし';
    }

    return messages.map((message, index) => {
        const speaker = message.role === 'user' ? 'user' : 'assistant';
        return `${index + 1}. ${speaker}\n${message.content.trim()}`;
    }).join('\n\n');
};

const normalizeComparableText = (value: string) => value.replace(/\s+/g, ' ').trim();

const formatToolResults = (toolResults: ToolExecutionResult[]) => {
    if (toolResults.length === 0) {
        return 'なし';
    }

    return toolResults.map((result, index) => {
        const exactLine = result.exactValue ? `\nexactValue: ${result.exactValue}` : '';
        const latexLine = result.latex ? `\nlatex: ${result.latex}` : '';
        const errorLine = result.errorCode ? `\nerrorCode: ${result.errorCode}` : '';
        return [
            `${index + 1}. name=${result.name}, success=${result.success}`,
            result.outputText.trim().length > 0 ? `outputText:\n${result.outputText.trim()}` : 'outputText: なし',
            exactLine,
            latexLine,
            errorLine,
        ].filter(Boolean).join('\n');
    }).join('\n\n');
};

export const FUNCTION_TOOLS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'deterministic_evaluate',
            description: '四則演算、分数、小数化、既に得た式の数値評価など、決定的な評価を行う',
            parameters: {
                type: 'object',
                properties: {
                    expr: {
                        type: 'string',
                        description: '評価したい式',
                    },
                },
                required: ['expr'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'symbolic_simplify',
            description: '式を簡約する',
            parameters: {
                type: 'object',
                properties: {
                    expr: {
                        type: 'string',
                        description: '簡約したい式',
                    },
                },
                required: ['expr'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'symbolic_solve',
            description: '方程式や式を指定変数について解く',
            parameters: {
                type: 'object',
                properties: {
                    expr: {
                        type: 'string',
                        description: '解きたい式または方程式',
                    },
                    variable: {
                        type: 'string',
                        description: '解く変数名',
                    },
                },
                required: ['expr'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'symbolic_integrate',
            description: '式を1変数について積分する。必要なら定積分として上下限も指定する',
            parameters: {
                type: 'object',
                properties: {
                    expr: {
                        type: 'string',
                        description: '積分したい式',
                    },
                    variable: {
                        type: 'string',
                        description: '積分変数',
                    },
                    lower: {
                        type: 'string',
                        description: '下限',
                    },
                    upper: {
                        type: 'string',
                        description: '上限',
                    },
                },
                required: ['expr'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'symbolic_differentiate',
            description: '式を1変数について微分する',
            parameters: {
                type: 'object',
                properties: {
                    expr: {
                        type: 'string',
                        description: '微分したい式',
                    },
                    variable: {
                        type: 'string',
                        description: '微分変数',
                    },
                },
                required: ['expr'],
            },
        },
    },
];

const formatToolList = () => {
    return FUNCTION_TOOLS.map((tool) => {
        const propertyList = Object.entries(tool.function.parameters.properties)
            .map(([name, schema]) => `${name}: ${schema.description ?? schema.type}`)
            .join(', ');
        return `- ${tool.function.name}: ${tool.function.description} (${propertyList})`;
    }).join('\n');
};

export const buildNativeToolSelectionSystemPrompt = () => {
    return [
        'あなたは汎用チャットの補助ツール選択アシスタントです。',
        'ここでは最終回答を書かず、必要ならツールを1件だけ呼び出してください。',
        'ツールが不要、または既に十分な情報が揃っている場合は content に NO_TOOL とだけ返してください。',
        '厳密計算や決定的な外部処理が必要なときだけツールを使ってください。',
        '同時に複数のツールを呼んではいけません。',
        '利用可能なツール:',
        formatToolList(),
    ].join('\n');
};

export const buildManualToolSelectionSystemPrompt = () => {
    return [
        'あなたは汎用チャットの補助ツール選択アシスタントです。',
        '最終回答本文は書かず、次のどちらか1つだけを返してください。',
        '1. ツールが必要な場合: <tool_call>{"name":"...","arguments":{...}}</tool_call>',
        '2. ツール不要、または既に十分な情報が揃っている場合: <final>no_tool</final>',
        '余計な文章、コードブロック、複数の tool call、<think> タグは禁止です。',
        '利用可能なツール:',
        formatToolList(),
        'evaluate は deterministic_evaluate にしか使えません。',
        '積分・微分・方程式の解・式の簡約は symbolic_* を使ってください。',
        '多重積分や複数段階の式変形が必要な場合でも、1回の出力では1件のツール呼び出しだけ返してください。',
    ].join('\n');
};

export const buildToolSelectionUserPrompt = (
    state: FunctionCallingState,
    conversationMessages: FunctionCallingConversationMessage[],
    repairMode = false
) => {
    const repairSection = repairMode
        ? [
            '前回は形式を満たしませんでした。',
            '今回の出力だけを、指定された形式どおりに返してください。',
            '',
        ].join('\n')
        : '';

    const normalizedOriginal = normalizeComparableText(state.originalUserMessage);
    const shouldIncludeRecentConversation = state.stepCount > 0 && conversationMessages.some((message) => {
        if (message.role !== 'user') {
            return true;
        }
        return normalizeComparableText(message.content) !== normalizedOriginal;
    });

    const recentConversationSection = shouldIncludeRecentConversation
        ? ['', `recentConversation:\n${formatConversationHistory(conversationMessages)}`]
        : [];

    return [
        '/no_think',
        repairSection,
        '現在のユーザー入力に対して、次に必要な 1 手だけを判断してください。',
        '',
        `syntheticContext:\n${state.syntheticContext.trim() || 'なし'}`,
        '',
        `originalUserMessage:\n${state.originalUserMessage}`,
        '',
        `toolResults:\n${formatToolResults(state.toolResults)}`,
        ...recentConversationSection,
    ].join('\n');
};

export const buildFinalAnswerSystemPrompt = () => {
    return [
        'あなたは日本語の学習アシスタントです。',
        '与えられた補助ツール結果を使って最終回答を整えてください。',
        '新しい計算や再計算は禁止です。',
        '<think> タグや独白は禁止です。',
    ].join('\n');
};

export const buildFinalAnswerUserPrompt = (
    state: FunctionCallingState,
    conversationMessages: FunctionCallingConversationMessage[]
) => {
    return [
        '/no_think',
        '上の内容を踏まえて、日本語で最終回答を整えて出してください。',
        'toolResults をそのまま使って説明してください。',
        '新しい計算や別解の再検討はしないでください。',
        '必要最小限の根拠を 2〜4 文で添えてください。',
        '式・条件・単位・結論のうち必要なものは省略しないでください。',
        '',
        `syntheticContext:\n${state.syntheticContext.trim() || 'なし'}`,
        '',
        `originalUserMessage:\n${state.originalUserMessage}`,
        '',
        `recentConversation:\n${formatConversationHistory(conversationMessages)}`,
        '',
        `toolResults:\n${formatToolResults(state.toolResults)}`,
    ].join('\n');
};

export const buildToolResultMessageContent = (result: ToolExecutionResult) => {
    return [
        `name: ${result.name}`,
        `success: ${result.success}`,
        `outputText: ${result.outputText.trim() || 'なし'}`,
        result.exactValue ? `exactValue: ${result.exactValue}` : null,
        result.latex ? `latex: ${result.latex}` : null,
        result.errorCode ? `errorCode: ${result.errorCode}` : null,
    ].filter((line): line is string => Boolean(line)).join('\n');
};

export const buildFallbackContext = (toolResults: ToolExecutionResult[]) => {
    if (toolResults.length === 0) {
        return '';
    }

    return [
        '補助ツールは途中で使えなくなりましたが、以下の結果はすでに確定しています。',
        '通常回答に切り替える場合も、以下の結果を尊重してください。',
        '',
        formatToolResults(toolResults),
    ].join('\n');
};
