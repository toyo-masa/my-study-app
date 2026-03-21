export interface OpenAiCompatibleMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

type StreamChatParams = {
    baseUrl: string;
    model: string;
    messages: OpenAiCompatibleMessage[];
    apiKey?: string;
    signal?: AbortSignal;
    onDelta: (delta: string) => void;
};

const buildEndpoint = (baseUrl: string, path: string) => {
    return `${baseUrl.replace(/\/+$/, '')}${path}`;
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

const extractAssistantMessage = (payload: unknown): string => {
    if (!payload || typeof payload !== 'object' || !('choices' in payload) || !Array.isArray(payload.choices)) {
        return '';
    }

    const firstChoice = payload.choices[0];
    if (!firstChoice || typeof firstChoice !== 'object') {
        return '';
    }

    if ('message' in firstChoice && firstChoice.message && typeof firstChoice.message === 'object' && 'content' in firstChoice.message) {
        return extractTextContent(firstChoice.message.content);
    }

    if ('delta' in firstChoice && firstChoice.delta && typeof firstChoice.delta === 'object' && 'content' in firstChoice.delta) {
        return extractTextContent(firstChoice.delta.content);
    }

    return '';
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
    const deltaText = extractAssistantMessage(parsed);

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
}: StreamChatParams) => {
    const response = await fetch(buildEndpoint(baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: buildHeaders(apiKey, true),
        body: JSON.stringify({
            model,
            messages,
            stream: true,
        }),
        signal,
    });

    if (!response.ok) {
        throw new Error(await getResponseErrorMessage(response));
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!response.body || !contentType.includes('text/event-stream')) {
        const payload = await response.json();
        const text = extractAssistantMessage(payload);
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
