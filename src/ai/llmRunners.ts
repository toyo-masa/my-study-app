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
import type { ExplainerLlmResult, OrchestrationPromptMessage, PlannerLlmResult } from './types';

type WebLlmPlannerParams = {
    engine: WebWorkerMLCEngine;
    messages: OrchestrationPromptMessage[];
    maxTokens: number;
    temperature: number;
    topP: number;
    presencePenalty: number | null;
};

type WebLlmExplainerParams = {
    engine: WebWorkerMLCEngine;
    messages: OrchestrationPromptMessage[];
    maxTokens: number;
    temperature: number | null;
    topP: number | null;
    presencePenalty: number | null;
    onDelta: (text: string) => void;
};

type OpenAiPlannerParams = {
    baseUrl: string;
    model: string;
    messages: OrchestrationPromptMessage[];
    apiKey?: string;
    signal?: AbortSignal;
    maxTokens: number;
    temperature: number;
    topP: number;
    presencePenalty: number | null;
};

type OpenAiExplainerParams = {
    baseUrl: string;
    model: string;
    messages: OrchestrationPromptMessage[];
    apiKey?: string;
    signal?: AbortSignal;
    maxTokens: number;
    temperature: number | null;
    topP: number | null;
    presencePenalty: number | null;
    onDelta: (text: string) => void;
};

const toWebLlmMessages = (messages: OrchestrationPromptMessage[]): ChatCompletionMessageParam[] => {
    return messages.map((message) => ({
        role: message.role,
        content: message.content,
    }));
};

const toOpenAiMessages = (messages: OrchestrationPromptMessage[]): OpenAiCompatibleMessage[] => {
    return messages.map((message) => ({
        role: message.role,
        content: message.content,
    }));
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
    messages: OrchestrationPromptMessage[];
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

export const runWebLlmPlanner = async ({
    engine,
    messages,
    maxTokens,
    temperature,
    topP,
    presencePenalty,
}: WebLlmPlannerParams): Promise<PlannerLlmResult> => {
    const text = await runWebLlmStreamText({
        engine,
        messages,
        maxTokens,
        temperature,
        topP,
        presencePenalty,
    });

    return {
        text,
        request: {
            messages,
            maxTokens,
            temperature,
            topP,
            presencePenalty,
        },
    };
};

export const runWebLlmExplainer = async ({
    engine,
    messages,
    maxTokens,
    temperature,
    topP,
    presencePenalty,
    onDelta,
}: WebLlmExplainerParams): Promise<ExplainerLlmResult> => {
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

export const runOpenAiPlanner = async ({
    baseUrl,
    model,
    messages,
    apiKey,
    signal,
    maxTokens,
    temperature,
    topP,
    presencePenalty,
}: OpenAiPlannerParams): Promise<PlannerLlmResult> => {
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
    });

    return {
        text: response.text,
        request: {
            messages,
            maxTokens,
            temperature,
            topP,
            presencePenalty,
        },
    };
};

export const runOpenAiExplainer = async ({
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
}: OpenAiExplainerParams): Promise<ExplainerLlmResult> => {
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
