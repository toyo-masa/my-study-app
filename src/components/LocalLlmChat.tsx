import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowUp, Bot, Brain, Check, Clock3, Copy, LoaderCircle, Plus, Square, Trash2 } from 'lucide-react';
import type { ChatCompletionMessageParam, InitProgressReport } from '@mlc-ai/web-llm';
import { BackButton } from './BackButton';
import { LocalLlmModelPicker, type LocalLlmModelPickerOption } from './LocalLlmModelPicker';
import { LocalLlmMessageItem } from './LocalLlmMessageItem';
import type { LocalLlmMode, LocalLlmSettings } from '../utils/settings';
import {
    resolveLocalApiRequestOptions,
    WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS,
} from '../utils/settings';
import {
    DEFAULT_WEB_LLM_MODEL_ID,
    ensureLocalLlmEngine,
    getGroupedWebLlmModelOptions,
    getLocalLlmSupport,
    hasLoadedLocalLlmEngine,
    interruptLocalLlmGeneration,
    resetLocalLlmChat,
} from '../utils/localLlmEngine';
import {
    fetchOpenAiCompatibleModelIds,
    getCachedOpenAiCompatibleModelIds,
    streamOllamaNativeChat,
    streamOpenAiCompatibleChat,
    type OpenAiCompatibleMessage,
} from '../utils/openAiCompatibleLocalApi';
import {
    loadLocalLlmChatSessions,
    saveLocalLlmChatSessions,
    sortLocalLlmChatSessions,
    type StoredLocalLlmChatMessage,
    type StoredLocalLlmChatSession,
} from '../utils/localLlmChatHistory';
import {
    parseAssistantMessageContent,
    runWebLlmBudgetedGeneration,
    type WebLlmGenerationPhase,
} from '../utils/webLlmBudgetedGeneration';
import { findLocalApiProviderByBaseUrl } from '../utils/localApiProviders';
import { buildLocalApiModelOptionList } from '../utils/localApiModelOptions';

type LocalChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    generationDurationMs?: number;
};

interface LocalLlmChatProps {
    onBack: () => void;
    localLlmSettings: LocalLlmSettings;
    onLocalLlmModeChange: (preferredMode: LocalLlmMode) => void;
    onWebLlmModelChange: (modelId: string) => void;
}

const WEB_LLM_PROMPT_MESSAGE_LIMIT = 10;
const WEB_LLM_LENGTH_WARNING = 'WebLLM の上限に達したため、最終回答も途中で打ち切られました。必要なら続きを短く区切って質問してください。';
const STREAMING_RENDER_INTERVAL_MS = 80;
const LOCAL_LLM_BASE_SYSTEM_PROMPT = [
    'ユーザーの最新の依頼や質問内容を最優先にしてください。',
    '回答の詳しさ・長さ・形式は、ユーザーがこの会話で求めた内容に合わせてください。',
].join('\n');

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return 'ローカルLLMの処理に失敗しました。';
};

const toPromptMessageContent = (message: LocalChatMessage) => {
    if (message.role !== 'assistant') {
        return message.content;
    }

    return parseAssistantMessageContent(message.content).answerContent.trim();
};

const getCopyableAssistantContent = (content: string) => {
    const answerContent = parseAssistantMessageContent(content).answerContent.trim();
    return answerContent.length > 0 ? answerContent : content.trim();
};

const getCopyableMessageContent = (message: LocalChatMessage) => {
    return message.role === 'assistant'
        ? getCopyableAssistantContent(message.content)
        : message.content.trim();
};

const buildAssistantDisplayText = (thinkingText: string, answerText: string) => {
    const trimmedThinking = thinkingText.trim();
    const trimmedAnswer = answerText.trim();

    if (trimmedThinking.length === 0) {
        return answerText;
    }

    if (trimmedAnswer.length === 0) {
        return `<think>${thinkingText}`;
    }

    return `<think>${thinkingText}</think>\n\n${answerText}`;
};

const toWebLlmMessages = (
    messages: LocalChatMessage[],
    systemPrompt: string
): ChatCompletionMessageParam[] => {
    const conversationMessages = messages.flatMap((message) => {
        const content = toPromptMessageContent(message);
        if (content.trim().length === 0) {
            return [];
        }

        return [{
            role: message.role,
            content,
        }];
    }).slice(-WEB_LLM_PROMPT_MESSAGE_LIMIT);

    if (systemPrompt.trim().length === 0) {
        return conversationMessages;
    }

    return [
        {
            role: 'system',
            content: systemPrompt.trim(),
        },
        ...conversationMessages,
    ];
};

const toOpenAiMessages = (messages: LocalChatMessage[]): OpenAiCompatibleMessage[] => {
    return messages.flatMap((message) => {
        const content = toPromptMessageContent(message);
        if (content.trim().length === 0) {
            return [];
        }

        return [{
            role: message.role,
            content,
        }];
    });
};

const toProgressPercent = (progress: InitProgressReport | null) => {
    if (!progress) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
};

const toStoredMessages = (messages: LocalChatMessage[]): StoredLocalLlmChatMessage[] => {
    return messages.map(({ id, role, content, generationDurationMs }) => ({
        id,
        role,
        content,
        generationDurationMs,
    })).filter((message) => message.content.trim().length > 0);
};

const toViewMessages = (messages: StoredLocalLlmChatMessage[]): LocalChatMessage[] => {
    return messages.map((message) => ({
        ...message,
        isStreaming: false,
    }));
};

const buildSessionTitle = (messages: StoredLocalLlmChatMessage[]) => {
    const firstUserMessage = messages.find((message) => message.role === 'user')?.content.trim() ?? '';
    if (firstUserMessage.length === 0) {
        return '新しいチャット';
    }

    const normalized = firstUserMessage.replace(/\s+/g, ' ');
    return normalized.length > 30 ? `${normalized.slice(0, 30)}…` : normalized;
};

const formatSessionTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const buildEmptySession = (
    mode: LocalLlmMode,
    fallbackLocalModelId: string,
    fallbackWebLlmModelId: string
): StoredLocalLlmChatSession => {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        title: '新しいチャット',
        mode,
        modelId: mode === 'webllm' ? fallbackWebLlmModelId : fallbackLocalModelId.trim(),
        messages: [],
        createdAt: now,
        updatedAt: now,
    };
};

export const LocalLlmChat: React.FC<LocalLlmChatProps> = ({
    onBack,
    localLlmSettings,
    onLocalLlmModeChange,
    onWebLlmModelChange,
}) => {
    const webllmSupport = useMemo(() => getLocalLlmSupport(), []);
    const initialSessionsRef = useRef<StoredLocalLlmChatSession[] | null>(null);
    if (initialSessionsRef.current === null && typeof window !== 'undefined') {
        initialSessionsRef.current = loadLocalLlmChatSessions();
    }

    const initialSessions = initialSessionsRef.current ?? [];
    const initialSession = initialSessions[0] ?? buildEmptySession(
        localLlmSettings.preferredMode,
        localLlmSettings.defaultModelId,
        localLlmSettings.webllmModelId
    );

    const [chatSessions, setChatSessions] = useState<StoredLocalLlmChatSession[]>(initialSessions);
    const [currentSessionId, setCurrentSessionId] = useState(initialSession.id);
    const [messages, setMessages] = useState<LocalChatMessage[]>(() => toViewMessages(initialSession.messages));
    const [input, setInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loadProgress, setLoadProgress] = useState<InitProgressReport | null>(null);
    const [isModelLoading, setIsModelLoading] = useState(false);
    const [isModelReady, setIsModelReady] = useState(() => hasLoadedLocalLlmEngine(localLlmSettings.webllmModelId));
    const [isGenerating, setIsGenerating] = useState(false);
    const [webllmGenerationPhase, setWebllmGenerationPhase] = useState<WebLlmGenerationPhase | null>(null);
    const [availableModels, setAvailableModels] = useState<string[]>(() => (
        getCachedOpenAiCompatibleModelIds(localLlmSettings.baseUrl)
    ));
    const [selectedLocalApiModel, setSelectedLocalApiModel] = useState(() => (
        initialSession.mode === 'openai-local'
            ? initialSession.modelId || localLlmSettings.defaultModelId
            : localLlmSettings.defaultModelId
    ));
    const [lastRequestPayload, setLastRequestPayload] = useState<string | null>(null);
    const [didCopyRequestPayload, setDidCopyRequestPayload] = useState(false);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [localApiFetchError, setLocalApiFetchError] = useState<string | null>(null);
    const [isThinkingEnabled, setIsThinkingEnabled] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(true);
    const requestIdRef = useRef(0);
    const shouldAutoScrollRef = useRef(true);
    const isComposingRef = useRef(false);
    const lastScrollYRef = useRef(0);
    const localApiModelListAbortRef = useRef<AbortController | null>(null);
    const localApiChatAbortRef = useRef<AbortController | null>(null);
    const autoLoadWebLlmKeyRef = useRef<string | null>(null);
    const previousModeRef = useRef<LocalLlmMode>(localLlmSettings.preferredMode);
    const modeChangeReasonRef = useRef<'session-load' | null>(null);
    const copyRequestResetTimeoutRef = useRef<number | null>(null);
    const copyAnswerResetTimeoutRef = useRef<number | null>(null);
    const currentSessionIdRef = useRef(currentSessionId);
    const activeGenerationSessionRef = useRef<{
        sessionId: string;
        mode: LocalLlmMode;
        modelId: string;
        createdAt: string;
    } | null>(null);
    const streamingPendingTextRef = useRef('');
    const streamingRenderedTextRef = useRef('');
    const streamingFlushTimerRef = useRef<number | null>(null);
    const flushStreamingUpdateRef = useRef<(() => void) | null>(null);

    const activeMode = localLlmSettings.preferredMode;
    const selectedWebLlmModel = localLlmSettings.webllmModelId || DEFAULT_WEB_LLM_MODEL_ID;
    const webLlmSelectableModelGroups = useMemo(
        () => getGroupedWebLlmModelOptions(selectedWebLlmModel),
        [selectedWebLlmModel]
    );
    const webllmSystemPrompt = useMemo(() => {
        const customPrompt = localLlmSettings.webllmSystemPrompt.trim();
        return customPrompt.length > 0
            ? `${LOCAL_LLM_BASE_SYSTEM_PROMPT}\n${customPrompt}`
            : LOCAL_LLM_BASE_SYSTEM_PROMPT;
    }, [localLlmSettings.webllmSystemPrompt]);
    const matchedLocalApiProvider = useMemo(
        () => findLocalApiProviderByBaseUrl(localLlmSettings.baseUrl),
        [localLlmSettings.baseUrl]
    );
    const localApiRequestOptions = useMemo(
        () => resolveLocalApiRequestOptions(localLlmSettings),
        [localLlmSettings]
    );
    const showThinkingToggle = activeMode === 'webllm'
        || (activeMode === 'openai-local' && matchedLocalApiProvider?.id === 'ollama');
    const effectiveOllamaThink = useMemo(() => {
        if (matchedLocalApiProvider?.id !== 'ollama') {
            return localApiRequestOptions.ollamaThink;
        }

        return isThinkingEnabled
            ? (localApiRequestOptions.ollamaThink ?? true)
            : false;
    }, [isThinkingEnabled, localApiRequestOptions.ollamaThink, matchedLocalApiProvider?.id]);
    const webllmFirstPassTemperature = localLlmSettings.webllmFirstPassTemperature;
    const webllmFirstPassTopP = localLlmSettings.webllmFirstPassTopP;
    const webllmFirstPassThinkingBudget = localLlmSettings.webllmFirstPassThinkingBudget;
    const webllmFirstPassPresencePenalty = localLlmSettings.webllmFirstPassPresencePenalty;
    const webllmSecondPassTemperature = localLlmSettings.webllmSecondPassTemperature;
    const webllmSecondPassTopP = localLlmSettings.webllmSecondPassTopP;
    const webllmSecondPassFinalAnswerMaxTokens = localLlmSettings.webllmSecondPassFinalAnswerMaxTokens;
    const webllmSecondPassPresencePenalty = localLlmSettings.webllmSecondPassPresencePenalty;
    const currentSession = useMemo(
        () => chatSessions.find((session) => session.id === currentSessionId) ?? null,
        [chatSessions, currentSessionId]
    );
    const localApiSelectableModels = useMemo(() => {
        const sessionModelId = currentSession?.mode === 'openai-local'
            ? currentSession.modelId.trim()
            : '';
        const preferredModelId = localLlmSettings.defaultModelId.trim();
        const currentLocalModelId = selectedLocalApiModel.trim();

        return buildLocalApiModelOptionList(availableModels, [
            sessionModelId,
            preferredModelId,
            currentLocalModelId,
        ]);
    }, [availableModels, currentSession?.mode, currentSession?.modelId, localLlmSettings.defaultModelId, selectedLocalApiModel]);
    const selectedLocalApiModelOptionValue = localApiSelectableModels.includes(selectedLocalApiModel.trim())
        ? selectedLocalApiModel.trim()
        : '';
    const composerModelOptionValue = activeMode === 'webllm'
        ? `webllm:${selectedWebLlmModel}`
        : selectedLocalApiModelOptionValue.length > 0
            ? `openai-local:${selectedLocalApiModelOptionValue}`
            : 'openai-local';
    const composerModelPickerGroups = useMemo(() => {
        const webLlmGroups = webLlmSelectableModelGroups.map((group) => ({
            label: group.label,
            options: group.options.map((option) => ({
                value: `webllm:${option.value}`,
                label: option.label,
            })),
        }));

        const localApiOptions: LocalLlmModelPickerOption[] = localApiSelectableModels.map((modelId) => ({
            value: `openai-local:${modelId}`,
            label: modelId,
        }));

        if (localApiOptions.length === 0) {
            localApiOptions.push({
                value: 'openai-local',
                label: isFetchingModels && activeMode === 'openai-local'
                    ? 'ローカルAPI（モデル取得中…）'
                    : 'ローカルAPI（モデルを選択）',
                disabled: true,
            });
        } else if (activeMode === 'openai-local' && selectedLocalApiModelOptionValue.length === 0) {
            localApiOptions.unshift({
                value: 'openai-local',
                label: 'ローカルAPI（モデルを選択）',
                disabled: true,
            });
        }

        return [
            ...webLlmGroups,
            {
                label: 'ローカルAPI',
                options: localApiOptions,
            },
        ];
    }, [
        activeMode,
        isFetchingModels,
        localApiSelectableModels,
        selectedLocalApiModelOptionValue,
        webLlmSelectableModelGroups,
    ]);
    const selectedModel = activeMode === 'webllm'
        ? selectedWebLlmModel
        : selectedLocalApiModel.trim();
    const canSend = input.trim().length > 0
        && !isGenerating
        && (activeMode === 'webllm' ? isModelReady : selectedModel.length > 0);

    const syncSessionMessages = useCallback((params: {
        sessionId: string;
        mode: LocalLlmMode;
        modelId: string;
        createdAt: string;
        viewMessages: LocalChatMessage[];
    }) => {
        const storedMessages = toStoredMessages(params.viewMessages);
        const now = new Date().toISOString();
        const nextSession: StoredLocalLlmChatSession = {
            id: params.sessionId,
            title: buildSessionTitle(storedMessages),
            mode: params.mode,
            modelId: params.modelId,
            messages: storedMessages,
            createdAt: params.createdAt,
            updatedAt: now,
        };

        setChatSessions((previous) => {
            const existing = previous.find((session) => session.id === params.sessionId);
            const resolvedCreatedAt = existing?.createdAt ?? params.createdAt;
            const resolvedSession: StoredLocalLlmChatSession = {
                ...nextSession,
                createdAt: resolvedCreatedAt,
            };
            const isSame = existing
                && existing.title === resolvedSession.title
                && existing.mode === resolvedSession.mode
                && existing.modelId === resolvedSession.modelId
                && JSON.stringify(existing.messages) === JSON.stringify(resolvedSession.messages);

            if (isSame) {
                return previous;
            }

            return sortLocalLlmChatSessions([
                resolvedSession,
                ...previous.filter((session) => session.id !== params.sessionId),
            ]);
        });

        if (mountedRef.current && currentSessionIdRef.current === params.sessionId) {
            setMessages(params.viewMessages);
        }
    }, []);

    const invalidateActiveRequest = useCallback(() => {
        requestIdRef.current += 1;
    }, []);

    const isNearBottom = useCallback(() => {
        const bottomElement = bottomRef.current;
        if (!bottomElement || typeof window === 'undefined') {
            return true;
        }

        const distanceFromViewportBottom = bottomElement.getBoundingClientRect().top - window.innerHeight;
        return distanceFromViewportBottom <= 160;
    }, []);

    const scrollToBottom = useCallback((force = false) => {
        if (!force && !shouldAutoScrollRef.current) {
            return;
        }

        bottomRef.current?.scrollIntoView({
            behavior: isGenerating ? 'auto' : 'smooth',
            block: 'end',
        });
    }, [isGenerating]);

    const clearStreamingFlushTimer = useCallback(() => {
        if (streamingFlushTimerRef.current !== null) {
            window.clearTimeout(streamingFlushTimerRef.current);
            streamingFlushTimerRef.current = null;
        }
    }, []);

    const finalizeStreamingMessages = useCallback(() => {
        clearStreamingFlushTimer();
        flushStreamingUpdateRef.current?.();
        setMessages((previous) => previous
            .filter((message) => !(message.role === 'assistant' && message.isStreaming && message.content.trim().length === 0))
            .map((message) => (
                message.role === 'assistant' && message.isStreaming
                    ? {
                        ...message,
                        isStreaming: false,
                    }
                    : message
            )));
        flushStreamingUpdateRef.current = null;
    }, [clearStreamingFlushTimer]);

    const resetViewState = useCallback(() => {
        setInput('');
        setError(null);
        setLoadProgress(null);
        setLocalApiFetchError(null);
    }, []);

    const cancelActiveWork = useCallback(() => {
        invalidateActiveRequest();
        interruptLocalLlmGeneration();
        localApiModelListAbortRef.current?.abort();
        localApiModelListAbortRef.current = null;
        localApiChatAbortRef.current?.abort();
        localApiChatAbortRef.current = null;
        setIsGenerating(false);
        setWebllmGenerationPhase(null);
    }, [invalidateActiveRequest]);

    const resetCopiedRequestState = useCallback(() => {
        if (copyRequestResetTimeoutRef.current !== null) {
            window.clearTimeout(copyRequestResetTimeoutRef.current);
            copyRequestResetTimeoutRef.current = null;
        }
        setDidCopyRequestPayload(false);
    }, []);

    const resetCopiedMessageState = useCallback(() => {
        if (copyAnswerResetTimeoutRef.current !== null) {
            window.clearTimeout(copyAnswerResetTimeoutRef.current);
            copyAnswerResetTimeoutRef.current = null;
        }
        setCopiedMessageId(null);
    }, []);

    const createFreshSession = useCallback((mode: LocalLlmMode) => {
        const initialLocalModelId = mode === 'openai-local'
            ? (selectedLocalApiModel.trim() || localLlmSettings.defaultModelId)
            : localLlmSettings.defaultModelId;
        const nextSession = buildEmptySession(mode, initialLocalModelId, selectedWebLlmModel);
        setCurrentSessionId(nextSession.id);
        setMessages([]);
        setSelectedLocalApiModel(mode === 'openai-local' ? nextSession.modelId : localLlmSettings.defaultModelId);
        resetViewState();
    }, [localLlmSettings.defaultModelId, resetViewState, selectedLocalApiModel, selectedWebLlmModel]);

    const selectSessionForView = useCallback((targetSession: StoredLocalLlmChatSession | null) => {
        if (!targetSession) {
            const draftSession = buildEmptySession(activeMode, localLlmSettings.defaultModelId, selectedWebLlmModel);
            setCurrentSessionId(draftSession.id);
            setMessages([]);
            setSelectedLocalApiModel(localLlmSettings.defaultModelId);
            setLastRequestPayload(null);
            resetCopiedRequestState();
            resetCopiedMessageState();
            resetViewState();
            return;
        }

        modeChangeReasonRef.current = targetSession.mode !== activeMode ? 'session-load' : null;
        setCurrentSessionId(targetSession.id);
        setMessages(toViewMessages(targetSession.messages));
        setSelectedLocalApiModel(
            targetSession.mode === 'openai-local'
                ? (targetSession.modelId || localLlmSettings.defaultModelId)
                : localLlmSettings.defaultModelId
        );
        setLastRequestPayload(null);
        resetCopiedRequestState();
        resetCopiedMessageState();
        resetViewState();

        if (targetSession.mode !== activeMode) {
            onLocalLlmModeChange(targetSession.mode);
        }
        if (
            targetSession.mode === 'webllm'
            && targetSession.modelId
            && targetSession.modelId.trim().length > 0
        ) {
            onWebLlmModelChange(targetSession.modelId);
        }
    }, [
        activeMode,
        localLlmSettings.defaultModelId,
        onLocalLlmModeChange,
        onWebLlmModelChange,
        resetCopiedMessageState,
        resetCopiedRequestState,
        resetViewState,
        selectedWebLlmModel,
    ]);

    const handleSelectSession = useCallback((sessionId: string) => {
        const targetSession = chatSessions.find((session) => session.id === sessionId);
        if (!targetSession || targetSession.id === currentSessionId) {
            return;
        }

        if (!isGenerating) {
            cancelActiveWork();
        }
        selectSessionForView(targetSession);
    }, [cancelActiveWork, chatSessions, currentSessionId, isGenerating, selectSessionForView]);

    const handleCreateNewChat = useCallback(() => {
        if (isGenerating) {
            return;
        }

        cancelActiveWork();

        if (messages.length === 0) {
            resetViewState();
            if (activeMode === 'openai-local') {
                setSelectedLocalApiModel(localLlmSettings.defaultModelId);
            }
            return;
        }

        createFreshSession(activeMode);
    }, [activeMode, cancelActiveWork, createFreshSession, isGenerating, localLlmSettings.defaultModelId, messages.length, resetViewState]);

    const handleDeleteSession = useCallback((sessionId: string) => {
        if (isGenerating) {
            return;
        }

        cancelActiveWork();
        setOpenSessionMenuId(null);
        const nextSessions = sortLocalLlmChatSessions(chatSessions.filter((session) => session.id !== sessionId));
        setChatSessions(nextSessions);

        if (sessionId === currentSessionId) {
            selectSessionForView(nextSessions[0] ?? null);
        }
    }, [cancelActiveWork, chatSessions, currentSessionId, isGenerating, selectSessionForView]);

    const handleToggleSessionMenu = useCallback((sessionId: string) => {
        if (isGenerating) {
            return;
        }

        setOpenSessionMenuId((previous) => previous === sessionId ? null : sessionId);
    }, [isGenerating]);

    const handleSessionMenuTriggerKeyDown = useCallback((
        event: React.KeyboardEvent<HTMLSpanElement>,
        sessionId: string
    ) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        handleToggleSessionMenu(sessionId);
    }, [handleToggleSessionMenu]);

    const updateLastRequestPayload = useCallback((payload: unknown) => {
        setLastRequestPayload(JSON.stringify(payload, null, 2));
        resetCopiedRequestState();
    }, [resetCopiedRequestState]);

    const handleCopyRequestPayload = useCallback(async () => {
        if (!lastRequestPayload) {
            return;
        }

        try {
            await navigator.clipboard.writeText(lastRequestPayload);
            resetCopiedRequestState();
            setDidCopyRequestPayload(true);
            copyRequestResetTimeoutRef.current = window.setTimeout(() => {
                setDidCopyRequestPayload(false);
                copyRequestResetTimeoutRef.current = null;
            }, 2000);
        } catch {
            setError('送信内容をコピーできませんでした。');
        }
    }, [lastRequestPayload, resetCopiedRequestState]);

    const handleCopyMessage = useCallback(async (message: LocalChatMessage) => {
        const copyableContent = getCopyableMessageContent(message);
        if (copyableContent.length === 0) {
            return;
        }

        try {
            await navigator.clipboard.writeText(copyableContent);
            resetCopiedMessageState();
            setCopiedMessageId(message.id);
            copyAnswerResetTimeoutRef.current = window.setTimeout(() => {
                setCopiedMessageId(null);
                copyAnswerResetTimeoutRef.current = null;
            }, 2000);
        } catch {
            setError(message.role === 'assistant' ? '回答内容をコピーできませんでした。' : '質問内容をコピーできませんでした。');
        }
    }, [resetCopiedMessageState]);

    useEffect(() => {
        mountedRef.current = true;

        if (initialSession.mode !== localLlmSettings.preferredMode) {
            modeChangeReasonRef.current = 'session-load';
            onLocalLlmModeChange(initialSession.mode);
        }
        if (
            initialSession.mode === 'webllm'
            && initialSession.modelId
            && initialSession.modelId.trim().length > 0
        ) {
            onWebLlmModelChange(initialSession.modelId);
        }

        return () => {
            mountedRef.current = false;
            if (copyRequestResetTimeoutRef.current !== null) {
                window.clearTimeout(copyRequestResetTimeoutRef.current);
            }
            if (copyAnswerResetTimeoutRef.current !== null) {
                window.clearTimeout(copyAnswerResetTimeoutRef.current);
            }
            clearStreamingFlushTimer();
            cancelActiveWork();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cancelActiveWork, clearStreamingFlushTimer]);

    useEffect(() => {
        setLastRequestPayload(null);
        resetCopiedRequestState();
        resetCopiedMessageState();
        setOpenSessionMenuId(null);
    }, [currentSessionId, resetCopiedMessageState, resetCopiedRequestState]);

    useEffect(() => {
        if (openSessionMenuId === null) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                setOpenSessionMenuId(null);
                return;
            }

            if (target.closest('.local-llm-session-menu')) {
                return;
            }

            setOpenSessionMenuId(null);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpenSessionMenuId(null);
            }
        };

        window.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [openSessionMenuId]);

    useEffect(() => {
        currentSessionIdRef.current = currentSessionId;
    }, [currentSessionId]);

    useEffect(() => {
        lastScrollYRef.current = window.scrollY;

        let touchStartY: number | null = null;

        const handleWindowScroll = () => {
            const currentScrollY = window.scrollY;

            if (currentScrollY < lastScrollYRef.current - 2) {
                shouldAutoScrollRef.current = false;
            } else if (currentScrollY > lastScrollYRef.current + 2 && isNearBottom()) {
                shouldAutoScrollRef.current = true;
            }

            lastScrollYRef.current = currentScrollY;
        };

        const handleWheel = (event: WheelEvent) => {
            if (event.deltaY < -2) {
                shouldAutoScrollRef.current = false;
            } else if (event.deltaY > 2 && isNearBottom()) {
                shouldAutoScrollRef.current = true;
            }
        };

        const handleTouchStart = (event: TouchEvent) => {
            touchStartY = event.touches[0]?.clientY ?? null;
        };

        const handleTouchMove = (event: TouchEvent) => {
            const currentTouchY = event.touches[0]?.clientY;
            if (touchStartY === null || currentTouchY === undefined) {
                return;
            }

            if (currentTouchY > touchStartY + 4) {
                shouldAutoScrollRef.current = false;
            } else if (currentTouchY < touchStartY - 4 && isNearBottom()) {
                shouldAutoScrollRef.current = true;
            }
        };

        window.addEventListener('scroll', handleWindowScroll, { passive: true });
        window.addEventListener('wheel', handleWheel, { passive: true });
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('resize', handleWindowScroll);

        return () => {
            window.removeEventListener('scroll', handleWindowScroll);
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('resize', handleWindowScroll);
        };
    }, [isNearBottom]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    useEffect(() => {
        saveLocalLlmChatSessions(chatSessions);
    }, [chatSessions]);

    useEffect(() => {
        setIsModelReady(hasLoadedLocalLlmEngine(selectedWebLlmModel));
        if (!isModelLoading) {
            setLoadProgress(null);
        }
    }, [isModelLoading, selectedWebLlmModel]);

    useEffect(() => {
        if (previousModeRef.current === activeMode) {
            return;
        }

        previousModeRef.current = activeMode;

        if (modeChangeReasonRef.current === 'session-load') {
            modeChangeReasonRef.current = null;
            return;
        }

        cancelActiveWork();

        if (messages.length > 0) {
            createFreshSession(activeMode);
            return;
        }

        resetViewState();
        if (activeMode === 'openai-local') {
            setSelectedLocalApiModel((previous) => previous.trim().length > 0 ? previous : localLlmSettings.defaultModelId);
        }
    }, [activeMode, cancelActiveWork, createFreshSession, localLlmSettings.defaultModelId, messages.length, resetViewState]);

    useEffect(() => {
        setAvailableModels(getCachedOpenAiCompatibleModelIds(localLlmSettings.baseUrl));
        setLocalApiFetchError(null);
    }, [localLlmSettings.baseUrl]);

    useEffect(() => {
        if (activeMode === 'openai-local' && messages.length === 0) {
            setSelectedLocalApiModel((previous) => previous.trim().length > 0 ? previous : localLlmSettings.defaultModelId);
        }
    }, [activeMode, localLlmSettings.defaultModelId, messages.length]);

    useEffect(() => {
        if (!currentSessionId) {
            return;
        }

        const now = new Date().toISOString();
        const storedMessages = toStoredMessages(messages);
        if (storedMessages.length === 0) {
            setChatSessions((previous) => previous.filter((session) => session.id !== currentSessionId));
            return;
        }
        const persistedMode = isGenerating
            ? (chatSessions.find((session) => session.id === currentSessionId)?.mode ?? activeMode)
            : activeMode;
        const persistedModelId = isGenerating
            ? (chatSessions.find((session) => session.id === currentSessionId)?.modelId ?? (activeMode === 'webllm' ? selectedWebLlmModel : selectedModel))
            : (activeMode === 'webllm' ? selectedWebLlmModel : selectedModel);
        const nextSession: StoredLocalLlmChatSession = {
            id: currentSessionId,
            title: buildSessionTitle(storedMessages),
            mode: persistedMode,
            modelId: persistedModelId,
            messages: storedMessages,
            createdAt: chatSessions.find((session) => session.id === currentSessionId)?.createdAt ?? now,
            updatedAt: now,
        };

        setChatSessions((previous) => {
            const existing = previous.find((session) => session.id === currentSessionId);
            const isSame = existing
                && existing.title === nextSession.title
                && existing.mode === nextSession.mode
                && existing.modelId === nextSession.modelId
                && JSON.stringify(existing.messages) === JSON.stringify(nextSession.messages);

            if (isSame) {
                return previous;
            }

            return sortLocalLlmChatSessions([
                nextSession,
                ...previous.filter((session) => session.id !== currentSessionId),
            ]);
        });
    }, [activeMode, chatSessions, currentSessionId, isGenerating, messages, selectedModel, selectedWebLlmModel]);

    const handleLoadModel = useCallback(async () => {
        if (!webllmSupport.supported || isModelLoading || hasLoadedLocalLlmEngine(selectedWebLlmModel)) {
            return;
        }

        setError(null);
        setIsModelLoading(true);
        setLoadProgress(null);

        try {
            await ensureLocalLlmEngine(selectedWebLlmModel, (report) => {
                if (!mountedRef.current) {
                    return;
                }
                setLoadProgress(report);
            });

            if (!mountedRef.current) {
                return;
            }

            setIsModelReady(true);
            setLoadProgress({
                progress: 1,
                text: 'モデルの読み込みが完了しました。',
                timeElapsed: 0,
            });
        } catch (loadError) {
            if (!mountedRef.current) {
                return;
            }
            setError(getErrorMessage(loadError));
        } finally {
            if (mountedRef.current) {
                setIsModelLoading(false);
            }
        }
    }, [isModelLoading, selectedWebLlmModel, webllmSupport.supported]);

    const handleClearChat = useCallback(() => {
        if (isGenerating) {
            return;
        }
        if (currentSession) {
            handleDeleteSession(currentSession.id);
            return;
        }
        createFreshSession(activeMode);
    }, [activeMode, createFreshSession, currentSession, handleDeleteSession, isGenerating]);

    const fetchLocalApiModels = useCallback(async (options?: { force?: boolean }) => {
        if (localApiModelListAbortRef.current || localLlmSettings.baseUrl.trim().length === 0) {
            return;
        }

        const controller = new AbortController();
        localApiModelListAbortRef.current = controller;

        setError(null);
        setLocalApiFetchError(null);
        setIsFetchingModels(true);

        try {
            const modelIds = await fetchOpenAiCompatibleModelIds(
                localLlmSettings.baseUrl,
                undefined,
                controller.signal,
                { force: options?.force === true }
            );

            if (!mountedRef.current || localApiModelListAbortRef.current !== controller) {
                return;
            }

            setAvailableModels(modelIds);
            setSelectedLocalApiModel((previous) => {
                const currentLocalModel = previous.trim();
                const preferredModel = localLlmSettings.defaultModelId.trim();
                if (currentLocalModel.length > 0 && modelIds.includes(currentLocalModel)) {
                    return currentLocalModel;
                }
                if (preferredModel.length > 0 && modelIds.includes(preferredModel)) {
                    return preferredModel;
                }
                if (modelIds.length === 1) {
                    return modelIds[0];
                }
                return currentLocalModel;
            });
        } catch (fetchError) {
            if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
                return;
            }

            if (!mountedRef.current) {
                return;
            }

            setLocalApiFetchError(getErrorMessage(fetchError));
        } finally {
            if (mountedRef.current && localApiModelListAbortRef.current === controller) {
                localApiModelListAbortRef.current = null;
                setIsFetchingModels(false);
            }
        }
    }, [localLlmSettings.baseUrl, localLlmSettings.defaultModelId]);

    const handleModelOptionChange = useCallback((value: string) => {
        if (value.startsWith('webllm:')) {
            const modelId = value.slice('webllm:'.length);
            if (activeMode !== 'webllm') {
                onLocalLlmModeChange('webllm');
            }
            if (modelId.length > 0) {
                if (currentSession) {
                    setChatSessions((previous) => previous.map((session) => (
                        session.id === currentSession.id
                            ? {
                                ...session,
                                mode: 'webllm',
                                modelId,
                            }
                            : session
                    )));
                }
                onWebLlmModelChange(modelId);
            }
            return;
        }

        if (value === 'openai-local' || value.startsWith('openai-local:')) {
            const modelId = value === 'openai-local'
                ? selectedLocalApiModel.trim()
                : value.slice('openai-local:'.length).trim();
            if (modelId !== selectedLocalApiModel) {
                setSelectedLocalApiModel(modelId);
            }
            if (activeMode !== 'openai-local') {
                onLocalLlmModeChange('openai-local');
                void fetchLocalApiModels();
            }
            if (currentSession) {
                setChatSessions((previous) => previous.map((session) => (
                    session.id === currentSession.id
                        ? {
                            ...session,
                            mode: 'openai-local',
                            modelId,
                        }
                            : session
                )));
            }
        }
    }, [activeMode, currentSession, fetchLocalApiModels, onLocalLlmModeChange, onWebLlmModelChange, selectedLocalApiModel]);

    useEffect(() => {
        if (activeMode !== 'openai-local' || localLlmSettings.baseUrl.trim().length === 0) {
            return;
        }

        void fetchLocalApiModels();
    }, [activeMode, fetchLocalApiModels, localLlmSettings.baseUrl]);

    useEffect(() => {
        if (activeMode === 'webllm') {
            setIsThinkingEnabled(localLlmSettings.webllmEnableThinking);
            return;
        }

        if (activeMode === 'openai-local' && matchedLocalApiProvider?.id === 'ollama') {
            setIsThinkingEnabled(localApiRequestOptions.ollamaThink !== false);
            return;
        }

        setIsThinkingEnabled(false);
    }, [
        activeMode,
        localApiRequestOptions.ollamaThink,
        localLlmSettings.webllmEnableThinking,
        matchedLocalApiProvider?.id,
    ]);

    useEffect(() => {
        if (activeMode !== 'webllm' || !webllmSupport.supported) {
            autoLoadWebLlmKeyRef.current = null;
            return;
        }

        if (isModelLoading) {
            return;
        }

        const autoLoadKey = `${activeMode}:${selectedWebLlmModel}`;
        if (hasLoadedLocalLlmEngine(selectedWebLlmModel) || autoLoadWebLlmKeyRef.current === autoLoadKey) {
            return;
        }

        autoLoadWebLlmKeyRef.current = autoLoadKey;
        void handleLoadModel();
    }, [activeMode, handleLoadModel, isModelLoading, selectedWebLlmModel, webllmSupport.supported]);

    const handleSend = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || isGenerating) {
            return;
        }

        if (activeMode === 'webllm' && !isModelReady) {
            return;
        }

        if (activeMode === 'openai-local' && selectedModel.length === 0) {
            setError('ローカルAPIモードでは送信前にモデルを選択してください。');
            return;
        }

        const userMessage: LocalChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: trimmed,
        };
        const assistantMessageId = crypto.randomUUID();
        const pendingAssistantMessage: LocalChatMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            isStreaming: true,
        };
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        let assistantText = '';
        let webllmHitFinalLengthLimit = false;
        const generationStartedAt = performance.now();
        let generationMessages: LocalChatMessage[] = [...messages, userMessage, pendingAssistantMessage];
        const generationSessionId = currentSessionId;
        const generationSessionMode = activeMode;
        const generationSessionModelId = activeMode === 'webllm' ? selectedWebLlmModel : selectedModel;
        const generationSessionCreatedAt = currentSession?.createdAt ?? new Date().toISOString();

        activeGenerationSessionRef.current = {
            sessionId: generationSessionId,
            mode: generationSessionMode,
            modelId: generationSessionModelId,
            createdAt: generationSessionCreatedAt,
        };

        setError(null);
        setInput('');
        setIsGenerating(true);
        setWebllmGenerationPhase(null);
        shouldAutoScrollRef.current = true;
        streamingPendingTextRef.current = '';
        streamingRenderedTextRef.current = '';
        clearStreamingFlushTimer();
        syncSessionMessages({
            sessionId: generationSessionId,
            mode: generationSessionMode,
            modelId: generationSessionModelId,
            createdAt: generationSessionCreatedAt,
            viewMessages: generationMessages,
        });

        const commitAssistantText = (nextText: string) => {
            if (!mountedRef.current || requestIdRef.current !== requestId) {
                return;
            }

            generationMessages = generationMessages.map((message) => (
                message.id === assistantMessageId
                    ? {
                        ...message,
                        content: nextText,
                        isStreaming: true,
                    }
                    : message
            ));

            syncSessionMessages({
                sessionId: generationSessionId,
                mode: generationSessionMode,
                modelId: generationSessionModelId,
                createdAt: generationSessionCreatedAt,
                viewMessages: generationMessages,
            });
        };

        const flushPendingAssistantText = () => {
            clearStreamingFlushTimer();
            const nextText = streamingPendingTextRef.current;
            if (nextText === streamingRenderedTextRef.current) {
                return;
            }
            streamingRenderedTextRef.current = nextText;
            commitAssistantText(nextText);
        };

        flushStreamingUpdateRef.current = flushPendingAssistantText;

        const updateAssistantText = (nextText: string) => {
            assistantText = nextText;
            streamingPendingTextRef.current = nextText;

            if (localLlmSettings.webllmStreamingRenderMode !== 'lightweight') {
                streamingRenderedTextRef.current = nextText;
                commitAssistantText(nextText);
                return;
            }

            if (streamingFlushTimerRef.current !== null) {
                return;
            }

            streamingFlushTimerRef.current = window.setTimeout(() => {
                streamingFlushTimerRef.current = null;
                flushPendingAssistantText();
            }, STREAMING_RENDER_INTERVAL_MS);
        };

        const finalizeAssistantText = (finalText: string) => {
            if (!mountedRef.current || requestIdRef.current !== requestId) {
                return;
            }

            const generationDurationMs = Math.max(0, performance.now() - generationStartedAt);
            streamingPendingTextRef.current = finalText;
            streamingRenderedTextRef.current = finalText;
            clearStreamingFlushTimer();
            flushStreamingUpdateRef.current = null;

            generationMessages = generationMessages
                .filter((message) => message.id !== assistantMessageId || finalText.length > 0)
                .map((message) => (
                    message.id === assistantMessageId
                        ? {
                            ...message,
                            content: finalText,
                            isStreaming: false,
                            generationDurationMs,
                        }
                        : message
                ));

            syncSessionMessages({
                sessionId: generationSessionId,
                mode: generationSessionMode,
                modelId: generationSessionModelId,
                createdAt: generationSessionCreatedAt,
                viewMessages: generationMessages,
            });
        };

        try {
            if (activeMode === 'webllm') {
                const engine = await ensureLocalLlmEngine(selectedWebLlmModel);
                const webLlmMessages = toWebLlmMessages([...messages, userMessage], webllmSystemPrompt);
                const result = await runWebLlmBudgetedGeneration({
                    engine,
                    messages: webLlmMessages,
                    enableThinking: isThinkingEnabled,
                    firstPassThinkingBudget: webllmFirstPassThinkingBudget ?? 1024,
                    firstPassTemperature: webllmFirstPassTemperature ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.temperature,
                    firstPassTopP: webllmFirstPassTopP ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.topP,
                    firstPassPresencePenalty: webllmFirstPassPresencePenalty,
                    secondPassFinalAnswerMaxTokens: webllmSecondPassFinalAnswerMaxTokens ?? 512,
                    secondPassTemperature: webllmSecondPassTemperature,
                    secondPassTopP: webllmSecondPassTopP,
                    secondPassPresencePenalty: webllmSecondPassPresencePenalty,
                    onDisplayText: updateAssistantText,
                    onPhaseChange: (phase) => {
                        if (!mountedRef.current || requestIdRef.current !== requestId) {
                            return;
                        }
                        setWebllmGenerationPhase(phase);
                    },
                });
                updateLastRequestPayload({
                    mode: 'webllm',
                    model: selectedWebLlmModel,
                    requests: {
                        firstPass: result.firstPassRequest,
                        secondPass: result.secondPassRequest ?? null,
                    },
                    secondPassTrigger: result.secondPassTrigger,
                });

                assistantText = result.displayText;
                webllmHitFinalLengthLimit = result.usedSecondPass && result.secondFinishReason === 'length';
                if (result.firstFinishReason === 'length' || result.secondFinishReason === 'length') {
                    await resetLocalLlmChat(selectedWebLlmModel).catch(() => undefined);
                }
            } else {
                const controller = new AbortController();
                localApiChatAbortRef.current = controller;
                const openAiMessages = toOpenAiMessages([...messages, userMessage]);
                updateLastRequestPayload({
                    mode: 'openai-local',
                    baseUrl: localLlmSettings.baseUrl,
                    model: selectedModel,
                    request: matchedLocalApiProvider?.id === 'ollama'
                        ? {
                            model: selectedModel,
                            messages: openAiMessages,
                            stream: true,
                            think: effectiveOllamaThink,
                            options: {
                                temperature: localApiRequestOptions.temperature,
                                top_p: localApiRequestOptions.topP,
                                num_predict: localApiRequestOptions.maxTokens,
                            },
                        }
                        : {
                            model: selectedModel,
                            messages: openAiMessages,
                            stream: true,
                            temperature: localApiRequestOptions.temperature,
                            top_p: localApiRequestOptions.topP,
                            max_tokens: localApiRequestOptions.maxTokens,
                            extra_body: localApiRequestOptions.extraBody,
                        },
                });

                if (matchedLocalApiProvider?.id === 'ollama') {
                    let thinkingText = '';
                    let answerText = '';

                    const finalResult = await streamOllamaNativeChat({
                        baseUrl: localLlmSettings.baseUrl,
                        model: selectedModel,
                        messages: openAiMessages,
                        signal: controller.signal,
                        think: effectiveOllamaThink,
                        temperature: localApiRequestOptions.temperature,
                        topP: localApiRequestOptions.topP,
                        maxTokens: localApiRequestOptions.maxTokens,
                        onThinkingDelta: (delta) => {
                            thinkingText += delta;
                            assistantText = buildAssistantDisplayText(thinkingText, answerText);
                            updateAssistantText(assistantText);
                        },
                        onContentDelta: (delta) => {
                            answerText += delta;
                            assistantText = buildAssistantDisplayText(thinkingText, answerText);
                            updateAssistantText(assistantText);
                        },
                    });

                    if (assistantText.length === 0) {
                        assistantText = buildAssistantDisplayText(finalResult.thinkingText, finalResult.contentText);
                    }
                } else {
                    const finalText = await streamOpenAiCompatibleChat({
                        baseUrl: localLlmSettings.baseUrl,
                        model: selectedModel,
                        messages: openAiMessages,
                        signal: controller.signal,
                        temperature: localApiRequestOptions.temperature,
                        topP: localApiRequestOptions.topP,
                        maxTokens: localApiRequestOptions.maxTokens,
                        extraBody: localApiRequestOptions.extraBody,
                        onDelta: (delta) => {
                            assistantText += delta;
                            updateAssistantText(assistantText);
                        },
                    });

                    if (assistantText.length === 0) {
                        assistantText = finalText;
                    }
                }

                if (localApiChatAbortRef.current === controller) {
                    localApiChatAbortRef.current = null;
                }
            }

            finalizeAssistantText(assistantText);
            if (webllmHitFinalLengthLimit && mountedRef.current && requestIdRef.current === requestId) {
                setError(WEB_LLM_LENGTH_WARNING);
            }
        } catch (generationError) {
            if (generationError instanceof DOMException && generationError.name === 'AbortError') {
                return;
            }

            if (activeMode === 'webllm') {
                await resetLocalLlmChat(selectedWebLlmModel).catch(() => undefined);
            }

            if (mountedRef.current && requestIdRef.current === requestId) {
                setError(getErrorMessage(generationError));
                finalizeAssistantText(assistantText);
            }
        } finally {
            localApiChatAbortRef.current = null;
            if (mountedRef.current && requestIdRef.current === requestId) {
                setIsGenerating(false);
                setWebllmGenerationPhase(null);
            }
            if (requestIdRef.current === requestId) {
                activeGenerationSessionRef.current = null;
            }
        }
    }, [
        activeMode,
        clearStreamingFlushTimer,
        currentSession?.createdAt,
        currentSessionId,
        input,
        isGenerating,
        isModelReady,
        isThinkingEnabled,
        effectiveOllamaThink,
        localApiRequestOptions.extraBody,
        localApiRequestOptions.maxTokens,
        localApiRequestOptions.temperature,
        localApiRequestOptions.topP,
        localLlmSettings.baseUrl,
        localLlmSettings.webllmStreamingRenderMode,
        webllmSystemPrompt,
        matchedLocalApiProvider?.id,
        webllmFirstPassTemperature,
        webllmFirstPassTopP,
        webllmFirstPassThinkingBudget,
        webllmFirstPassPresencePenalty,
        webllmSecondPassTemperature,
        webllmSecondPassTopP,
        webllmSecondPassFinalAnswerMaxTokens,
        webllmSecondPassPresencePenalty,
        messages,
        selectedWebLlmModel,
        selectedModel,
        syncSessionMessages,
        updateLastRequestPayload,
    ]);

    const handleStopGeneration = useCallback(() => {
        if (!isGenerating) {
            return;
        }

        const activeGeneration = activeGenerationSessionRef.current;
        setError(null);
        clearStreamingFlushTimer();
        flushStreamingUpdateRef.current?.();
        invalidateActiveRequest();
        interruptLocalLlmGeneration();
        if (activeGeneration?.mode === 'webllm') {
            void resetLocalLlmChat(activeGeneration.modelId).catch(() => undefined);
        }
        localApiChatAbortRef.current?.abort();
        localApiChatAbortRef.current = null;
        activeGenerationSessionRef.current = null;
        setIsGenerating(false);
        setWebllmGenerationPhase(null);
        finalizeStreamingMessages();
    }, [clearStreamingFlushTimer, finalizeStreamingMessages, invalidateActiveRequest, isGenerating]);

    const handleBackNavigation = useCallback(() => {
        shouldAutoScrollRef.current = false;
        setOpenSessionMenuId(null);
        resetCopiedRequestState();
        resetCopiedMessageState();
        clearStreamingFlushTimer();
        flushStreamingUpdateRef.current = null;
        invalidateActiveRequest();
        interruptLocalLlmGeneration();
        localApiModelListAbortRef.current?.abort();
        localApiModelListAbortRef.current = null;
        localApiChatAbortRef.current?.abort();
        localApiChatAbortRef.current = null;
        activeGenerationSessionRef.current = null;
        onBack();
    }, [
        clearStreamingFlushTimer,
        invalidateActiveRequest,
        onBack,
        resetCopiedMessageState,
        resetCopiedRequestState,
    ]);

    const handleTextareaKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.nativeEvent.isComposing || isComposingRef.current || event.keyCode === 229) {
            return;
        }

        if (event.key !== 'Enter' || event.shiftKey) {
            return;
        }

        event.preventDefault();
        void handleSend();
    }, [handleSend]);

    return (
        <div className="local-llm-page">
            <div className="local-llm-header">
                <BackButton className="nav-btn" onClick={handleBackNavigation} />
                <div>
                    <h1 className="local-llm-title">ローカルLLMチャット（試作）</h1>
                    <p className="local-llm-subtitle">
                        モデルを選んでそのまま会話できます。細かい設定は設定サイドバーの「ローカルLLM設定」から変更します。
                    </p>
                </div>
            </div>

            <div className="local-llm-layout">
                <aside className="local-llm-sidebar">
                    <div className="local-llm-sidebar-head">
                        <div>
                            <h2>会話履歴</h2>
                            <p>ローカルストレージに保存されます</p>
                        </div>
                        <button type="button" className="nav-btn" onClick={handleCreateNewChat} disabled={isGenerating}>
                            <Plus size={16} />
                            新しいチャット
                        </button>
                    </div>

                    <div className="local-llm-sidebar-list">
                        {chatSessions.map((session) => (
                            <div
                                key={session.id}
                                className={`local-llm-session-item ${session.id === currentSessionId ? 'active' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="local-llm-session-select"
                                    onClick={() => handleSelectSession(session.id)}
                                >
                                    <div className="local-llm-session-title">{session.title}</div>
                                    <div className="local-llm-session-meta">
                                        <span>{session.mode === 'webllm' ? 'WebLLM' : 'ローカルAPI'}</span>
                                        <span className="local-llm-session-model">{session.modelId || 'モデル未選択'}</span>
                                    </div>
                                    <div className="local-llm-session-time">
                                        <Clock3 size={13} />
                                        {formatSessionTime(session.updatedAt)}
                                    </div>
                                </button>
                                <div className="local-llm-session-menu">
                                    <span
                                        className={`local-llm-session-menu-trigger ${isGenerating ? 'is-disabled' : ''}`}
                                        onClick={() => {
                                            if (!isGenerating) {
                                                handleToggleSessionMenu(session.id);
                                            }
                                        }}
                                        onKeyDown={(event) => handleSessionMenuTriggerKeyDown(event, session.id)}
                                        role="button"
                                        tabIndex={isGenerating ? -1 : 0}
                                        aria-label="会話履歴メニューを開く"
                                        title="メニュー"
                                        aria-disabled={isGenerating}
                                    >
                                        …
                                    </span>
                                    {openSessionMenuId === session.id && (
                                        <div className="local-llm-session-menu-popover" role="menu" aria-label="会話履歴メニュー">
                                            <button
                                                type="button"
                                                className="local-llm-session-menu-item danger"
                                                onClick={() => handleDeleteSession(session.id)}
                                                role="menuitem"
                                            >
                                                <Trash2 size={16} />
                                                削除する
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>

                <div className="local-llm-main">
                    <section className="local-llm-card local-llm-chat-card">
                        <div className="local-llm-card-head">
                            <div>
                                <h2>チャット</h2>
                                <p>
                                    送信欄のモデル表示から候補を切り替えられます。接続先や詳細設定は設定サイドバーの「ローカルLLM設定」から変更できます。Shift + Enter で改行、Enter で送信します。
                                </p>
                            </div>
                            <div className="local-llm-chat-head-actions">
                                {isGenerating && activeMode === 'webllm' && webllmGenerationPhase && (
                                    <span className="local-llm-inline-status">
                                        <LoaderCircle size={15} className="spin" />
                                        {webllmGenerationPhase === 'thinking' ? '思考中' : '最終回答を生成中'}
                                    </span>
                                )}
                                {isModelLoading && activeMode === 'webllm' && (
                                    <span className="local-llm-inline-status">
                                        <LoaderCircle size={15} className="spin" />
                                        読み込み中
                                    </span>
                                )}
                                {isFetchingModels && activeMode === 'openai-local' && (
                                    <span className="local-llm-inline-status">
                                        <LoaderCircle size={15} className="spin" />
                                        接続確認中
                                    </span>
                                )}
                                <button
                                    type="button"
                                    className="menu-btn right-panel-copy-btn"
                                    onClick={() => { void handleCopyRequestPayload(); }}
                                    disabled={!lastRequestPayload || isGenerating}
                                    aria-label="モデルへ送ったリクエスト本文をコピー"
                                    title="モデルへ送ったリクエスト本文をコピーします"
                                >
                                    {didCopyRequestPayload ? <Check size={18} /> : <Copy size={18} />}
                                </button>
                                <button
                                    type="button"
                                    className="menu-btn right-panel-clear-btn"
                                    onClick={handleClearChat}
                                    disabled={(currentSession === null && messages.length === 0) || isGenerating}
                                    aria-label="会話履歴を削除"
                                    title="会話履歴を削除"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        {loadProgress && activeMode === 'webllm' && (
                            <div className="local-llm-progress-block">
                                <div className="local-llm-progress-head">
                                    <span>{loadProgress.text}</span>
                                    <span>{toProgressPercent(loadProgress)}%</span>
                                </div>
                                <div className="local-llm-progress-bar">
                                    <div
                                        className="local-llm-progress-fill"
                                        style={{ width: `${toProgressPercent(loadProgress)}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {activeMode === 'webllm' && !webllmSupport.supported && (
                            <div className="local-llm-alert is-error">
                                <AlertTriangle size={18} />
                                <span>{webllmSupport.reason}</span>
                            </div>
                        )}

                        {activeMode === 'openai-local' && localApiFetchError && (
                            <div className="local-llm-alert is-error">
                                <AlertTriangle size={18} />
                                <span>{localApiFetchError}</span>
                            </div>
                        )}

                        {error && (
                            <div className="local-llm-alert is-error">
                                <AlertTriangle size={18} />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="local-llm-thread">
                            {messages.length === 0 ? (
                                <div className="local-llm-thread-empty">
                                    <Bot size={28} />
                                    <p>
                                        {activeMode === 'webllm'
                                            ? (isModelReady ? 'ここからそのまま質問できます。' : '選んだ WebLLM モデルを読み込み中です。')
                                            : (selectedModel.length > 0 ? 'ここからそのまま質問できます。' : 'ローカルAPIで使うモデルを選択してください。')}
                                    </p>
                                </div>
                            ) : (
                                messages.map((message) => (
                                    <LocalLlmMessageItem
                                        key={message.id}
                                        message={message}
                                        isCopied={copiedMessageId === message.id}
                                        onCopy={handleCopyMessage}
                                        streamingLabel={message.isStreaming
                                            ? (activeMode === 'webllm' && webllmGenerationPhase === 'finalizing'
                                                ? '最終回答を生成中'
                                                : '生成中')
                                            : undefined}
                                    />
                                ))
                            )}
                        </div>

                        <div className="local-llm-composer">
                            <div className="local-llm-composer-shell">
                                <textarea
                                    className="local-llm-textarea"
                                    value={input}
                                    onChange={(event) => setInput(event.target.value)}
                                    onCompositionStart={() => {
                                        isComposingRef.current = true;
                                    }}
                                    onCompositionEnd={() => {
                                        isComposingRef.current = false;
                                    }}
                                    onKeyDown={handleTextareaKeyDown}
                                    placeholder={activeMode === 'webllm'
                                        ? (isModelReady ? 'ローカルLLMに質問を入力してください' : '先にモデルを読み込んでください')
                                        : (selectedModel.length > 0 ? 'ローカルAPIへ質問を入力してください' : '先にモデルを選択してください')}
                                    rows={2}
                                    disabled={(activeMode === 'webllm' ? !isModelReady : selectedModel.length === 0) || isGenerating}
                                />
                                <div className="local-llm-composer-toolbar">
                                    <div className="local-llm-composer-settings">
                                        <LocalLlmModelPicker
                                            groups={composerModelPickerGroups}
                                            value={composerModelOptionValue}
                                            onChange={handleModelOptionChange}
                                            disabled={isGenerating || isModelLoading}
                                            ariaLabel="モデルを選択する"
                                        />
                                        {showThinkingToggle && (
                                            <button
                                                type="button"
                                                className={`local-llm-thinking-toggle ${isThinkingEnabled ? 'active' : ''}`}
                                                onClick={() => setIsThinkingEnabled((previous) => !previous)}
                                                disabled={isGenerating}
                                                aria-pressed={isThinkingEnabled}
                                                aria-label={isThinkingEnabled ? 'Thinking をオフにする' : 'Thinking をオンにする'}
                                                title={isThinkingEnabled ? 'Thinking ON' : 'Thinking OFF'}
                                            >
                                                <Brain size={15} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="local-llm-composer-actions">
                                        {isGenerating ? (
                                            <button
                                                type="button"
                                                className="local-llm-send-btn is-stop"
                                                onClick={handleStopGeneration}
                                                aria-label="生成を中止"
                                                title="生成を中止"
                                            >
                                                <Square size={18} />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="local-llm-send-btn"
                                                onClick={() => { void handleSend(); }}
                                                disabled={!canSend}
                                                aria-label="送信"
                                                title="送信"
                                            >
                                                <ArrowUp size={20} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div ref={bottomRef} className="local-llm-bottom-anchor" aria-hidden="true" />
                    </section>
                </div>
            </div>
        </div>
    );
};
