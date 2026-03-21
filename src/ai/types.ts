export type ToolName =
    | 'deterministic_evaluate'
    | 'symbolic_simplify'
    | 'symbolic_solve'
    | 'symbolic_integrate'
    | 'symbolic_differentiate';

export type FallbackReason =
    | 'tool_not_needed'
    | 'selection_failed'
    | 'selection_invalid'
    | 'tool_failed'
    | 'final_answer_failed'
    | 'max_steps_reached';

export type ToolDefinition = {
    type: 'function';
    function: {
        name: ToolName;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, {
                type: 'string';
                description?: string;
            }>;
            required?: string[];
        };
    };
};

export type FunctionCallingToolCall = {
    id: string;
    type: 'function';
    function: {
        name: ToolName;
        arguments: string;
    };
    source: 'native' | 'manual';
};

export type ToolInvocation = {
    id: string;
    name: ToolName;
    arguments: Record<string, unknown>;
    rawArguments: string;
    source: 'native' | 'manual';
};

export type ToolExecutionRequest = {
    name: ToolName;
    arguments: Record<string, unknown>;
};

export type ToolExecutionResult = {
    name: ToolName;
    success: boolean;
    outputText: string;
    exactValue?: string;
    latex?: string;
    errorCode?: string;
};

export type FunctionCallingPromptMessage =
    | {
        role: 'system';
        content: string;
    }
    | {
        role: 'user';
        content: string;
    }
    | {
        role: 'assistant';
        content?: string | null;
        toolCalls?: FunctionCallingToolCall[];
    }
    | {
        role: 'tool';
        content: string;
        toolCallId: string;
    };

export type FunctionCallingConversationMessage = {
    role: 'user' | 'assistant';
    content: string;
};

export type SelectionTraceEntry = {
    step: number;
    strategy: 'native' | 'manual';
    repairMode: boolean;
    request: {
        messages: FunctionCallingPromptMessage[];
        maxTokens: number;
        temperature: number | null;
        topP: number | null;
        presencePenalty: number | null;
        stream: boolean;
        tools: ToolDefinition[] | null;
        toolChoice: 'auto' | 'none' | null;
        extraBody: Record<string, unknown> | null;
    };
    rawResponse: string;
    toolInvocations: ToolInvocation[];
    readyForFinalAnswer: boolean;
};

export type ToolCallTraceEntry = {
    step: number;
    request: ToolInvocation;
    response: ToolExecutionResult;
};

export type FinalAnswerTraceEntry = {
    request: {
        messages: FunctionCallingPromptMessage[];
        maxTokens: number;
        temperature: number | null;
        topP: number | null;
        presencePenalty: number | null;
        stream: true;
    };
};

export type FunctionCallingTrace = {
    selection: SelectionTraceEntry[];
    toolCalls: ToolCallTraceEntry[];
    finalAnswer: FinalAnswerTraceEntry | null;
    fallbackReason: FallbackReason | null;
    fallbackNotice: string | null;
    errors: string[];
};

export type FunctionCallingState = {
    originalUserMessage: string;
    syntheticContext: string;
    toolResults: ToolExecutionResult[];
    stepCount: number;
    trace: FunctionCallingTrace;
};

export type SelectionLlmResult = {
    text: string;
    toolCalls: FunctionCallingToolCall[];
    request: SelectionTraceEntry['request'];
};

export type FinalAnswerLlmResult = {
    text: string;
    request: FinalAnswerTraceEntry['request'];
};

export type FunctionCallingResult =
    | {
        kind: 'direct_answer';
        trace: FunctionCallingTrace;
        fallbackNotice: string | null;
        fallbackContext: string | null;
    }
    | {
        kind: 'tool_augmented_answer';
        displayText: string;
        historyText: string;
        trace: FunctionCallingTrace;
    };
