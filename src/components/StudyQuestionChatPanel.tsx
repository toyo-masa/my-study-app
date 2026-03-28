import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, Brain, Check, Copy, LoaderCircle, Send, Square, Trash2 } from 'lucide-react';
import type { ChatCompletionMessageParam, InitProgressReport } from '@mlc-ai/web-llm';
import type { Question } from '../types';
import type { LocalLlmMode, LocalLlmSettings } from '../utils/settings';
import {
    resolveLocalApiRequestOptions,
    WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS,
} from '../utils/settings';
import { LocalLlmMessageItem } from './LocalLlmMessageItem';
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
    streamOllamaNativeChat,
    streamOpenAiCompatibleChat,
    type OpenAiCompatibleMessage,
} from '../utils/openAiCompatibleLocalApi';
import type { StoredLocalLlmChatMessage } from '../utils/localLlmChatHistory';
import {
    findStudyQuestionChatSession,
    loadStudyQuestionChatSessions,
    saveStudyQuestionChatSessions,
    type StoredStudyQuestionChatSession,
} from '../utils/studyQuestionChatHistory';
import {
    parseAssistantMessageContent,
    runWebLlmBudgetedGeneration,
    type WebLlmGenerationPhase,
} from '../utils/webLlmBudgetedGeneration';
import {
    findLocalApiProviderByBaseUrl,
    LOCAL_API_PROVIDER_PRESETS,
} from '../utils/localApiProviders';

type LocalChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    generationDurationMs?: number;
};

interface StudyQuestionChatPanelProps {
    quizSetId: number;
    question: Question;
    questionIndex: number;
    showAnswer: boolean;
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

const buildQuestionContextUserPrompt = (question: Question, questionIndex: number, showAnswer: boolean) => {
    const questionType = question.questionType === 'memorization' ? 'memorization' : 'quiz';
    const parts: string[] = [
        'あなたは学習中のユーザーを支援する日本語の問題解説アシスタントです。',
        `現在扱っているのは学習中の問題${questionIndex + 1}です。`,
        `問題種別: ${questionType}`,
        `問題文:\n${question.text.trim()}`,
    ];

    if (questionType === 'quiz' && question.options.length > 0) {
        parts.push(`選択肢:\n${question.options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`);
    }

    if (!showAnswer) {
        parts.push('現在は解答前です。正答や解説はまだ開示しないでください。');
        parts.push('答えを直接言わず、考え方、着眼点、ヒント、確認質問に留めてください。');
        return parts.join('\n\n');
    }

    parts.push('現在は解答後です。必要に応じて正答や解説に触れながら説明して構いません。');

    if (questionType === 'quiz') {
        const correctAnswerLines = question.correctAnswers
            .filter((answer): answer is number => typeof answer === 'number')
            .map((answer) => {
                const optionText = question.options[answer];
                return optionText ? `${answer + 1}. ${optionText}` : `${answer + 1}`;
            });

        if (correctAnswerLines.length > 0) {
            parts.push(`正答:\n${correctAnswerLines.join('\n')}`);
        }
    } else {
        const memorizationAnswers = question.correctAnswers
            .filter((answer): answer is string => typeof answer === 'string' && answer.trim().length > 0);
        if (memorizationAnswers.length > 0) {
            parts.push(`解答:\n${memorizationAnswers.join('\n')}`);
        }
    }

    if (question.explanation.trim().length > 0) {
        parts.push(`解説:\n${question.explanation.trim()}`);
    }

    return parts.join('\n\n');
};

const toWebLlmMessages = (
    messages: LocalChatMessage[],
    systemPrompt: string,
    leadingUserPrompt = ''
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

    const leadingMessages: ChatCompletionMessageParam[] = [];
    if (systemPrompt.trim().length > 0) {
        leadingMessages.push({
            role: 'system',
            content: systemPrompt.trim(),
        });
    }
    if (leadingUserPrompt.trim().length > 0) {
        leadingMessages.push({
            role: 'user',
            content: leadingUserPrompt.trim(),
        });
    }

    return [...leadingMessages, ...conversationMessages];
};

const toOpenAiMessages = (
    messages: LocalChatMessage[],
    systemPrompt: string,
    leadingUserPrompt = ''
): OpenAiCompatibleMessage[] => {
    const conversationMessages = messages.flatMap((message) => {
        const content = toPromptMessageContent(message);
        if (content.trim().length === 0) {
            return [];
        }

        return [{
            role: message.role,
            content,
        }];
    });

    const leadingMessages: OpenAiCompatibleMessage[] = [];
    if (systemPrompt.trim().length > 0) {
        leadingMessages.push({
            role: 'system',
            content: systemPrompt.trim(),
        });
    }
    if (leadingUserPrompt.trim().length > 0) {
        leadingMessages.push({
            role: 'user',
            content: leadingUserPrompt.trim(),
        });
    }

    return [...leadingMessages, ...conversationMessages];
};

const toProgressPercent = (progress: InitProgressReport | null) => {
    if (!progress) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
};

export const StudyQuestionChatPanel: React.FC<StudyQuestionChatPanelProps> = ({
    quizSetId,
    question,
    questionIndex,
    showAnswer,
    localLlmSettings,
    onLocalLlmModeChange,
    onWebLlmModelChange,
}) => {
    const questionId = question.id ?? null;
    const initialSessionsRef = useRef<StoredStudyQuestionChatSession[] | null>(null);
    if (initialSessionsRef.current === null && typeof window !== 'undefined') {
        initialSessionsRef.current = loadStudyQuestionChatSessions();
    }

    const initialSessions = initialSessionsRef.current ?? [];
    const initialSession = questionId !== null
        ? findStudyQuestionChatSession(initialSessions, quizSetId, questionId)
        : null;
    const hasInitialMessages = (initialSession?.messages.length ?? 0) > 0;

    const [storedSessions, setStoredSessions] = useState<StoredStudyQuestionChatSession[]>(initialSessions);
    const storedSessionsRef = useRef<StoredStudyQuestionChatSession[]>(initialSessions);
    const [messages, setMessages] = useState<LocalChatMessage[]>(() => initialSession ? toViewMessages(initialSession.messages) : []);
    const [input, setInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loadProgress, setLoadProgress] = useState<InitProgressReport | null>(null);
    const [isModelLoading, setIsModelLoading] = useState(false);
    const [isModelReady, setIsModelReady] = useState(() => hasLoadedLocalLlmEngine(localLlmSettings.webllmModelId));
    const [isGenerating, setIsGenerating] = useState(false);
    const [webllmGenerationPhase, setWebllmGenerationPhase] = useState<WebLlmGenerationPhase | null>(null);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [selectedLocalApiModel, setSelectedLocalApiModel] = useState(() => (
        initialSession?.mode === 'openai-local'
            ? (initialSession.modelId || localLlmSettings.defaultModelId)
            : localLlmSettings.defaultModelId
    ));
    const [lastRequestPayload, setLastRequestPayload] = useState<string | null>(null);
    const [didCopyRequestPayload, setDidCopyRequestPayload] = useState(false);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [localApiFetchError, setLocalApiFetchError] = useState<string | null>(null);
    const [isThinkingEnabled, setIsThinkingEnabled] = useState(true);
    const threadRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(true);
    const requestIdRef = useRef(0);
    const shouldAutoScrollRef = useRef(!hasInitialMessages);
    const isComposingRef = useRef(false);
    const localApiModelListAbortRef = useRef<AbortController | null>(null);
    const localApiChatAbortRef = useRef<AbortController | null>(null);
    const autoLoadWebLlmKeyRef = useRef<string | null>(null);
    const copyRequestResetTimeoutRef = useRef<number | null>(null);
    const copyAnswerResetTimeoutRef = useRef<number | null>(null);
    const streamingPendingTextRef = useRef('');
    const streamingRenderedTextRef = useRef('');
    const streamingFlushTimerRef = useRef<number | null>(null);
    const flushStreamingUpdateRef = useRef<(() => void) | null>(null);

    const webllmSupport = useMemo(() => getLocalLlmSupport(), []);
    const activeMode = localLlmSettings.preferredMode;
    const selectedWebLlmModel = localLlmSettings.webllmModelId || DEFAULT_WEB_LLM_MODEL_ID;
    const webLlmSelectableModelGroups = useMemo(
        () => getGroupedWebLlmModelOptions(selectedWebLlmModel),
        [selectedWebLlmModel]
    );
    const webllmFirstPassTemperature = localLlmSettings.webllmFirstPassTemperature;
    const webllmFirstPassTopP = localLlmSettings.webllmFirstPassTopP;
    const webllmFirstPassThinkingBudget = localLlmSettings.webllmFirstPassThinkingBudget;
    const webllmSecondPassFinalAnswerMaxTokens = localLlmSettings.webllmSecondPassFinalAnswerMaxTokens;
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
    const selectedModel = activeMode === 'webllm'
        ? selectedWebLlmModel
        : selectedLocalApiModel.trim();
    const localApiSelectableModels = useMemo(() => {
        const modelIds = new Set<string>();
        const sessionModelId = initialSession?.mode === 'openai-local'
            ? initialSession.modelId.trim()
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
    }, [availableModels, initialSession?.mode, initialSession?.modelId, localLlmSettings.defaultModelId, selectedLocalApiModel]);
    const selectedModelOptionValue = activeMode === 'webllm'
        ? `webllm:${selectedWebLlmModel}`
        : 'openai-local';
    const canSend = input.trim().length > 0
        && !isGenerating
        && questionId !== null
        && (activeMode === 'webllm' ? isModelReady : selectedModel.length > 0);
    const questionContextUserPrompt = useMemo(() => {
        return buildQuestionContextUserPrompt(question, questionIndex, showAnswer);
    }, [question, questionIndex, showAnswer]);
    const webllmSystemPrompt = useMemo(() => {
        const customPrompt = localLlmSettings.webllmSystemPrompt.trim();
        return customPrompt.length > 0
            ? `${LOCAL_LLM_BASE_SYSTEM_PROMPT}\n${customPrompt}`
            : LOCAL_LLM_BASE_SYSTEM_PROMPT;
    }, [localLlmSettings.webllmSystemPrompt]);

    const invalidateActiveRequest = useCallback(() => {
        requestIdRef.current += 1;
    }, []);

    const resetTransientState = useCallback(() => {
        setInput('');
        setError(null);
        setLocalApiFetchError(null);
        setAvailableModels([]);
    }, []);

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

    const isNearBottom = useCallback(() => {
        const element = threadRef.current;
        if (!element) {
            return true;
        }
        return element.scrollHeight - element.scrollTop - element.clientHeight <= 120;
    }, []);

    const scrollToBottom = useCallback((force = false) => {
        const element = threadRef.current;
        if (!element || (!force && !shouldAutoScrollRef.current)) {
            return;
        }

        element.scrollTo({
            top: element.scrollHeight,
            behavior: isGenerating ? 'auto' : 'smooth',
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

    useEffect(() => {
        storedSessionsRef.current = storedSessions;
    }, [storedSessions]);

    useEffect(() => {
        mountedRef.current = true;
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
    }, [cancelActiveWork, clearStreamingFlushTimer]);

    useEffect(() => {
        saveStudyQuestionChatSessions(storedSessions);
    }, [storedSessions]);

    useEffect(() => {
        setIsModelReady(hasLoadedLocalLlmEngine(selectedWebLlmModel));
        if (!isModelLoading) {
            setLoadProgress(null);
        }
    }, [isModelLoading, selectedWebLlmModel]);

    useEffect(() => {
        cancelActiveWork();
        resetTransientState();

        if (questionId === null) {
            shouldAutoScrollRef.current = true;
            setMessages([]);
            setSelectedLocalApiModel(localLlmSettings.defaultModelId);
            return;
        }

        const session = findStudyQuestionChatSession(storedSessionsRef.current, quizSetId, questionId);
        const restoredMessages = session ? toViewMessages(session.messages) : [];
        const hasRestoredMessages = restoredMessages.length > 0;
        shouldAutoScrollRef.current = !hasRestoredMessages;
        setMessages(restoredMessages);
        if (session?.mode === 'webllm') {
            onLocalLlmModeChange('webllm');
            if (
                session.modelId
                && session.modelId.trim().length > 0
            ) {
                onWebLlmModelChange(session.modelId);
            }
        } else if (session?.mode === 'openai-local') {
            onLocalLlmModeChange('openai-local');
        }
        setSelectedLocalApiModel(
            session?.mode === 'openai-local'
                ? (session.modelId || localLlmSettings.defaultModelId)
                : localLlmSettings.defaultModelId
        );
        setLastRequestPayload(null);
        resetCopiedRequestState();
        resetCopiedMessageState();
    }, [
        cancelActiveWork,
        localLlmSettings.defaultModelId,
        onLocalLlmModeChange,
        onWebLlmModelChange,
        questionId,
        quizSetId,
        resetCopiedMessageState,
        resetCopiedRequestState,
        resetTransientState,
    ]);

    useEffect(() => {
        if (activeMode !== 'openai-local') {
            return;
        }

        setSelectedLocalApiModel((previous) => previous.trim().length > 0 ? previous : localLlmSettings.defaultModelId);
    }, [activeMode, localLlmSettings.defaultModelId]);

    useEffect(() => {
        setAvailableModels([]);
        setLocalApiFetchError(null);
    }, [localLlmSettings.baseUrl]);

    useEffect(() => {
        if (questionId === null) {
            return;
        }

        const storedMessages = toStoredMessages(messages);
        setStoredSessions((previous) => {
            const existing = findStudyQuestionChatSession(previous, quizSetId, questionId);

            if (storedMessages.length === 0) {
                if (!existing) {
                    return previous;
                }
                return previous.filter((session) => !(session.quizSetId === quizSetId && session.questionId === questionId));
            }

            const now = new Date().toISOString();
            const nextSession: StoredStudyQuestionChatSession = {
                quizSetId,
                questionId,
                mode: activeMode,
                modelId: selectedModel,
                messages: storedMessages,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
            };

            const isSameMessages = existing
                && JSON.stringify(existing.messages) === JSON.stringify(nextSession.messages);

            if (isSameMessages) {
                return previous;
            }

            return [
                nextSession,
                ...previous.filter((session) => !(session.quizSetId === quizSetId && session.questionId === questionId)),
            ];
        });
    }, [activeMode, messages, questionId, quizSetId, selectedModel]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    const handleThreadScroll = useCallback(() => {
        shouldAutoScrollRef.current = isNearBottom();
    }, [isNearBottom]);

    const handleLoadModel = useCallback(async () => {
        if (isModelLoading || hasLoadedLocalLlmEngine(selectedWebLlmModel)) {
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
    }, [isModelLoading, selectedWebLlmModel]);

    const handleFetchModels = useCallback(async () => {
        if (isFetchingModels || localLlmSettings.baseUrl.trim().length === 0) {
            return;
        }

        localApiModelListAbortRef.current?.abort();
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
                const preferredModel = localLlmSettings.defaultModelId.trim();
                const currentLocalModel = previous.trim();
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
    }, [isFetchingModels, localLlmSettings.baseUrl, localLlmSettings.defaultModelId]);

    useEffect(() => {
        if (activeMode !== 'openai-local' || localLlmSettings.baseUrl.trim().length === 0) {
            return;
        }

        void handleFetchModels();
    }, [activeMode, handleFetchModels, localLlmSettings.baseUrl]);

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
        if (!trimmed || isGenerating || questionId === null) {
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

        setError(null);
        setInput('');
        setIsGenerating(true);
        setWebllmGenerationPhase(null);
        shouldAutoScrollRef.current = true;
        streamingPendingTextRef.current = '';
        streamingRenderedTextRef.current = '';
        clearStreamingFlushTimer();
        setMessages((previous) => [...previous, userMessage, pendingAssistantMessage]);

        const commitAssistantText = (nextText: string) => {
            if (!mountedRef.current || requestIdRef.current !== requestId) {
                return;
            }

            setMessages((previous) => previous.map((message) => (
                message.id === assistantMessageId
                    ? {
                        ...message,
                        content: nextText,
                        isStreaming: true,
                    }
                        : message
            )));
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

            setMessages((previous) => previous.filter((message) => {
                if (message.id !== assistantMessageId) {
                    return true;
                }
                return finalText.length > 0;
            }).map((message) => (
                message.id === assistantMessageId
                    ? {
                        ...message,
                        content: finalText,
                        isStreaming: false,
                        generationDurationMs,
                        }
                        : message
            )));
        };

        try {
            if (activeMode === 'webllm') {
                const engine = await ensureLocalLlmEngine(selectedWebLlmModel);
                const webLlmMessages = toWebLlmMessages(
                    [...messages, userMessage],
                    webllmSystemPrompt,
                    questionContextUserPrompt
                );
                const result = await runWebLlmBudgetedGeneration({
                    engine,
                    messages: webLlmMessages,
                    enableThinking: isThinkingEnabled,
                    firstPassThinkingBudget: webllmFirstPassThinkingBudget ?? 1024,
                    firstPassTemperature: webllmFirstPassTemperature ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.temperature,
                    firstPassTopP: webllmFirstPassTopP ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.topP,
                    firstPassPresencePenalty: localLlmSettings.webllmFirstPassPresencePenalty,
                    secondPassFinalAnswerMaxTokens: webllmSecondPassFinalAnswerMaxTokens ?? 512,
                    secondPassTemperature: localLlmSettings.webllmSecondPassTemperature,
                    secondPassTopP: localLlmSettings.webllmSecondPassTopP,
                    secondPassPresencePenalty: localLlmSettings.webllmSecondPassPresencePenalty,
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
                const openAiMessages = toOpenAiMessages(
                    [...messages, userMessage],
                    '',
                    questionContextUserPrompt
                );
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
        }
    }, [
        activeMode,
        clearStreamingFlushTimer,
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
        webllmFirstPassTemperature,
        webllmFirstPassTopP,
        localLlmSettings.webllmFirstPassPresencePenalty,
        localLlmSettings.webllmSecondPassPresencePenalty,
        localLlmSettings.webllmSecondPassTemperature,
        localLlmSettings.webllmSecondPassTopP,
        matchedLocalApiProvider?.id,
        messages,
        questionId,
        questionContextUserPrompt,
        selectedModel,
        selectedWebLlmModel,
        updateLastRequestPayload,
        webllmSystemPrompt,
        webllmFirstPassThinkingBudget,
        webllmSecondPassFinalAnswerMaxTokens,
    ]);

    const handleStopGeneration = useCallback(() => {
        if (!isGenerating) {
            return;
        }

        setError(null);
        clearStreamingFlushTimer();
        flushStreamingUpdateRef.current?.();
        invalidateActiveRequest();
        interruptLocalLlmGeneration();
        if (activeMode === 'webllm') {
            void resetLocalLlmChat(selectedWebLlmModel).catch(() => undefined);
        }
        localApiChatAbortRef.current?.abort();
        localApiChatAbortRef.current = null;
        setIsGenerating(false);
        setWebllmGenerationPhase(null);
        finalizeStreamingMessages();
    }, [activeMode, clearStreamingFlushTimer, finalizeStreamingMessages, invalidateActiveRequest, isGenerating, selectedWebLlmModel]);

    const handleClearChat = useCallback(() => {
        if (isGenerating) {
            return;
        }

        if (questionId !== null) {
            setStoredSessions((previous) => previous.filter((session) => !(session.quizSetId === quizSetId && session.questionId === questionId)));
        }
        shouldAutoScrollRef.current = true;
        setMessages([]);
        setInput('');
        setError(null);
        setLastRequestPayload(null);
        resetCopiedRequestState();
        resetCopiedMessageState();
    }, [isGenerating, questionId, quizSetId, resetCopiedMessageState, resetCopiedRequestState]);

    const handleModelOptionChange = useCallback((value: string) => {
        if (value.startsWith('webllm:')) {
            const modelId = value.slice('webllm:'.length);
            if (activeMode !== 'webllm') {
                onLocalLlmModeChange('webllm');
            }
            if (modelId.length > 0) {
                if (questionId !== null) {
                    setStoredSessions((previous) => previous.map((session) => (
                        session.quizSetId === quizSetId && session.questionId === questionId
                            ? {
                                ...session,
                                mode: 'webllm',
                                modelId,
                            }
                            : session
                    )));
                }
                if (modelId !== selectedWebLlmModel) {
                    onWebLlmModelChange(modelId);
                }
            }
            return;
        }

        if (value === 'openai-local' || value.startsWith('openai-local:')) {
            const modelId = value === 'openai-local'
                ? selectedLocalApiModel.trim()
                : value.slice('openai-local:'.length).trim();
            if (activeMode !== 'openai-local') {
                onLocalLlmModeChange('openai-local');
            }
            if (questionId !== null) {
                setStoredSessions((previous) => previous.map((session) => (
                    session.quizSetId === quizSetId && session.questionId === questionId
                        ? {
                            ...session,
                            mode: 'openai-local',
                            modelId,
                        }
                        : session
                    )));
            }
            if (modelId !== selectedLocalApiModel) {
                setSelectedLocalApiModel(modelId);
            }
        }
    }, [activeMode, onLocalLlmModeChange, onWebLlmModelChange, questionId, quizSetId, selectedLocalApiModel, selectedWebLlmModel]);

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
        <div className="study-question-chat-panel">
            <div className="study-question-chat-panel-header">
                <div className="study-question-chat-panel-head">
                    <div>
                        <h2>AIチャット</h2>
                        <p>問題{questionIndex + 1}について質問できます。{showAnswer ? '解説込みで相談できます。' : 'ヒント中心で答えます。'}</p>
                    </div>
                    <div className="study-question-chat-head-actions">
                        {isGenerating && activeMode === 'webllm' && webllmGenerationPhase && (
                            <span className="local-llm-inline-status">
                                <LoaderCircle size={15} className="spin" />
                                {webllmGenerationPhase === 'thinking' ? '思考中' : '最終回答を生成中'}
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
                            disabled={messages.length === 0 || isGenerating}
                            aria-label="この問題の会話をクリア"
                            title="クリア"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                </div>

                <div className="study-question-chat-field-row">
                    <select
                        className="local-llm-input"
                        value={selectedModelOptionValue}
                        onChange={(event) => handleModelOptionChange(event.target.value)}
                        disabled={isGenerating || isModelLoading}
                    >
                        {webLlmSelectableModelGroups.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                                {group.options.map((option) => (
                                    <option key={option.value} value={`webllm:${option.value}`}>
                                        {option.label}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                        <optgroup label="ローカルAPI">
                            <option value="openai-local">ローカルAPI</option>
                        </optgroup>
                    </select>
                    {isModelLoading && activeMode === 'webllm' && (
                        <span className="local-llm-inline-status">
                            <LoaderCircle size={15} className="spin" />
                            読み込み中
                        </span>
                    )}
                </div>

                {activeMode === 'openai-local' && (
                    <>
                        {localApiFetchError === null && localApiSelectableModels.length > 0 ? (
                            <select
                                className="local-llm-input"
                                value={selectedLocalApiModel.trim()}
                                onChange={(event) => handleModelOptionChange(`openai-local:${event.target.value}`)}
                                disabled={isGenerating || isFetchingModels}
                            >
                                <option value="">モデルを選択してください</option>
                                {localApiSelectableModels.map((modelId) => (
                                    <option key={`study-local-api-model-field-${modelId}`} value={modelId}>
                                        {modelId}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <input
                                type="text"
                                className="local-llm-input"
                                value={selectedLocalApiModel}
                                onChange={(event) => setSelectedLocalApiModel(event.target.value)}
                                placeholder={localLlmSettings.defaultModelId || `${matchedLocalApiProvider?.exampleModelId ?? 'qwen3.5:4b'} などのモデル名を入力`}
                                spellCheck={false}
                            />
                        )}
                        <div className="study-question-chat-actions">
                            <button
                                type="button"
                                className="nav-btn"
                                onClick={handleClearChat}
                                disabled={messages.length === 0 || isGenerating}
                            >
                                <Trash2 size={16} />
                                この問題の会話をクリア
                            </button>
                        </div>
                        <div className="study-question-chat-examples">
                            {LOCAL_API_PROVIDER_PRESETS.map((preset) => (
                                <span key={preset.id} className="local-llm-info-chip">
                                    {preset.label}: {preset.baseUrl}
                                </span>
                            ))}
                        </div>
                    </>
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
            </div>

            <div className="study-question-chat-panel-body">
                <div
                    ref={threadRef}
                    className="local-llm-thread study-question-chat-thread"
                    onScroll={handleThreadScroll}
                >
                    {messages.length === 0 ? (
                        <div className="local-llm-thread-empty">
                            <Bot size={26} />
                            <p>
                                {showAnswer
                                    ? 'この問題の解説や考え方について質問できます。'
                                    : 'この問題のヒントや考え方について質問できます。答えは直接返しません。'}
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
                            ? (isModelReady ? 'この問題について質問してください' : '先にモデルを読み込んでください')
                            : (selectedModel.length > 0 ? 'この問題について質問してください' : '先にモデルを選択または入力してください')}
                        rows={4}
                        disabled={(activeMode === 'webllm' ? !isModelReady : selectedModel.length === 0) || isGenerating || questionId === null}
                    />
                    <div className="local-llm-composer-toolbar">
                        {showThinkingToggle ? (
                            <button
                                type="button"
                                className={`local-llm-thinking-toggle ${isThinkingEnabled ? 'active' : ''}`}
                                onClick={() => setIsThinkingEnabled((previous) => !previous)}
                                disabled={isGenerating}
                                aria-pressed={isThinkingEnabled}
                            >
                                <Brain size={15} />
                                Thinking {isThinkingEnabled ? 'ON' : 'OFF'}
                            </button>
                        ) : (
                            <span />
                        )}
                        <div className="study-question-chat-composer-actions">
                            <button
                                type="button"
                                className="nav-btn"
                                onClick={handleClearChat}
                                disabled={messages.length === 0 || isGenerating}
                            >
                                <Trash2 size={16} />
                                クリア
                            </button>
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
                </div>
            </div>
        </div>
    );
};
