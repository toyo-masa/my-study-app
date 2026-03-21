import { toAssistantHistoryText } from '../utils/webLlmBudgetedGeneration';
import {
    buildFallbackContext,
    buildFinalAnswerSystemPrompt,
    buildFinalAnswerUserPrompt,
    buildManualToolSelectionSystemPrompt,
    buildNativeToolSelectionSystemPrompt,
    buildToolSelectionUserPrompt,
} from './prompts';
import type {
    FallbackReason,
    FinalAnswerLlmResult,
    FunctionCallingConversationMessage,
    FunctionCallingPromptMessage,
    FunctionCallingResult,
    FunctionCallingState,
    FunctionCallingToolCall,
    FunctionCallingTrace,
    SelectionLlmResult,
    ToolExecutionRequest,
    ToolExecutionResult,
    ToolInvocation,
    ToolName,
} from './types';

const MAX_TOOL_STEPS = 4;
const FALLBACK_NOTICE = '補助ツールを使えなかったため通常回答に切り替えます';

type SelectionRunner = (messages: FunctionCallingPromptMessage[]) => Promise<SelectionLlmResult>;
type FinalAnswerRunner = (
    messages: FunctionCallingPromptMessage[],
    onDelta: (text: string) => void
) => Promise<FinalAnswerLlmResult>;
type ToolRunner = (request: ToolExecutionRequest) => Promise<ToolExecutionResult>;

type RunFunctionCallingLoopOptions = {
    originalUserMessage: string;
    syntheticContext: string;
    conversationMessages: FunctionCallingConversationMessage[];
    runManualSelection: SelectionRunner;
    runFinalAnswer: FinalAnswerRunner;
    runTool: ToolRunner;
    onDisplayText: (text: string) => void;
    runNativeSelection?: SelectionRunner;
};

type ParsedSelection = {
    toolInvocations: ToolInvocation[];
    readyForFinalAnswer: boolean;
};

type SelectionAttemptResult = {
    parsed: ParsedSelection | null;
    rawResponse: string;
};

const createEmptyTrace = (): FunctionCallingTrace => ({
    selection: [],
    toolCalls: [],
    finalAnswer: null,
    fallbackReason: null,
    fallbackNotice: null,
    errors: [],
});

const createInitialState = (
    originalUserMessage: string,
    syntheticContext: string
): FunctionCallingState => ({
    originalUserMessage,
    syntheticContext,
    toolResults: [],
    stepCount: 0,
    trace: createEmptyTrace(),
});

const getTraceErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message.trim();
    }
    if (typeof error === 'string' && error.trim().length > 0) {
        return error.trim();
    }
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message.trim().length > 0) {
        return error.message.trim();
    }
    return '';
};

const appendTraceError = (trace: FunctionCallingTrace, code: string, error?: unknown) => {
    trace.errors.push(code);
    const detail = getTraceErrorMessage(error);
    if (detail.length > 0) {
        trace.errors.push(`${code}_detail:${detail}`);
    }
};

const normalizeToolName = (value: unknown): ToolName | null => {
    switch (value) {
    case 'deterministic_evaluate':
    case 'symbolic_simplify':
    case 'symbolic_solve':
    case 'symbolic_integrate':
    case 'symbolic_differentiate':
        return value;
    default:
        return null;
    }
};

const stripThinkTags = (text: string) => text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

const unwrapCodeFence = (text: string) => {
    const trimmed = text.trim();
    const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fencedMatch?.[1]?.trim() ?? trimmed;
};

const parseToolCallPayload = (
    payloadText: string,
    id: string,
    source: 'native' | 'manual'
): ToolInvocation | null => {
    try {
        const parsed = JSON.parse(unwrapCodeFence(payloadText)) as {
            name?: unknown;
            arguments?: unknown;
        };

        const name = normalizeToolName(parsed?.name);
        if (!name || !parsed || typeof parsed !== 'object' || !parsed.arguments || typeof parsed.arguments !== 'object' || Array.isArray(parsed.arguments)) {
            return null;
        }

        return {
            id,
            name,
            arguments: parsed.arguments as Record<string, unknown>,
            rawArguments: JSON.stringify(parsed.arguments),
            source,
        };
    } catch {
        return null;
    }
};

const parseNativeToolCalls = (toolCalls: FunctionCallingToolCall[]): ToolInvocation[] => {
    return toolCalls.flatMap((toolCall) => {
        const name = normalizeToolName(toolCall.function.name);
        if (!name) {
            return [];
        }

        try {
            const parsedArguments = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
            if (!parsedArguments || typeof parsedArguments !== 'object' || Array.isArray(parsedArguments)) {
                return [];
            }

            return [{
                id: toolCall.id,
                name,
                arguments: parsedArguments,
                rawArguments: toolCall.function.arguments,
                source: 'native' as const,
            }];
        } catch {
            return [];
        }
    });
};

const parseManualSelectionText = (text: string): ParsedSelection | null => {
    const normalizedText = unwrapCodeFence(stripThinkTags(text));
    const toolCallMatch = normalizedText.match(/<tool_call>([\s\S]*?)<\/tool_call>/i);
    if (toolCallMatch?.[1]) {
        const invocation = parseToolCallPayload(toolCallMatch[1], 'manual-tool-call', 'manual');
        if (invocation) {
            return {
                toolInvocations: [invocation],
                readyForFinalAnswer: false,
            };
        }
    }

    const finalMatch = normalizedText.match(/<final>([\s\S]*?)<\/final>/i);
    if (finalMatch) {
        return {
            toolInvocations: [],
            readyForFinalAnswer: true,
        };
    }

    const compact = normalizedText.replace(/\s+/g, '').toUpperCase();
    if (compact === 'NO_TOOL' || compact === '<FINAL>NO_TOOL</FINAL>') {
        return {
            toolInvocations: [],
            readyForFinalAnswer: true,
        };
    }

    return null;
};

const parseSelectionResult = (result: SelectionLlmResult): ParsedSelection | null => {
    const nativeToolInvocations = parseNativeToolCalls(result.toolCalls);
    if (nativeToolInvocations.length > 0) {
        return {
            toolInvocations: nativeToolInvocations,
            readyForFinalAnswer: false,
        };
    }

    return parseManualSelectionText(result.text);
};

const buildNativeSelectionMessages = (
    state: FunctionCallingState,
    conversationMessages: FunctionCallingConversationMessage[]
): FunctionCallingPromptMessage[] => [
    {
        role: 'system',
        content: buildNativeToolSelectionSystemPrompt(),
    },
    {
        role: 'user',
        content: buildToolSelectionUserPrompt(state, conversationMessages),
    },
];

const buildManualSelectionMessages = (
    state: FunctionCallingState,
    conversationMessages: FunctionCallingConversationMessage[],
    repairMode = false
): FunctionCallingPromptMessage[] => [
    {
        role: 'system',
        content: buildManualToolSelectionSystemPrompt(),
    },
    {
        role: 'user',
        content: buildToolSelectionUserPrompt(state, conversationMessages, repairMode),
    },
];

const buildFinalAnswerMessages = (
    state: FunctionCallingState,
    conversationMessages: FunctionCallingConversationMessage[]
): FunctionCallingPromptMessage[] => [
    {
        role: 'system',
        content: buildFinalAnswerSystemPrompt(),
    },
    {
        role: 'user',
        content: buildFinalAnswerUserPrompt(state, conversationMessages),
    },
];

const toRawSelectionResponse = (result: SelectionLlmResult) => {
    if (result.text.trim().length > 0) {
        return result.text;
    }
    if (result.toolCalls.length > 0) {
        return JSON.stringify(result.toolCalls);
    }
    return '';
};

const createDirectAnswerResult = (
    state: FunctionCallingState,
    fallbackReason: FallbackReason,
    shouldNotify: boolean
): FunctionCallingResult => {
    state.trace.fallbackReason = fallbackReason;
    state.trace.fallbackNotice = shouldNotify ? FALLBACK_NOTICE : null;

    return {
        kind: 'direct_answer',
        trace: state.trace,
        fallbackNotice: shouldNotify ? FALLBACK_NOTICE : null,
        fallbackContext: state.toolResults.length > 0 ? buildFallbackContext(state.toolResults) : null,
    };
};

const buildUnavailableToolResult = (request: ToolInvocation, errorCode: string, outputText: string): ToolExecutionResult => ({
    name: request.name,
    success: false,
    outputText,
    errorCode,
});

const normalizeToolErrorCode = (error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
        return error.code;
    }
    if (error && typeof error === 'object' && 'status' in error && error.status === 401) {
        return 'UNAUTHORIZED';
    }
    return 'TOOL_EXECUTION_FAILED';
};

const executeSelection = async (
    state: FunctionCallingState,
    conversationMessages: FunctionCallingConversationMessage[],
    step: number,
    strategy: 'native' | 'manual',
    runner: SelectionRunner,
    repairMode = false
): Promise<SelectionAttemptResult> => {
    const messages = strategy === 'native'
        ? buildNativeSelectionMessages(state, conversationMessages)
        : buildManualSelectionMessages(state, conversationMessages, repairMode);
    const result = await runner(messages);
    const parsed = parseSelectionResult(result);
    const rawResponse = toRawSelectionResponse(result);

    state.trace.selection.push({
        step,
        strategy,
        repairMode,
        request: result.request,
        rawResponse,
        toolInvocations: parsed?.toolInvocations ?? [],
        readyForFinalAnswer: parsed?.readyForFinalAnswer ?? false,
    });

    return {
        parsed,
        rawResponse,
    };
};

export async function runFunctionCallingLoop({
    originalUserMessage,
    syntheticContext,
    conversationMessages,
    runManualSelection,
    runFinalAnswer,
    runTool,
    onDisplayText,
    runNativeSelection,
}: RunFunctionCallingLoopOptions): Promise<FunctionCallingResult> {
    const state = createInitialState(originalUserMessage, syntheticContext);

    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
        let selection: ParsedSelection | null = null;

        if (runNativeSelection) {
            try {
                const nativeAttempt = await executeSelection(state, conversationMessages, step, 'native', runNativeSelection);
                selection = nativeAttempt.parsed;
                if (!selection && nativeAttempt.rawResponse.trim().length === 0) {
                    appendTraceError(state.trace, 'empty_selection_response');
                }
            } catch (error) {
                appendTraceError(state.trace, 'selection_native_failed', error);
            }
        }

        if (!selection) {
            let shouldRunRepair = false;
            let manualAttemptCount = 0;

            while (!selection && manualAttemptCount < 2) {
                const repairMode = shouldRunRepair;
                manualAttemptCount += 1;
                try {
                    const manualAttempt = await executeSelection(
                        state,
                        conversationMessages,
                        step,
                        'manual',
                        runManualSelection,
                        repairMode
                    );
                    selection = manualAttempt.parsed;

                    if (manualAttempt.rawResponse.trim().length === 0) {
                        appendTraceError(state.trace, 'empty_selection_response');
                        shouldRunRepair = false;
                        continue;
                    }

                    if (!selection) {
                        appendTraceError(state.trace, 'selection_parse_failed');
                        if (!repairMode) {
                            shouldRunRepair = true;
                            continue;
                        }
                    }
                } catch (error) {
                    appendTraceError(
                        state.trace,
                        manualAttemptCount === 1 ? 'selection_manual_failed' : 'selection_manual_retry_failed',
                        error
                    );
                    shouldRunRepair = false;
                }
            }
        }

        if (!selection) {
            appendTraceError(state.trace, 'selection_invalid');
            return createDirectAnswerResult(state, 'selection_invalid', true);
        }

        if (selection.toolInvocations.length === 0) {
            if (state.toolResults.length === 0) {
                return createDirectAnswerResult(state, 'tool_not_needed', false);
            }

            onDisplayText('補助ツールを使用して回答を整理しています…');
            const finalAnswerMessages = buildFinalAnswerMessages(state, conversationMessages);

            try {
                const finalAnswer = await runFinalAnswer(finalAnswerMessages, onDisplayText);
                state.trace.finalAnswer = {
                    request: finalAnswer.request,
                };

                const displayText = finalAnswer.text.trim();
                return {
                    kind: 'tool_augmented_answer',
                    displayText,
                    historyText: toAssistantHistoryText(displayText) || displayText,
                    trace: state.trace,
                };
            } catch (error) {
                appendTraceError(state.trace, 'final_answer_failed', error);
                return createDirectAnswerResult(state, 'final_answer_failed', true);
            }
        }

        const invocation = selection.toolInvocations[0];
        try {
            const result = await runTool({
                name: invocation.name,
                arguments: invocation.arguments,
            });
            state.toolResults.push(result);
            state.trace.toolCalls.push({
                step,
                request: invocation,
                response: result,
            });
            state.stepCount += 1;

            if (!result.success) {
                return createDirectAnswerResult(state, 'tool_failed', true);
            }
        } catch (error) {
            const errorCode = normalizeToolErrorCode(error);
            const unavailableResult = buildUnavailableToolResult(
                invocation,
                errorCode,
                errorCode === 'UNAUTHORIZED'
                    ? '補助ツールを利用するにはログインが必要です。'
                    : '補助ツールの実行に失敗しました。'
            );

            state.toolResults.push(unavailableResult);
            state.trace.toolCalls.push({
                step,
                request: invocation,
                response: unavailableResult,
            });
            state.stepCount += 1;
            return createDirectAnswerResult(state, 'tool_failed', true);
        }
    }

    appendTraceError(state.trace, 'max_steps_reached');
    return createDirectAnswerResult(state, 'max_steps_reached', true);
}
