import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, Check, Clock3, Copy, LoaderCircle, MoreHorizontal, Plus, Send, Square, Trash2 } from 'lucide-react';
import type { ChatCompletionMessageParam, InitProgressReport } from '@mlc-ai/web-llm';
import { BackButton } from './BackButton';
import { MarkdownText } from './MarkdownText';
import type { LocalLlmMode, LocalLlmSettings } from '../utils/settings';
import { WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS } from '../utils/settings';
import {
    DEFAULT_WEB_LLM_MODEL_ID,
    ensureLocalLlmEngine,
    getLocalLlmSupport,
    hasLoadedLocalLlmEngine,
    interruptLocalLlmGeneration,
    resetLocalLlmChat,
    WEB_LLM_QWEN_MODEL_OPTIONS,
} from '../utils/localLlmEngine';
import {
    fetchOpenAiCompatibleModelIds,
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
    parseAssistantMessageSegments,
    runWebLlmBudgetedGeneration,
    type WebLlmGenerationPhase,
} from '../utils/webLlmBudgetedGeneration';

type LocalChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
};

interface LocalLlmChatProps {
    onBack: () => void;
    localLlmSettings: LocalLlmSettings;
    onLocalLlmModeChange: (preferredMode: LocalLlmMode) => void;
    onWebLlmModelChange: (modelId: string) => void;
}

const WEB_LLM_PROMPT_MESSAGE_LIMIT = 10;
const WEB_LLM_LENGTH_WARNING = 'WebLLM の上限に達したため、最終回答も途中で打ち切られました。必要なら続きを短く区切って質問してください。';

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
    return messages.map(({ id, role, content }) => ({
        id,
        role,
        content,
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
    const [apiKey, setApiKey] = useState('');
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [selectedLocalApiModel, setSelectedLocalApiModel] = useState(() => (
        initialSession.mode === 'openai-local'
            ? initialSession.modelId || localLlmSettings.defaultModelId
            : localLlmSettings.defaultModelId
    ));
    const [lastRequestPayload, setLastRequestPayload] = useState<string | null>(null);
    const [didCopyRequestPayload, setDidCopyRequestPayload] = useState(false);
    const [copiedAnswerMessageId, setCopiedAnswerMessageId] = useState<string | null>(null);
    const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [localApiFetchError, setLocalApiFetchError] = useState<string | null>(null);
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

    const activeMode = localLlmSettings.preferredMode;
    const selectedWebLlmModel = localLlmSettings.webllmModelId || DEFAULT_WEB_LLM_MODEL_ID;
    const webllmSystemPrompt = localLlmSettings.webllmSystemPrompt.trim();
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
        const modelIds = new Set<string>();
        const sessionModelId = currentSession?.mode === 'openai-local'
            ? currentSession.modelId.trim()
            : '';
        const preferredModelId = localLlmSettings.defaultModelId.trim();
        const currentLocalModelId = selectedLocalApiModel.trim();

        if (sessionModelId.length > 0) {
            modelIds.add(sessionModelId);
        }
        if (preferredModelId.length > 0) {
            modelIds.add(preferredModelId);
        }
        if (currentLocalModelId.length > 0) {
            modelIds.add(currentLocalModelId);
        }

        availableModels.forEach((modelId) => {
            const trimmed = modelId.trim();
            if (trimmed.length > 0) {
                modelIds.add(trimmed);
            }
        });

        return Array.from(modelIds);
    }, [availableModels, currentSession?.mode, currentSession?.modelId, localLlmSettings.defaultModelId, selectedLocalApiModel]);
    const selectedModel = activeMode === 'webllm'
        ? selectedWebLlmModel
        : selectedLocalApiModel.trim();
    const selectedModelOptionValue = activeMode === 'webllm'
        ? `webllm:${selectedWebLlmModel}`
        : (selectedLocalApiModel.trim().length > 0 ? `openai-local:${selectedLocalApiModel.trim()}` : 'openai-local:');
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

    const finalizeStreamingMessages = useCallback(() => {
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
    }, []);

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

    const resetCopiedAnswerState = useCallback(() => {
        if (copyAnswerResetTimeoutRef.current !== null) {
            window.clearTimeout(copyAnswerResetTimeoutRef.current);
            copyAnswerResetTimeoutRef.current = null;
        }
        setCopiedAnswerMessageId(null);
    }, []);

    const createFreshSession = useCallback((mode: LocalLlmMode) => {
        const nextSession = buildEmptySession(mode, localLlmSettings.defaultModelId, selectedWebLlmModel);
        setCurrentSessionId(nextSession.id);
        setMessages([]);
        setSelectedLocalApiModel(mode === 'openai-local' ? nextSession.modelId : localLlmSettings.defaultModelId);
        resetViewState();
    }, [localLlmSettings.defaultModelId, resetViewState, selectedWebLlmModel]);

    const selectSessionForView = useCallback((targetSession: StoredLocalLlmChatSession | null) => {
        if (!targetSession) {
            const draftSession = buildEmptySession(activeMode, localLlmSettings.defaultModelId, selectedWebLlmModel);
            setCurrentSessionId(draftSession.id);
            setMessages([]);
            setSelectedLocalApiModel(localLlmSettings.defaultModelId);
            setLastRequestPayload(null);
            resetCopiedRequestState();
            resetCopiedAnswerState();
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
        resetCopiedAnswerState();
        resetViewState();

        if (targetSession.mode !== activeMode) {
            onLocalLlmModeChange(targetSession.mode);
        }
        if (
            targetSession.mode === 'webllm'
            && targetSession.modelId
            && WEB_LLM_QWEN_MODEL_OPTIONS.some((option) => option.value === targetSession.modelId)
            && targetSession.modelId !== selectedWebLlmModel
        ) {
            onWebLlmModelChange(targetSession.modelId);
        }
    }, [
        activeMode,
        localLlmSettings.defaultModelId,
        onLocalLlmModeChange,
        onWebLlmModelChange,
        resetCopiedAnswerState,
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

    const handleCopyAssistantMessage = useCallback(async (messageId: string, content: string) => {
        const copyableContent = getCopyableAssistantContent(content);
        if (copyableContent.length === 0) {
            return;
        }

        try {
            await navigator.clipboard.writeText(copyableContent);
            resetCopiedAnswerState();
            setCopiedAnswerMessageId(messageId);
            copyAnswerResetTimeoutRef.current = window.setTimeout(() => {
                setCopiedAnswerMessageId(null);
                copyAnswerResetTimeoutRef.current = null;
            }, 2000);
        } catch {
            setError('回答内容をコピーできませんでした。');
        }
    }, [resetCopiedAnswerState]);

    useEffect(() => {
        mountedRef.current = true;

        if (initialSession.mode !== localLlmSettings.preferredMode) {
            modeChangeReasonRef.current = 'session-load';
            onLocalLlmModeChange(initialSession.mode);
        }
        if (
            initialSession.mode === 'webllm'
            && initialSession.modelId
            && WEB_LLM_QWEN_MODEL_OPTIONS.some((option) => option.value === initialSession.modelId)
            && initialSession.modelId !== selectedWebLlmModel
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
            cancelActiveWork();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setLastRequestPayload(null);
        resetCopiedRequestState();
        resetCopiedAnswerState();
        setOpenSessionMenuId(null);
    }, [currentSessionId, resetCopiedAnswerState, resetCopiedRequestState]);

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
        setAvailableModels([]);
        setLocalApiFetchError(null);
        if (activeMode === 'openai-local' && messages.length === 0) {
            setSelectedLocalApiModel((previous) => previous.trim().length > 0 ? previous : localLlmSettings.defaultModelId);
        }
    }, [activeMode, localLlmSettings.baseUrl, localLlmSettings.defaultModelId, messages.length]);

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
        if (!webllmSupport.supported || isModelLoading || isModelReady) {
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
    }, [isModelLoading, isModelReady, selectedWebLlmModel, webllmSupport.supported]);

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

        if (value.startsWith('openai-local:')) {
            const modelId = value.slice('openai-local:'.length).trim();
            if (activeMode !== 'openai-local') {
                onLocalLlmModeChange('openai-local');
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
            setSelectedLocalApiModel(modelId);
        }
    }, [activeMode, currentSession, onLocalLlmModeChange, onWebLlmModelChange]);

    const handleFetchModels = useCallback(async () => {
        if (activeMode !== 'openai-local' || localApiModelListAbortRef.current || localLlmSettings.baseUrl.trim().length === 0) {
            return;
        }

        const controller = new AbortController();
        localApiModelListAbortRef.current = controller;

        setError(null);
        setLocalApiFetchError(null);
        setIsFetchingModels(true);
        setAvailableModels([]);

        try {
            const modelIds = await fetchOpenAiCompatibleModelIds(
                localLlmSettings.baseUrl,
                undefined,
                controller.signal
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
    }, [activeMode, localLlmSettings.baseUrl, localLlmSettings.defaultModelId]);

    useEffect(() => {
        if (activeMode !== 'openai-local' || localLlmSettings.baseUrl.trim().length === 0) {
            return;
        }

        void handleFetchModels();
    }, [activeMode, handleFetchModels, localLlmSettings.baseUrl]);

    useEffect(() => {
        if (isGenerating || !currentSession) {
            return;
        }

        if (currentSession.mode !== activeMode) {
            modeChangeReasonRef.current = 'session-load';
            onLocalLlmModeChange(currentSession.mode);
            return;
        }

        if (
            currentSession.mode === 'webllm'
            && currentSession.modelId
            && WEB_LLM_QWEN_MODEL_OPTIONS.some((option) => option.value === currentSession.modelId)
            && currentSession.modelId !== selectedWebLlmModel
        ) {
            onWebLlmModelChange(currentSession.modelId);
            return;
        }

        if (currentSession.mode === 'openai-local') {
            setSelectedLocalApiModel(currentSession.modelId || localLlmSettings.defaultModelId);
        }
    }, [
        activeMode,
        currentSession,
        isGenerating,
        localLlmSettings.defaultModelId,
        onLocalLlmModeChange,
        onWebLlmModelChange,
        selectedWebLlmModel,
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
            setError('ローカルAPIモードでは送信前にモデル名を選択または入力してください。');
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
        syncSessionMessages({
            sessionId: generationSessionId,
            mode: generationSessionMode,
            modelId: generationSessionModelId,
            createdAt: generationSessionCreatedAt,
            viewMessages: generationMessages,
        });

        const updateAssistantText = (nextText: string) => {
            assistantText = nextText;
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

        const finalizeAssistantText = (finalText: string) => {
            if (!mountedRef.current || requestIdRef.current !== requestId) {
                return;
            }

            generationMessages = generationMessages
                .filter((message) => message.id !== assistantMessageId || finalText.length > 0)
                .map((message) => (
                    message.id === assistantMessageId
                        ? {
                            ...message,
                            content: finalText,
                            isStreaming: false,
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
                    enableThinking: localLlmSettings.webllmEnableThinking,
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
                    request: {
                        model: selectedModel,
                        messages: openAiMessages,
                        stream: true,
                    },
                });

                const finalText = await streamOpenAiCompatibleChat({
                    baseUrl: localLlmSettings.baseUrl,
                    model: selectedModel,
                    messages: openAiMessages,
                    apiKey: apiKey.trim() || undefined,
                    signal: controller.signal,
                    onDelta: (delta) => {
                        assistantText += delta;
                        updateAssistantText(assistantText);
                    },
                });

                if (assistantText.length === 0) {
                    assistantText = finalText;
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
        apiKey,
        currentSession?.createdAt,
        currentSessionId,
        input,
        isGenerating,
        isModelReady,
        localLlmSettings.baseUrl,
        localLlmSettings.webllmEnableThinking,
        webllmSystemPrompt,
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
    }, [finalizeStreamingMessages, invalidateActiveRequest, isGenerating]);

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
                <BackButton className="nav-btn" onClick={onBack} />
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
                                    <button
                                        type="button"
                                        className="menu-btn local-llm-session-menu-trigger"
                                        onClick={() => handleToggleSessionMenu(session.id)}
                                        disabled={isGenerating}
                                        aria-label="会話履歴メニューを開く"
                                        title="メニュー"
                                    >
                                        <MoreHorizontal size={16} />
                                    </button>
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
                                    モデルは下のプルダウンから選択します。接続先や詳細設定は設定サイドバーの「ローカルLLM設定」から変更できます。Shift + Enter で改行、Enter で送信します。
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
                                    aria-label="送信内容をコピー"
                                    title="送信内容をコピー"
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

                        <div className="local-llm-top-controls">
                            <select
                                className="local-llm-input"
                                value={selectedModelOptionValue}
                                onChange={(event) => handleModelOptionChange(event.target.value)}
                                disabled={isGenerating || isModelLoading}
                            >
                                <optgroup label="WebLLM">
                                    {WEB_LLM_QWEN_MODEL_OPTIONS.map((option) => (
                                        <option key={option.value} value={`webllm:${option.value}`}>
                                            {option.label}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label="ローカルAPI">
                                    <option value="openai-local:">ローカルAPI（モデルを手入力）</option>
                                    {localApiSelectableModels.map((modelId) => (
                                        <option key={modelId} value={`openai-local:${modelId}`}>
                                            {modelId}
                                        </option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>

                        {activeMode === 'openai-local' && (
                            <div className="local-llm-settings-grid">
                                <label className="local-llm-field">
                                    <span className="local-llm-field-label">APIキー</span>
                                    <input
                                        type="password"
                                        className="local-llm-input"
                                        value={apiKey}
                                        onChange={(event) => setApiKey(event.target.value)}
                                        placeholder="必要なときだけ入力"
                                        autoComplete="off"
                                        spellCheck={false}
                                    />
                                </label>
                                {(selectedLocalApiModel.trim().length === 0 || localApiFetchError !== null || localApiSelectableModels.length === 0) && (
                                    <label className="local-llm-field">
                                        <span className="local-llm-field-label">モデル名</span>
                                        <input
                                            type="text"
                                            className="local-llm-input"
                                            value={selectedLocalApiModel}
                                            onChange={(event) => setSelectedLocalApiModel(event.target.value)}
                                            placeholder={localLlmSettings.defaultModelId || 'Qwen3.5 などのモデル名を入力'}
                                            spellCheck={false}
                                        />
                                    </label>
                                )}
                            </div>
                        )}

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
                                            : (selectedModel.length > 0 ? 'ここからそのまま質問できます。' : 'ローカルAPIで使うモデル名を選択または入力してください。')}
                                    </p>
                                </div>
                            ) : (
                                messages.map((message) => {
                                    const parsedAssistantMessageSegments = message.role === 'assistant'
                                        ? parseAssistantMessageSegments(message.content)
                                        : null;

                                    return (
                                    <div
                                        key={message.id}
                                        className={`local-llm-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
                                    >
                                        <div className="local-llm-message-role">
                                            {message.role === 'user' ? 'You' : 'Local LLM'}
                                        </div>
                                        <div className={`local-llm-message-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                                            {message.role === 'assistant' ? (
                                                <div className="local-llm-assistant-stack">
                                                    <div className="local-llm-assistant-actions">
                                                        <button
                                                            type="button"
                                                            className="menu-btn local-llm-message-copy-btn"
                                                            onClick={() => { void handleCopyAssistantMessage(message.id, message.content); }}
                                                            disabled={getCopyableAssistantContent(message.content).length === 0}
                                                            aria-label="回答内容をコピー"
                                                            title="回答内容をコピー"
                                                        >
                                                            {copiedAnswerMessageId === message.id ? <Check size={16} /> : <Copy size={16} />}
                                                        </button>
                                                    </div>
                                                    {parsedAssistantMessageSegments?.map((segment, index) => (
                                                        segment.type === 'think'
                                                            ? (
                                                                <details
                                                                    key={`${message.id}-think-${index}`}
                                                                    className="local-llm-think-block"
                                                                    open={message.isStreaming ? true : undefined}
                                                                >
                                                                    <summary className="local-llm-think-summary">
                                                                        {message.isStreaming ? '思考中...' : '思考過程を表示'}
                                                                    </summary>
                                                                    <div className="local-llm-think-body">
                                                                        <MarkdownText
                                                                            content={segment.content}
                                                                            className="local-llm-markdown local-llm-think-markdown"
                                                                        />
                                                                    </div>
                                                                </details>
                                                            )
                                                            : (
                                                                <MarkdownText
                                                                    key={`${message.id}-answer-${index}`}
                                                                    content={segment.content}
                                                                    className="local-llm-markdown"
                                                                />
                                                            )
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="local-llm-plain-text">{message.content}</div>
                                            )}
                                            {message.isStreaming && (
                                                <span className="local-llm-streaming-indicator">
                                                    <LoaderCircle size={14} className="spin" />
                                                    {activeMode === 'webllm' && webllmGenerationPhase === 'finalizing'
                                                        ? '最終回答を生成中'
                                                        : '生成中'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="local-llm-composer">
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
                                    : (selectedModel.length > 0 ? '接続先のローカルAPIへ質問を入力してください' : '先にモデルを選択または入力してください')}
                                rows={4}
                                disabled={(activeMode === 'webllm' ? !isModelReady : selectedModel.length === 0) || isGenerating}
                            />
                            <div className="local-llm-composer-actions">
                                {isGenerating ? (
                                    <button
                                        type="button"
                                        className="nav-btn"
                                        onClick={handleStopGeneration}
                                    >
                                        <Square size={16} />
                                        生成を中止
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="nav-btn"
                                        onClick={() => { void handleSend(); }}
                                        disabled={!canSend}
                                    >
                                        <Send size={16} />
                                        送信
                                    </button>
                                )}
                            </div>
                        </div>
                        <div ref={bottomRef} className="local-llm-bottom-anchor" aria-hidden="true" />
                    </section>
                </div>
            </div>
        </div>
    );
};
