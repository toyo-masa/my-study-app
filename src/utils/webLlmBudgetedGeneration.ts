import type {
    ChatCompletionChunk,
    ChatCompletionFinishReason,
    ChatCompletionMessageParam,
    WebWorkerMLCEngine,
} from '@mlc-ai/web-llm';

export type ParsedAssistantMessage = {
    thinkContent: string | null;
    answerContent: string;
};

export type AssistantMessageSegment = {
    type: 'think' | 'answer';
    content: string;
};

export type WebLlmGenerationPhase = 'thinking' | 'finalizing';
export type SecondPassTrigger = 'unclosed_think' | 'length' | 'both';

export type BudgetedGenerationResult = {
    displayText: string;
    historyText: string;
    rawFirstPassText: string;
    rawSecondPassText?: string;
    usedSecondPass: boolean;
    firstFinishReason: ChatCompletionFinishReason | null;
    secondFinishReason?: ChatCompletionFinishReason | null;
    secondPassTrigger: SecondPassTrigger | null;
};

type RunWebLlmBudgetedGenerationOptions = {
    engine: WebWorkerMLCEngine;
    messages: ChatCompletionMessageParam[];
    enableThinking: boolean;
    firstPassThinkingBudget: number;
    firstPassTemperature: number;
    firstPassTopP: number;
    firstPassPresencePenalty: number | null;
    secondPassFinalAnswerMaxTokens: number;
    secondPassTemperature: number | null;
    secondPassTopP: number | null;
    secondPassPresencePenalty: number | null;
    onDisplayText: (displayText: string) => void;
    onPhaseChange?: (phase: WebLlmGenerationPhase | null) => void;
};

const buildFinalizePrompt = () => {
    return [
        '/no_think',
        'ここまでの内容を踏まえて、最終回答だけを出してください。',
        '新しい長い思考は不要です。',
        '最初からやり直さないでください。',
        '結論と必要最小限の説明だけを簡潔に出してください。',
    ].join('\n');
};

export function parseAssistantMessageSegments(content: string): AssistantMessageSegment[] {
    const segments: AssistantMessageSegment[] = [];
    let cursor = 0;

    while (cursor < content.length) {
        const thinkStart = content.indexOf('<think>', cursor);
        if (thinkStart === -1) {
            const answerContent = content.slice(cursor).trim();
            if (answerContent.length > 0) {
                segments.push({ type: 'answer', content: answerContent });
            }
            break;
        }

        const leadingContent = content.slice(cursor, thinkStart).trim();
        if (leadingContent.length > 0) {
            segments.push({ type: 'answer', content: leadingContent });
        }

        const thinkTagLength = '<think>'.length;
        const thinkEnd = content.indexOf('</think>', thinkStart + thinkTagLength);
        if (thinkEnd === -1) {
            const thinkContent = content.slice(thinkStart + thinkTagLength).trim();
            if (thinkContent.length > 0) {
                segments.push({ type: 'think', content: thinkContent });
            }
            break;
        }

        const thinkContent = content.slice(thinkStart + thinkTagLength, thinkEnd).trim();
        if (thinkContent.length > 0) {
            segments.push({ type: 'think', content: thinkContent });
        }

        cursor = thinkEnd + '</think>'.length;
    }

    return segments;
}

export function parseAssistantMessageContent(content: string): ParsedAssistantMessage {
    const segments = parseAssistantMessageSegments(content);
    const thinkSegments = segments
        .filter((segment) => segment.type === 'think')
        .map((segment) => segment.content);
    const answerSegments = segments
        .filter((segment) => segment.type === 'answer')
        .map((segment) => segment.content);

    return {
        thinkContent: thinkSegments.length > 0 ? thinkSegments.join('\n\n') : null,
        answerContent: answerSegments.join('\n\n'),
    };
}

export function toAssistantHistoryText(content: string): string {
    return parseAssistantMessageSegments(content)
        .filter((segment) => segment.type === 'answer')
        .map((segment) => segment.content)
        .join('\n\n')
        .trim();
}

const hasClosedThinkTag = (content: string) => {
    return content.includes('</think>');
};

const buildDisplayCarryText = (partialText: string) => {
    const thinkStart = partialText.indexOf('<think>');
    if (thinkStart === -1) {
        return '';
    }

    const thinkTagLength = '<think>'.length;
    const thinkEnd = partialText.indexOf('</think>', thinkStart + thinkTagLength);
    const leadingContent = partialText.slice(0, thinkStart).trim();
    const thinkSection = thinkEnd === -1
        ? `${partialText.slice(thinkStart).trim()}\n</think>`
        : partialText.slice(thinkStart, thinkEnd + '</think>'.length).trim();

    const segments = [leadingContent, thinkSection]
        .filter((segment) => segment.length > 0);

    if (segments.length === 0) {
        return '';
    }

    return `${segments.join('\n\n')}\n\n`;
};

const buildCarryAssistantText = (partialText: string) => {
    if (hasClosedThinkTag(partialText)) {
        return partialText;
    }

    return [
        partialText.trim(),
        '',
        '時間制約があるため、ここまでの思考に基づいて最終回答へ移ります。',
        '</think>',
        '',
    ].join('\n');
};

const resolveSecondPassTrigger = (
    partialText: string,
    finishReason: ChatCompletionFinishReason | null
): SecondPassTrigger | null => {
    const closedThink = hasClosedThinkTag(partialText);
    const hasAnswer = parseAssistantMessageContent(partialText).answerContent.trim().length > 0;
    const hitLength = finishReason === 'length';
    const needsFinalize = hitLength || !closedThink || !hasAnswer;

    if (!needsFinalize) {
        return null;
    }

    if (hitLength && (!closedThink || !hasAnswer)) {
        return 'both';
    }

    if (hitLength) {
        return 'length';
    }

    return 'unclosed_think';
};

const runStreamPass = async (
    engine: WebWorkerMLCEngine,
    request: Parameters<WebWorkerMLCEngine['chat']['completions']['create']>[0],
    onText: (text: string) => void
) => {
    let text = '';
    let finishReason: ChatCompletionFinishReason | null = null;

    const stream = await engine.chat.completions.create({
        ...request,
        stream: true,
    });

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
        const choice = chunk.choices[0];
        if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
        }

        const delta = choice?.delta?.content;
        if (typeof delta !== 'string' || delta.length === 0) {
            continue;
        }

        text += delta;
        onText(text);
    }

    if (text.length === 0) {
        text = await engine.getMessage();
        onText(text);
    }

    return {
        text,
        finishReason,
    };
};

export async function runWebLlmBudgetedGeneration({
    engine,
    messages,
    enableThinking,
    firstPassThinkingBudget,
    firstPassTemperature,
    firstPassTopP,
    firstPassPresencePenalty,
    secondPassFinalAnswerMaxTokens,
    secondPassTemperature,
    secondPassTopP,
    secondPassPresencePenalty,
    onDisplayText,
    onPhaseChange,
}: RunWebLlmBudgetedGenerationOptions): Promise<BudgetedGenerationResult> {
    onPhaseChange?.('thinking');

    try {
        const firstPass = await runStreamPass(
            engine,
            {
                messages,
                temperature: firstPassTemperature,
                top_p: firstPassTopP,
                max_tokens: firstPassThinkingBudget,
                presence_penalty: firstPassPresencePenalty,
                extra_body: {
                    enable_thinking: enableThinking,
                },
            },
            onDisplayText
        );

        const secondPassTrigger = resolveSecondPassTrigger(firstPass.text, firstPass.finishReason);
        if (secondPassTrigger === null) {
            return {
                displayText: firstPass.text,
                historyText: toAssistantHistoryText(firstPass.text),
                rawFirstPassText: firstPass.text,
                usedSecondPass: false,
                firstFinishReason: firstPass.finishReason,
                secondPassTrigger: null,
            };
        }

        const displayCarryText = buildDisplayCarryText(firstPass.text);
        const carryAssistantText = buildCarryAssistantText(firstPass.text);

        onPhaseChange?.('finalizing');

        const secondPass = await runStreamPass(
            engine,
            {
                messages: [
                    ...messages,
                    {
                        role: 'assistant',
                        content: carryAssistantText,
                    },
                    {
                        role: 'user',
                        content: buildFinalizePrompt(),
                    },
                ],
                temperature: secondPassTemperature,
                top_p: secondPassTopP,
                max_tokens: secondPassFinalAnswerMaxTokens,
                presence_penalty: secondPassPresencePenalty,
                repetition_penalty: 1.03,
                extra_body: {
                    enable_thinking: enableThinking,
                },
            },
            (secondText) => {
                onDisplayText(`${displayCarryText}${secondText}`);
            }
        );

        const displayText = `${displayCarryText}${secondPass.text}`;
        return {
            displayText,
            historyText: toAssistantHistoryText(displayText),
            rawFirstPassText: firstPass.text,
            rawSecondPassText: secondPass.text,
            usedSecondPass: true,
            firstFinishReason: firstPass.finishReason,
            secondFinishReason: secondPass.finishReason,
            secondPassTrigger,
        };
    } finally {
        onPhaseChange?.(null);
    }
}
