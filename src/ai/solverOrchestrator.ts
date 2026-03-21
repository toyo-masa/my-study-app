import { toAssistantHistoryText } from '../utils/webLlmBudgetedGeneration';
import { buildExplainerSystemPrompt, buildExplainerUserPrompt, buildPlannerSystemPrompt, buildPlannerUserPrompt } from './prompts';
import { parsePlannerDecision, stringifyToolAction } from './plannerSchema';
import type {
    Capability,
    ExplainerLlmResult,
    OrchestrationConversationMessage,
    OrchestrationPromptMessage,
    OrchestrationState,
    OrchestrationTrace,
    PlannerDecision,
    PlannerLlmResult,
    PlannerProblemType,
    ToolAction,
    ToolAugmentedOrchestrationResult,
    ToolExecutionResult,
} from './types';

const MAX_TOOL_STEPS = 4;

type PlannerRunner = (messages: OrchestrationPromptMessage[]) => Promise<PlannerLlmResult>;
type ExplainerRunner = (
    messages: OrchestrationPromptMessage[],
    onDelta: (text: string) => void
) => Promise<ExplainerLlmResult>;
type ToolRunner = (action: ToolAction) => Promise<ToolExecutionResult>;

type RunToolAugmentedOrchestrationOptions = {
    originalUserMessage: string;
    syntheticContext: string;
    conversationMessages: OrchestrationConversationMessage[];
    runPlanner: PlannerRunner;
    runExplainer: ExplainerRunner;
    runTool: ToolRunner;
    onDisplayText: (text: string) => void;
};

const createEmptyTrace = (): OrchestrationTrace => ({
    planner: [],
    tools: [],
    explainer: null,
    errors: [],
});

const appendUniqueFacts = (target: string[], additions: string[]) => {
    const next = [...target];
    additions.forEach((fact) => {
        if (!next.includes(fact)) {
            next.push(fact);
        }
    });
    return next;
};

const appendUniqueCapabilities = (target: Capability[], additions: Capability[]) => {
    const next = [...target];
    additions.forEach((capability) => {
        if (!next.includes(capability)) {
            next.push(capability);
        }
    });
    return next;
};

const createInitialState = (
    originalUserMessage: string,
    syntheticContext: string
): OrchestrationState => ({
    originalUserMessage,
    syntheticContext,
    problemType: 'unknown',
    neededCapabilities: [],
    facts: [],
    toolResults: [],
    stepCount: 0,
    done: false,
    toolRequiredButUnavailable: false,
    trace: createEmptyTrace(),
});

const buildPlannerMessages = (
    state: OrchestrationState,
    conversationMessages: OrchestrationConversationMessage[],
    invalidPreviousResponse?: string
): OrchestrationPromptMessage[] => {
    return [
        {
            role: 'system',
            content: buildPlannerSystemPrompt(),
        },
        {
            role: 'user',
            content: buildPlannerUserPrompt(state, conversationMessages, invalidPreviousResponse),
        },
    ];
};

const buildExplainerMessages = (
    state: OrchestrationState,
    conversationMessages: OrchestrationConversationMessage[]
): OrchestrationPromptMessage[] => {
    return [
        {
            role: 'system',
            content: buildExplainerSystemPrompt(),
        },
        {
            role: 'user',
            content: buildExplainerUserPrompt(state, conversationMessages),
        },
    ];
};

const applyPlannerDecisionToState = (state: OrchestrationState, decision: PlannerDecision) => {
    state.problemType = decision.problemType as PlannerProblemType;
    state.neededCapabilities = appendUniqueCapabilities(state.neededCapabilities, decision.neededCapabilities);
    state.facts = appendUniqueFacts(state.facts, decision.factsToAdd);
    if (decision.done) {
        state.done = true;
    }
};

const buildUnavailableToolResult = (action: ToolAction, errorCode: string, outputText: string): ToolExecutionResult => ({
    capability: action.capability,
    op: action.op,
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

const appendTraceError = (trace: OrchestrationTrace, code: string, error?: unknown) => {
    trace.errors.push(code);
    const detail = getTraceErrorMessage(error);
    if (detail.length > 0) {
        trace.errors.push(`${code}_detail:${detail}`);
    }
};

export async function runToolAugmentedOrchestration({
    originalUserMessage,
    syntheticContext,
    conversationMessages,
    runPlanner,
    runExplainer,
    runTool,
    onDisplayText,
}: RunToolAugmentedOrchestrationOptions): Promise<ToolAugmentedOrchestrationResult> {
    const state = createInitialState(originalUserMessage, syntheticContext);
    let previousActionKey: string | null = null;
    let shouldFallbackToDirectAnswer = false;

    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
        let invalidResponse: string | undefined;
        let decision: PlannerDecision | null = null;

        for (let attempt = 0; attempt < 2; attempt += 1) {
            const plannerMessages = buildPlannerMessages(state, conversationMessages, invalidResponse);
            let plannerResult: PlannerLlmResult;
            try {
                plannerResult = await runPlanner(plannerMessages);
            } catch (error) {
                appendTraceError(state.trace, 'planner_runner_failed', error);
                if (state.stepCount === 0 && state.toolResults.length === 0 && state.facts.length === 0) {
                    return {
                        kind: 'direct_answer',
                        trace: state.trace,
                    };
                }
                state.done = true;
                break;
            }
            decision = parsePlannerDecision(plannerResult.text);

            state.trace.planner.push({
                step,
                attempt,
                request: plannerResult.request,
                rawResponse: plannerResult.text,
                parsedDecision: decision,
            });

            if (decision) {
                break;
            }

            invalidResponse = plannerResult.text;
        }

        if (state.done && !decision) {
            break;
        }

        if (!decision) {
            state.trace.errors.push('planner_invalid_json');
            if (state.stepCount === 0 && state.toolResults.length === 0 && state.facts.length === 0) {
                return {
                    kind: 'direct_answer',
                    trace: state.trace,
                };
            }
            state.done = true;
            break;
        }

        applyPlannerDecisionToState(state, decision);

        if (decision.mode === 'direct_answer' && state.stepCount === 0 && state.toolResults.length === 0) {
            return {
                kind: 'direct_answer',
                trace: state.trace,
            };
        }

        if (decision.done || !decision.nextAction) {
            state.done = true;
            break;
        }

        const nextAction = decision.nextAction;
        const nextActionKey = stringifyToolAction(nextAction);
        if (previousActionKey === nextActionKey) {
            state.trace.errors.push('planner_repeated_same_action');
            state.done = true;
            break;
        }
        previousActionKey = nextActionKey;

        try {
            const toolResult = await runTool(nextAction);
            state.toolResults.push(toolResult);
            state.trace.tools.push({
                step,
                request: nextAction,
                response: toolResult,
            });
            state.stepCount += 1;

            if (!toolResult.success) {
                state.toolRequiredButUnavailable = true;
                state.done = true;
                break;
            }
        } catch (error) {
            const errorCode = normalizeToolErrorCode(error);
            const unavailableResult = buildUnavailableToolResult(
                nextAction,
                errorCode,
                errorCode === 'UNAUTHORIZED'
                    ? '計算ツールを利用するにはログインが必要です。'
                    : '計算ツールの実行に失敗しました。'
            );

            state.toolResults.push(unavailableResult);
            state.trace.tools.push({
                step,
                request: nextAction,
                response: unavailableResult,
            });
            state.toolRequiredButUnavailable = true;
            state.stepCount += 1;
            state.done = true;
            break;
        }
    }

    state.done = true;
    onDisplayText('計算ツールを使用して回答を整理しています…');

    const explainerMessages = buildExplainerMessages(state, conversationMessages);
    let explainerResult: ExplainerLlmResult | null = null;
    try {
        explainerResult = await runExplainer(explainerMessages, onDisplayText);
    } catch (error) {
        appendTraceError(state.trace, 'explainer_runner_failed', error);
        shouldFallbackToDirectAnswer = true;
    }

    if (shouldFallbackToDirectAnswer || !explainerResult) {
        return {
            kind: 'direct_answer',
            trace: state.trace,
        };
    }

    state.trace.explainer = {
        request: explainerResult.request,
    };

    const displayText = explainerResult.text.trim();
    return {
        kind: 'tool_augmented_answer',
        displayText,
        historyText: toAssistantHistoryText(displayText) || displayText,
        trace: state.trace,
        state,
    };
}
