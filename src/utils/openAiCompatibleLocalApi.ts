import type { FunctionCallingToolCall, ToolDefinition } from '../ai/types';

export type OpenAiCompatibleMessage =
    | {
        role: 'system' | 'user';
        content: string;
    }
    | {
        role: 'assistant';
        content?: string | null;
        tool_calls?: FunctionCallingToolCall[];
    }
    | {
        role: 'tool';
        content: string;
        tool_call_id: string;
    };

type ChatTuningParams = {
    temperature?: number | null;
    topP?: number | null;
    maxTokens?: number | null;
    presencePenalty?: number | null;
    repetitionPenalty?: number | null;
};

type ToolSelectionParams = {
    tools?: ToolDefinition[] | null;
    toolChoice?: 'auto' | 'none' | null;
    extraBody?: Record<string, unknown> | null;
};

type StreamChatParams = {
    baseUrl: string;
    model: string;
    messages: OpenAiCompatibleMessage[];
    apiKey?: string;
    signal?: AbortSignal;
    onDelta: (delta: string) => void;
} & ChatTuningParams;

type ChatOnceParams = {
    baseUrl: string;
    model: string;
    messages: OpenAiCompatibleMessage[];
    apiKey?: string;
    signal?: AbortSignal;
} & ChatTuningParams & ToolSelectionParams;

const buildEndpoint = (baseUrl: string, path: string) => {
    return `${baseUrl.replace(/\/+$/, '')}${path}`;
};

const buildChatRequestBody = (
    model: string,
    messages: OpenAiCompatibleMessage[],
    stream: boolean,
    params: ChatTuningParams & ToolSelectionParams
) => {
    const payload: Record<string, unknown> = {
        model,
        messages,
        stream,
    };

    if (typeof params.temperature === 'number') {
        payload.temperature = params.temperature;
    }
    if (typeof params.topP === 'number') {
        payload.top_p = params.topP;
    }
    if (typeof params.maxTokens === 'number') {
        payload.max_tokens = params.maxTokens;
    }
    if (typeof params.presencePenalty === 'number') {
        payload.presence_penalty = params.presencePenalty;
    }
    if (typeof params.repetitionPenalty === 'number') {
        payload.repetition_penalty = params.repetitionPenalty;
    }
    if (Array.isArray(params.tools) && params.tools.length > 0) {
        payload.tools = params.tools;
    }
    if (params.toolChoice) {
        payload.tool_choice = params.toolChoice;
    }

    if (params.extraBody && typeof params.extraBody === 'object') {
        Object.assign(payload, params.extraBody);
    }

    return payload;
};

const buildHeaders = (apiKey?: string, withStream = false) => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (withStream) {
        headers.Accept = 'text/event-stream';
    }

    if (apiKey && apiKey.trim().length > 0) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
    }

    return headers;
};

const extractTextContent = (value: unknown): string => {
    if (typeof value === 'string') {
        return value;
    }

    if (!Array.isArray(value)) {
        return '';
    }

    return value.map((part) => {
        if (typeof part === 'string') {
            return part;
        }
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
            return part.text;
        }
        return '';
    }).join('');
};

const getResponseErrorMessage = async (response: Response) => {
    try {
        const payload = await response.json() as {
            error?: {
                message?: string;
            };
        };
        const message = payload.error?.message?.trim();
        if (message) {
            return message;
        }
    } catch {
        // noop
    }

    if (response.status === 0) {
        return 'ローカルAPIへ接続できませんでした。サーバーの起動状態と CORS 設定を確認してください。';
    }

    return `ローカルAPIの応答に失敗しました (${response.status} ${response.statusText}).`;
};

const normalizeToolCalls = (value: unknown): FunctionCallingToolCall[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((item, index) => {
        if (!item || typeof item !== 'object') {
            return [];
        }

        const candidate = item as {
            id?: unknown;
            type?: unknown;
            function?: {
                name?: unknown;
                arguments?: unknown;
            };
        };

        if (!candidate.function || typeof candidate.function !== 'object') {
            return [];
        }

        const name = candidate.function.name;
        const rawArguments = candidate.function.arguments;
        if (typeof name !== 'string' || typeof rawArguments !== 'string') {
            return [];
        }

        return [{
            id: typeof candidate.id === 'string' && candidate.id.trim().length > 0
                ? candidate.id
                : `tool-call-${index}`,
            type: 'function',
            function: {
                name: name as FunctionCallingToolCall['function']['name'],
                arguments: rawArguments,
            },
            source: 'native',
        }];
    });
};

const extractAssistantResponse = (payload: unknown) => {
    if (!payload || typeof payload !== 'object' || !('choices' in payload) || !Array.isArray(payload.choices)) {
        return { text: '', toolCalls: [] as FunctionCallingToolCall[] };
    }

    const firstChoice = payload.choices[0];
    if (!firstChoice || typeof firstChoice !== 'object') {
        return { text: '', toolCalls: [] as FunctionCallingToolCall[] };
    }

    if ('message' in firstChoice && firstChoice.message && typeof firstChoice.message === 'object') {
        const text = 'content' in firstChoice.message ? extractTextContent(firstChoice.message.content) : '';
        const toolCalls = 'tool_calls' in firstChoice.message
            ? normalizeToolCalls(firstChoice.message.tool_calls)
            : [];
        return { text, toolCalls };
    }

    if ('delta' in firstChoice && firstChoice.delta && typeof firstChoice.delta === 'object') {
        return {
            text: 'content' in firstChoice.delta ? extractTextContent(firstChoice.delta.content) : '',
            toolCalls: [],
        };
    }

    return { text: '', toolCalls: [] as FunctionCallingToolCall[] };
};

const processSseEvent = (eventBlock: string, onDelta: (delta: string) => void) => {
    const dataLines = eventBlock
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());

    if (dataLines.length === 0) {
        return { done: false, text: '' };
    }

    const payloadText = dataLines.join('\n');
    if (payloadText === '[DONE]') {
        return { done: true, text: '' };
    }

    const parsed = JSON.parse(payloadText) as unknown;
    const deltaText = extractAssistantResponse(parsed).text;

    if (deltaText.length > 0) {
        onDelta(deltaText);
    }

    return {
        done: false,
        text: deltaText,
    };
};

export const fetchOpenAiCompatibleModelIds = async (
    baseUrl: string,
    apiKey?: string,
    signal?: AbortSignal
) => {
    const response = await fetch(buildEndpoint(baseUrl, '/models'), {
        method: 'GET',
        headers: buildHeaders(apiKey),
        signal,
    });

    if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response));
    }

    const payload = await response.json() as {
        data?: Array<{ id?: string } | string>;
    };

    const modelIds = Array.isArray(payload.data)
        ? payload.data.map((item) => {
            if (typeof item === 'string') {
                return item.trim();
            }
            return typeof item?.id === 'string' ? item.id.trim() : '';
        }).filter((item) => item.length > 0)
        : [];

    if (modelIds.length === 0) {
        throw new Error('利用可能なモデル一覧を取得できませんでした。OpenAI互換の /v1/models を確認してください。');
    }

    return modelIds;
};

export const streamOpenAiCompatibleChat = async ({
    baseUrl,
    model,
    messages,
    apiKey,
    signal,
    onDelta,
    temperature,
    topP,
    maxTokens,
    presencePenalty,
    repetitionPenalty,
}: StreamChatParams) => {
    const response = await fetch(buildEndpoint(baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: buildHeaders(apiKey, true),
        body: JSON.stringify(buildChatRequestBody(model, messages, true, {
            temperature,
            topP,
            maxTokens,
            presencePenalty,
            repetitionPenalty,
        })),
        signal,
    });

    if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response));
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!response.body || !contentType.includes('text/event-stream')) {
        const payload = await response.json();
        const text = extractAssistantResponse(payload).text;
        if (text.length === 0) {
            throw new Error('ローカルAPIから応答本文を取得できませんでした。');
        }
        onDelta(text);
        return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let assistantText = '';
    let streamDone = false;

    while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) {
            pending += decoder.decode();
            break;
        }

        pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        let separatorIndex = pending.indexOf('\n\n');
        while (separatorIndex >= 0) {
            const eventBlock = pending.slice(0, separatorIndex);
            pending = pending.slice(separatorIndex + 2);

            if (eventBlock.trim().length > 0) {
                const eventResult = processSseEvent(eventBlock, (delta) => {
                    assistantText += delta;
                    onDelta(delta);
                });
                if (eventResult.done) {
                    streamDone = true;
                    break;
                }
            }

            separatorIndex = pending.indexOf('\n\n');
        }
    }

    if (!streamDone && pending.trim().length > 0) {
        const eventResult = processSseEvent(pending, (delta) => {
            assistantText += delta;
            onDelta(delta);
        });
        streamDone = eventResult.done;
    }

    if (assistantText.length === 0 && !streamDone) {
        throw new Error('ローカルAPIからストリーミング応答を受け取れませんでした。');
    }

    return assistantText;
};

export const createOpenAiCompatibleChat = async ({
    baseUrl,
    model,
    messages,
    apiKey,
    signal,
    temperature,
    topP,
    maxTokens,
    presencePenalty,
    repetitionPenalty,
    tools,
    toolChoice,
    extraBody,
}: ChatOnceParams) => {
    const response = await fetch(buildEndpoint(baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: buildHeaders(apiKey),
        body: JSON.stringify(buildChatRequestBody(model, messages, false, {
            temperature,
            topP,
            maxTokens,
            presencePenalty,
            repetitionPenalty,
            tools,
            toolChoice,
            extraBody,
        })),
        signal,
    });

    if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response));
    }

    const payload = await response.json();
    const { text, toolCalls } = extractAssistantResponse(payload);
    if (text.length === 0 && toolCalls.length === 0) {
        throw new Error('ローカルAPIから応答本文を取得できませんでした。');
    }

    return {
        text,
        toolCalls,
        raw: payload,
    };
};
