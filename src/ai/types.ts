export type Capability = 'deterministic_calc' | 'symbolic_math';
export type ToolOp = 'evaluate' | 'simplify' | 'solve' | 'integrate' | 'differentiate';
export type PlannerProblemType = 'unknown' | 'symbolic_math' | 'reading' | 'factual' | 'mixed';
export type PlannerMode = 'direct_answer' | 'tool_augmented_answer';

export type ToolAction = {
    capability: Capability;
    op: ToolOp;
    payload: Record<string, unknown>;
};

export type PlannerDecision = {
    mode: PlannerMode;
    problemType: PlannerProblemType;
    neededCapabilities: Capability[];
    factsToAdd: string[];
    done: boolean;
    nextAction: ToolAction | null;
};

export type ToolExecutionResult = {
    capability: Capability;
    op: string;
    success: boolean;
    outputText: string;
    exactValue?: string;
    latex?: string;
    errorCode?: string;
};

export type OrchestrationPromptMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

export type OrchestrationConversationMessage = {
    role: 'user' | 'assistant';
    content: string;
};

export type PlannerTraceEntry = {
    step: number;
    attempt: number;
    request: {
        messages: OrchestrationPromptMessage[];
        maxTokens: number;
        temperature: number | null;
        topP: number | null;
        presencePenalty: number | null;
    };
    rawResponse: string;
    parsedDecision: PlannerDecision | null;
};

export type ToolTraceEntry = {
    step: number;
    request: ToolAction;
    response: ToolExecutionResult;
};

export type ExplainerTraceEntry = {
    request: {
        messages: OrchestrationPromptMessage[];
        maxTokens: number;
        temperature: number | null;
        topP: number | null;
        presencePenalty: number | null;
        stream: boolean;
    };
};

export type OrchestrationTrace = {
    planner: PlannerTraceEntry[];
    tools: ToolTraceEntry[];
    explainer: ExplainerTraceEntry | null;
    errors: string[];
};

export type OrchestrationState = {
    originalUserMessage: string;
    syntheticContext: string;
    problemType: PlannerProblemType;
    neededCapabilities: Capability[];
    facts: string[];
    toolResults: ToolExecutionResult[];
    stepCount: number;
    done: boolean;
    toolRequiredButUnavailable: boolean;
    trace: OrchestrationTrace;
};

export type PlannerLlmResult = {
    text: string;
    request: PlannerTraceEntry['request'];
};

export type ExplainerLlmResult = {
    text: string;
    request: ExplainerTraceEntry['request'];
};

export type ToolAugmentedOrchestrationResult =
    | {
        kind: 'direct_answer';
        trace: OrchestrationTrace;
    }
    | {
        kind: 'tool_augmented_answer';
        displayText: string;
        historyText: string;
        trace: OrchestrationTrace;
        state: OrchestrationState;
    };
