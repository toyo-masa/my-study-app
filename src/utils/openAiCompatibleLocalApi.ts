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
    extraBody?: Record<string, unknown> | null;
} & ChatTuningParams;

type OllamaThinkMode = boolean | 'low' | 'medium' | 'high';

type StreamOllamaNativeChatParams = {
    baseUrl: string;
    model: string;
    messages: OpenAiCompatibleMessage[];
    signal?: AbortSignal;
    think?: OllamaThinkMode | null;
    onThinkingDelta?: (delta: string) => void;
    onContentDelta?: (delta: string) => void;
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

const buildOllamaNativeChatEndpoint = (baseUrl: string) => {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    if (normalized.endsWith('/v1')) {
        return `${normalized.slice(0, -3)}/api/chat`;
    }
    if (normalized.endsWith('/api')) {
        return `${normalized}/chat`;
    }
    return `${normalized}/api/chat`;
};

const buildLocalApiFetchFailureMessage = (baseUrl: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const originHint = origin.length > 0
        ? `現在の画面 origin は ${origin} です。`
        : '';

    return [
        `ローカルAPIへ接続できませんでした (${baseUrl})。`,
        'Ollama が起動していること、Base URL が正しいこと、ブラウザから localhost へ接続できることを確認してください。',
        originHint,
        'Ollama を使っている場合は、OLLAMA_ORIGINS にこの origin を追加するか、http://127.0.0.1 でアプリを開き直してください。',
    ].filter((part) => part.length > 0).join(' ');
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

const buildOllamaNativeChatBody = (
    model: string,
    messages: OpenAiCompatibleMessage[],
    params: StreamOllamaNativeChatParams
) => {
    const payload: Record<string, unknown> = {
        model,
        messages: messages.flatMap((message) => {
            if (message.role === 'tool') {
                return [];
            }
            return [message];
        }),
        stream: true,
    };

    if (params.think !== null && params.think !== undefined) {
        payload.think = params.think;
    }

    const options: Record<string, unknown> = {};
    if (typeof params.temperature === 'number') {
        options.temperature = params.temperature;
    }
    if (typeof params.topP === 'number') {
        options.top_p = params.topP;
    }
    if (typeof params.maxTokens === 'number') {
        options.num_predict = params.maxTokens;
    }
    if (typeof params.presencePenalty === 'number') {
        options.presence_penalty = params.presencePenalty;
    }
    if (typeof params.repetitionPenalty === 'number') {
        options.repeat_penalty = params.repetitionPenalty;
    }

    if (Object.keys(options).length > 0) {
        payload.options = options;
    }

    return payload;
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

const MODEL_LIST_CACHE_TTL_MS = 5000;
const MODEL_LIST_FETCH_TIMEOUT_MS = 8000;
const MODEL_LIST_STORAGE_KEY_PREFIX = 'openAiCompatibleModelListCache::';

type FetchModelIdsOptions = {
    force?: boolean;
};

type ModelListCacheEntry = {
    modelIds: string[];
    fetchedAt: number;
};

const modelListCache = new Map<string, ModelListCacheEntry>();
const modelListInFlight = new Map<string, Promise<string[]>>();

const buildModelListCacheKey = (baseUrl: string, apiKey?: string) => {
    return `${baseUrl.replace(/\/+$/, '')}::${apiKey?.trim() ?? ''}`;
};

const buildPersistedModelListStorageKey = (cacheKey: string) => {
    return `${MODEL_LIST_STORAGE_KEY_PREFIX}${cacheKey}`;
};

const readPersistedModelListCache = (cacheKey: string): ModelListCacheEntry | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const stored = localStorage.getItem(buildPersistedModelListStorageKey(cacheKey));
        if (!stored) {
            return null;
        }

        const parsed = JSON.parse(stored) as Partial<ModelListCacheEntry> | null;
        const modelIds = Array.isArray(parsed?.modelIds)
            ? parsed.modelIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            : [];
        const fetchedAt = typeof parsed?.fetchedAt === 'number' && Number.isFinite(parsed.fetchedAt)
            ? parsed.fetchedAt
            : Number.NaN;

        if (modelIds.length === 0 || !Number.isFinite(fetchedAt)) {
            return null;
        }

        return {
            modelIds,
            fetchedAt,
        };
    } catch {
        return null;
    }
};

const writePersistedModelListCache = (cacheKey: string, entry: ModelListCacheEntry) => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        localStorage.setItem(buildPersistedModelListStorageKey(cacheKey), JSON.stringify(entry));
    } catch {
        // localStorage 書き込み失敗時はメモリキャッシュだけを使う
    }
};

const createAbortError = () => new DOMException('The operation was aborted.', 'AbortError');

const awaitWithAbortSignal = async <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
    if (!signal) {
        return promise;
    }

    if (signal.aborted) {
        throw createAbortError();
    }

    return new Promise<T>((resolve, reject) => {
        const handleAbort = () => {
            cleanup();
            reject(createAbortError());
        };

        const cleanup = () => {
            signal.removeEventListener('abort', handleAbort);
        };

        signal.addEventListener('abort', handleAbort, { once: true });
        promise.then(
            (value) => {
                cleanup();
                resolve(value);
            },
            (error) => {
                cleanup();
                reject(error);
            }
        );
    });
};

export const fetchOpenAiCompatibleModelIds = async (
    baseUrl: string,
    apiKey?: string,
    signal?: AbortSignal,
    options?: FetchModelIdsOptions,
) => {
    const cacheKey = buildModelListCacheKey(baseUrl, apiKey);
    const force = options?.force === true;
    const persisted = readPersistedModelListCache(cacheKey);
    if (persisted && !modelListCache.has(cacheKey)) {
        modelListCache.set(cacheKey, persisted);
    }
    const cached = modelListCache.get(cacheKey);

    if (!force && cached && Date.now() - cached.fetchedAt <= MODEL_LIST_CACHE_TTL_MS) {
        return cached.modelIds;
    }

    const inFlight = modelListInFlight.get(cacheKey);
    if (!force && inFlight) {
        return await awaitWithAbortSignal(inFlight, signal);
    }

    const requestPromise = (async () => {
        let response: Response;
        const timeoutController = new AbortController();
        const abortFromCaller = () => {
            timeoutController.abort();
        };
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
            timeoutController.abort();
        }, MODEL_LIST_FETCH_TIMEOUT_MS);
        if (signal) {
            if (signal.aborted) {
                clearTimeout(timeoutId);
                throw createAbortError();
            }
            signal.addEventListener('abort', abortFromCaller, { once: true });
        }
        try {
            response = await fetch(buildEndpoint(baseUrl, '/models'), {
                method: 'GET',
                headers: buildHeaders(apiKey),
                signal: timeoutController.signal,
            });
        } catch (error) {
            clearTimeout(timeoutId);
            if (signal) {
                signal.removeEventListener('abort', abortFromCaller);
            }
            if (timedOut) {
                throw new Error('ローカルAPI のモデル一覧取得がタイムアウトしました。Ollama が応答しているか確認してください。');
            }
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw error;
            }
            throw new Error(buildLocalApiFetchFailureMessage(baseUrl));
        }
        clearTimeout(timeoutId);
        if (signal) {
            signal.removeEventListener('abort', abortFromCaller);
        }

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

        const nextCacheEntry = {
            modelIds,
            fetchedAt: Date.now(),
        };
        modelListCache.set(cacheKey, nextCacheEntry);
        writePersistedModelListCache(cacheKey, nextCacheEntry);

        return modelIds;
    })();

    modelListInFlight.set(cacheKey, requestPromise);

    try {
        return await awaitWithAbortSignal(requestPromise, signal);
    } finally {
        if (modelListInFlight.get(cacheKey) === requestPromise) {
            modelListInFlight.delete(cacheKey);
        }
    }
};

export const getCachedOpenAiCompatibleModelIds = (
    baseUrl: string,
    apiKey?: string,
) => {
    const cacheKey = buildModelListCacheKey(baseUrl, apiKey);
    const inMemory = modelListCache.get(cacheKey);
    if (inMemory) {
        return inMemory.modelIds;
    }

    const persisted = readPersistedModelListCache(cacheKey);
    if (persisted) {
        modelListCache.set(cacheKey, persisted);
        return persisted.modelIds;
    }

    return [];
};

export const streamOpenAiCompatibleChat = async ({
    baseUrl,
    model,
    messages,
    apiKey,
    signal,
    onDelta,
    extraBody,
    temperature,
    topP,
    maxTokens,
    presencePenalty,
    repetitionPenalty,
}: StreamChatParams) => {
    let response: Response;
    try {
        response = await fetch(buildEndpoint(baseUrl, '/chat/completions'), {
            method: 'POST',
            headers: buildHeaders(apiKey, true),
            body: JSON.stringify(buildChatRequestBody(model, messages, true, {
                temperature,
                topP,
                maxTokens,
                presencePenalty,
                repetitionPenalty,
                extraBody,
            })),
            signal,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
        }
        throw new Error(buildLocalApiFetchFailureMessage(baseUrl));
    }

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

export const streamOllamaNativeChat = async ({
    baseUrl,
    model,
    messages,
    signal,
    think,
    temperature,
    topP,
    maxTokens,
    presencePenalty,
    repetitionPenalty,
    onThinkingDelta,
    onContentDelta,
}: StreamOllamaNativeChatParams) => {
    let response: Response;
    try {
        response = await fetch(buildOllamaNativeChatEndpoint(baseUrl), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(buildOllamaNativeChatBody(model, messages, {
                baseUrl,
                model,
                messages,
                signal,
                think,
                temperature,
                topP,
                maxTokens,
                presencePenalty,
                repetitionPenalty,
                onThinkingDelta,
                onContentDelta,
            })),
            signal,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
        }
        throw new Error(buildLocalApiFetchFailureMessage(baseUrl));
    }

    if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response));
    }

    const readChunkPayload = (payload: unknown) => {
        if (!payload || typeof payload !== 'object') {
            return { thinking: '', content: '', done: false };
        }

        const candidate = payload as {
            done?: unknown;
            message?: {
                thinking?: unknown;
                content?: unknown;
            };
        };

        return {
            thinking: typeof candidate.message?.thinking === 'string' ? candidate.message.thinking : '',
            content: typeof candidate.message?.content === 'string' ? candidate.message.content : '',
            done: candidate.done === true,
        };
    };

    if (!response.body) {
        const payload = await response.json();
        const parsed = readChunkPayload(payload);
        if (parsed.thinking.length > 0) {
            onThinkingDelta?.(parsed.thinking);
        }
        if (parsed.content.length > 0) {
            onContentDelta?.(parsed.content);
        }
        return {
            thinkingText: parsed.thinking,
            contentText: parsed.content,
        };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let thinkingText = '';
    let contentText = '';
    let streamDone = false;

    while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) {
            pending += decoder.decode();
            break;
        }

        pending += decoder.decode(value, { stream: true });

        let separatorIndex = pending.indexOf('\n');
        while (separatorIndex >= 0) {
            const line = pending.slice(0, separatorIndex).trim();
            pending = pending.slice(separatorIndex + 1);

            if (line.length > 0) {
                const parsed = readChunkPayload(JSON.parse(line) as unknown);
                if (parsed.thinking.length > 0) {
                    thinkingText += parsed.thinking;
                    onThinkingDelta?.(parsed.thinking);
                }
                if (parsed.content.length > 0) {
                    contentText += parsed.content;
                    onContentDelta?.(parsed.content);
                }
                if (parsed.done) {
                    streamDone = true;
                    break;
                }
            }

            separatorIndex = pending.indexOf('\n');
        }
    }

    if (!streamDone && pending.trim().length > 0) {
        const parsed = readChunkPayload(JSON.parse(pending.trim()) as unknown);
        if (parsed.thinking.length > 0) {
            thinkingText += parsed.thinking;
            onThinkingDelta?.(parsed.thinking);
        }
        if (parsed.content.length > 0) {
            contentText += parsed.content;
            onContentDelta?.(parsed.content);
        }
    }

    return {
        thinkingText,
        contentText,
    };
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
    let response: Response;
    try {
        response = await fetch(buildEndpoint(baseUrl, '/chat/completions'), {
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
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
        }
        throw new Error(buildLocalApiFetchFailureMessage(baseUrl));
    }

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
