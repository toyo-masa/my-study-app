import type {
    Capability,
    PlannerDecision,
    PlannerMode,
    PlannerProblemType,
    ToolAction,
    ToolOp,
} from './types';

const CAPABILITIES: Capability[] = ['deterministic_calc', 'symbolic_math'];
const TOOL_OPS: ToolOp[] = ['evaluate', 'simplify', 'solve', 'integrate', 'differentiate'];
const PROBLEM_TYPES: PlannerProblemType[] = ['unknown', 'symbolic_math', 'reading', 'factual', 'mixed'];

const normalizePlannerMode = (value: unknown): PlannerMode => {
    return value === 'tool_augmented_answer' ? 'tool_augmented_answer' : 'direct_answer';
};

const normalizeProblemType = (value: unknown): PlannerProblemType => {
    return PROBLEM_TYPES.includes(value as PlannerProblemType)
        ? value as PlannerProblemType
        : 'unknown';
};

const normalizeCapabilityList = (value: unknown): Capability[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(new Set(
        value.filter((item): item is Capability => CAPABILITIES.includes(item as Capability))
    ));
};

const appendCapabilityIfMissing = (capabilities: Capability[], capability: Capability | null) => {
    if (!capability || capabilities.includes(capability)) {
        return capabilities;
    }
    return [...capabilities, capability];
};

const normalizeFacts = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(new Set(
        value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
    ));
};

const normalizeToolAction = (value: unknown): ToolAction | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const source = value as Partial<ToolAction>;
    const capability = CAPABILITIES.includes(source.capability as Capability)
        ? source.capability as Capability
        : null;
    const op = TOOL_OPS.includes(source.op as ToolOp)
        ? source.op as ToolOp
        : null;

    if (!capability || !op) {
        return null;
    }

    const payload = source.payload && typeof source.payload === 'object' && !Array.isArray(source.payload)
        ? source.payload as Record<string, unknown>
        : {};

    return {
        capability,
        op,
        payload,
    };
};

const extractFirstJsonObject = (raw: string) => {
    const start = raw.indexOf('{');
    if (start === -1) {
        return null;
    }

    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let index = start; index < raw.length; index += 1) {
        const char = raw[index];

        if (inString) {
            if (isEscaped) {
                isEscaped = false;
                continue;
            }
            if (char === '\\') {
                isEscaped = true;
                continue;
            }
            if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return raw.slice(start, index + 1);
            }
        }
    }

    return null;
};

export const parsePlannerDecision = (raw: string): PlannerDecision | null => {
    const trimmed = raw.trim();
    const candidates = [trimmed, extractFirstJsonObject(trimmed)].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate) as unknown;
            if (!parsed || typeof parsed !== 'object') {
                continue;
            }

            const source = parsed as Partial<PlannerDecision>;
            const nextAction = normalizeToolAction(source.nextAction);
            const normalizedMode = nextAction && source.done !== true
                ? 'tool_augmented_answer'
                : normalizePlannerMode(source.mode);
            const decision: PlannerDecision = {
                mode: normalizedMode,
                problemType: normalizeProblemType(source.problemType),
                neededCapabilities: appendCapabilityIfMissing(
                    normalizeCapabilityList(source.neededCapabilities),
                    nextAction?.capability ?? null
                ),
                factsToAdd: normalizeFacts(source.factsToAdd),
                done: source.done === true,
                nextAction,
            };

            if (decision.mode === 'tool_augmented_answer' && !decision.done && decision.nextAction === null) {
                return null;
            }

            return decision;
        } catch {
            // noop
        }
    }

    return null;
};

export const stringifyToolAction = (action: ToolAction) => {
    return JSON.stringify({
        capability: action.capability,
        op: action.op,
        payload: action.payload,
    });
};
