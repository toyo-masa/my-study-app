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
const CAPABILITY_BY_OP: Record<ToolOp, Capability> = {
    evaluate: 'deterministic_calc',
    simplify: 'symbolic_math',
    solve: 'symbolic_math',
    integrate: 'symbolic_math',
    differentiate: 'symbolic_math',
};

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
    const op = TOOL_OPS.includes(source.op as ToolOp)
        ? source.op as ToolOp
        : null;
    const requestedCapability = CAPABILITIES.includes(source.capability as Capability)
        ? source.capability as Capability
        : null;

    if (!op) {
        return null;
    }

    const capability = CAPABILITY_BY_OP[op] ?? requestedCapability;
    if (!capability) {
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

const extractJsonStringValue = (raw: string, key: string) => {
    const pattern = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`);
    const match = raw.match(pattern);
    return match?.[1] ?? null;
};

const extractJsonBooleanValue = (raw: string, key: string) => {
    const pattern = new RegExp(`"${key}"\\s*:\\s*(true|false)`);
    const match = raw.match(pattern);
    if (!match) {
        return null;
    }
    return match[1] === 'true';
};

const extractJsonArrayText = (raw: string, key: string) => {
    const pattern = new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`);
    const match = raw.match(pattern);
    return match?.[1] ?? null;
};

const extractJsonObjectText = (raw: string, key: string) => {
    const keyIndex = raw.indexOf(`"${key}"`);
    if (keyIndex === -1) {
        return null;
    }

    const colonIndex = raw.indexOf(':', keyIndex);
    if (colonIndex === -1) {
        return null;
    }

    const start = raw.indexOf('{', colonIndex);
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

const parseMalformedPlannerDecision = (raw: string): PlannerDecision | null => {
    const mode = normalizePlannerMode(extractJsonStringValue(raw, 'mode'));
    const problemType = normalizeProblemType(extractJsonStringValue(raw, 'problemType'));
    const requestedDone = extractJsonBooleanValue(raw, 'done') === true;

    const neededCapabilitiesText = extractJsonArrayText(raw, 'neededCapabilities');
    const neededCapabilities = appendCapabilityIfMissing(
        normalizeCapabilityList(
            neededCapabilitiesText
                ? CAPABILITIES.filter((capability) => neededCapabilitiesText.includes(capability))
                : []
        ),
        null
    );

    const nextActionText = extractJsonObjectText(raw, 'nextAction');
    let nextAction: ToolAction | null = null;
    if (nextActionText) {
        try {
            nextAction = normalizeToolAction(JSON.parse(nextActionText) as unknown);
        } catch {
            nextAction = null;
        }
    }
    const done = nextAction ? false : requestedDone;
    const normalizedMode = nextAction && !done ? 'tool_augmented_answer' : mode;

    if (normalizedMode === 'tool_augmented_answer' && !done && nextAction === null) {
        return null;
    }

    return {
        mode: normalizedMode,
        problemType,
        neededCapabilities: appendCapabilityIfMissing(neededCapabilities, nextAction?.capability ?? null),
        factsToAdd: [],
        done,
        nextAction,
    };
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
            const done = nextAction ? false : source.done === true;
            const normalizedMode = nextAction && !done
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
                done,
                nextAction,
            };

            if (decision.mode === 'tool_augmented_answer' && !decision.done && decision.nextAction === null) {
                return null;
            }

            return decision;
        } catch {
            const salvaged = parseMalformedPlannerDecision(candidate);
            if (salvaged) {
                return salvaged;
            }
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
