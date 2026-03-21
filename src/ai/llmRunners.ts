import type {
    ChatCompletionChunk,
    ChatCompletionMessageParam,
    WebWorkerMLCEngine,
} from '@mlc-ai/web-llm';
import {
    createOpenAiCompatibleChat,
    streamOpenAiCompatibleChat,
    type OpenAiCompatibleMessage,
} from '../utils/openAiCompatibleLocalApi';
import type {
    FinalAnswerLlmResult,
    FunctionCallingPromptMessage,
    SelectionLlmResult,
    ToolDefinition,
} from './types';

type WebLlmSelectionParams = {
    engine: WebWorkerMLCEngine;
    messages: FunctionCallingPromptMessage[];
    maxTokens: number;
    temperature: number | null;
    topP: number | null;
    presencePenalty: number | null;
};

type WebLlmFinalAnswerParams = {
    engine: WebWorkerMLCEngine;
    messages: FunctionCallingPromptMessage[];
    maxTokens: number;
    temperature: number | null;
    topP: number | null;
    presencePenalty: number | null;
    onDelta: (text: string) => void;
};

type OpenAiSelectionParams = {
    baseUrl: string;
    model: string;
    messages: FunctionCallingPromptMessage[];
    apiKey?: string;
    signal?: AbortSignal;
    maxTokens: number;
    temperature: number | null;
    topP: number | null;
    presencePenalty: number | null;
    tools?: ToolDefinition[] | null;
    toolChoice?: 'auto' | 'none' | null;
    extraBody?: Record<string, unknown> | null;
};

type OpenAiFinalAnswerParams = {
    baseUrl: string;
    model: string;
    messages: FunctionCallingPromptMessage[];
    apiKey?: string;
    signal?: AbortSignal;
    maxTokens: number;
    temperature: number | null;
    topP: number | null;
    presencePenalty: number | null;
    onDelta: (text: string) => void;
};

const renderToolCallsForManual = (message: Extract<FunctionCallingPromptMessage, { role: 'assistant' }>) => {
    if (!Array.isArray(message.toolCalls) || message.toolCalls.length === 0) {
        return '';
    }

    return message.toolCalls.flatMap((toolCall) => {
        try {
            return [`<tool_call>${JSON.stringify({
                name: toolCall.function.name,
                arguments: JSON.parse(toolCall.function.arguments),
            })}</tool_call>`];
        } catch {
            return [];
        }
    }).join('\n');
};

const toWebLlmMessages = (messages: FunctionCallingPromptMessage[]): ChatCompletionMessageParam[] => {
    const result: ChatCompletionMessageParam[] = [];

    messages.forEach((message) => {
        if (message.role === 'system' || message.role === 'user') {
            const content = message.content.trim();
            if (content.length === 0) {
                return;
            }
            result.push({ role: message.role, content });
            return;
        }

        if (message.role === 'assistant') {
            const parts = [
                typeof message.content === 'string' ? message.content.trim() : '',
                renderToolCallsForManual(message),
            ].filter((part) => part.length > 0);

            if (parts.length === 0) {
                return;
            }

            result.push({
                role: 'assistant',
                content: parts.join('\n'),
            });
            return;
        }

        const content = message.content.trim();
        if (content.length === 0) {
            return;
        }

        result.push({
            role: 'user',
            content: `<tool_result id="${message.toolCallId}">\n${content}\n</tool_result>`,
        });
    });

    return result;
};

const toOpenAiMessages = (messages: FunctionCallingPromptMessage[]): OpenAiCompatibleMessage[] => {
    const result: OpenAiCompatibleMessage[] = [];

    messages.forEach((message) => {
        if (message.role === 'system' || message.role === 'user') {
            const content = message.content.trim();
            if (content.length === 0) {
                return;
            }
            result.push({ role: message.role, content });
            return;
        }

        if (message.role === 'assistant') {
            if ((!message.content || message.content.trim().length === 0) && (!message.toolCalls || message.toolCalls.length === 0)) {
                return;
            }

            result.push({
                role: 'assistant',
                content: typeof message.content === 'string' ? message.content : '',
                tool_calls: message.toolCalls,
            });
            return;
        }

        result.push({
            role: 'tool',
            content: message.content,
            tool_call_id: message.toolCallId,
        });
    });

    return result;
};

const extractWebLlmText = (value: unknown): string => {
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

const runWebLlmStreamText = async ({
    engine,
    messages,
    maxTokens,
    temperature,
    topP,
    presencePenalty,
    onDelta,
}: {
    engine: WebWorkerMLCEngine;
    messages: FunctionCallingPromptMessage[];
    maxTokens: number;
    temperature: number | null;
    topP: number | null;
    presencePenalty: number | null;
    onDelta?: (text: string) => void;
}) => {
    await engine.resetChat(false);

    let text = '';
    const stream = await engine.chat.completions.create({
        messages: toWebLlmMessages(messages),
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        presence_penalty: presencePenalty,
        stream: true,
    });

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (typeof delta !== 'string' || delta.length === 0) {
            continue;
        }
        text += delta;
        onDelta?.(text);
    }

    if (text.length === 0) {
        text = await engine.getMessage();
        onDelta?.(text);
    }

    return text;
};

export const runWebLlmSelection = async ({
    engine,
    messages,
    maxTokens,
    temperature,
    topP,
    presencePenalty,
}: WebLlmSelectionParams): Promise<SelectionLlmResult> => {
    await engine.resetChat(false);

    const response = await engine.chat.completions.create({
        messages: toWebLlmMessages(messages),
        max_tokens: maxTokens,
        temperature,
        top_p: topP,
        presence_penalty: presencePenalty,
        stream: false,
    });

    const text = extractWebLlmText(response.choices?.[0]?.message?.content);

    return {
        text,
        toolCalls: [],
        request: {
            messages,
            maxTokens,
            temperature,
            topP,
            presencePenalty,
            stream: false,
            tools: null,
            toolChoice: null,
            extraBody: null,
        },
    };
};

export const runWebLlmFinalAnswer = async ({
    engine,
    messages,
    maxTokens,
    temperature,
    topP,
    presencePenalty,
    onDelta,
}: WebLlmFinalAnswerParams): Promise<FinalAnswerLlmResult> => {
    const text = await runWebLlmStreamText({
        engine,
        messages,
        maxTokens,
        temperature,
        topP,
        presencePenalty,
        onDelta,
    });

    return {
        text,
        request: {
            messages,
            maxTokens,
            temperature,
            topP,
            presencePenalty,
            stream: true,
        },
    };
};

export const runOpenAiSelection = async ({
    baseUrl,
    model,
    messages,
    apiKey,
    signal,
    maxTokens,
    temperature,
    topP,
    presencePenalty,
    tools,
    toolChoice,
    extraBody,
}: OpenAiSelectionParams): Promise<SelectionLlmResult> => {
    const response = await createOpenAiCompatibleChat({
        baseUrl,
        model,
        messages: toOpenAiMessages(messages),
        apiKey,
        signal,
        maxTokens,
        temperature,
        topP,
        presencePenalty,
        tools,
        toolChoice,
        extraBody,
    });

    return {
        text: response.text,
        toolCalls: response.toolCalls,
        request: {
            messages,
            maxTokens,
            temperature,
            topP,
            presencePenalty,
            stream: false,
            tools: tools ?? null,
            toolChoice: toolChoice ?? null,
            extraBody: extraBody ?? null,
        },
    };
};

export const runOpenAiFinalAnswer = async ({
    baseUrl,
    model,
    messages,
    apiKey,
    signal,
    maxTokens,
    temperature,
    topP,
    presencePenalty,
    onDelta,
}: OpenAiFinalAnswerParams): Promise<FinalAnswerLlmResult> => {
    let text = '';
    const finalText = await streamOpenAiCompatibleChat({
        baseUrl,
        model,
        messages: toOpenAiMessages(messages),
        apiKey,
        signal,
        maxTokens,
        temperature,
        topP,
        presencePenalty,
        onDelta: (delta) => {
            text += delta;
            onDelta(text);
        },
    });

    if (text.length === 0) {
        text = finalText;
        onDelta(text);
    }

    return {
        text,
        request: {
            messages,
            maxTokens,
            temperature,
            topP,
            presencePenalty,
            stream: true,
        },
    };
};
