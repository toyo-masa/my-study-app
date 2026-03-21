import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, Check, Copy, LoaderCircle, Send, Square, Trash2 } from 'lucide-react';
import type { ChatCompletionMessageParam, InitProgressReport } from '@mlc-ai/web-llm';
import type { Question } from '../types';
import type { LocalLlmMode, LocalLlmSettings } from '../utils/settings';
import { WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS } from '../utils/settings';
import { MarkdownText } from './MarkdownText';
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
import type { StoredLocalLlmChatMessage } from '../utils/localLlmChatHistory';
import {
    findStudyQuestionChatSession,
    loadStudyQuestionChatSessions,
    saveStudyQuestionChatSessions,
    type StoredStudyQuestionChatSession,
} from '../utils/studyQuestionChatHistory';
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

interface StudyQuestionChatPanelProps {
    quizSetId: number;
    question: Question;
    questionIndex: number;
    showAnswer: boolean;
    localLlmSettings: LocalLlmSettings;
    onLocalLlmModeChange: (preferredMode: LocalLlmMode) => void;
    onWebLlmModelChange: (modelId: string) => void;
}

const LOCAL_API_EXAMPLES = [
    'LM Studio: http://localhost:1234/v1',
    'vLLM / SGLang: http://localhost:8000/v1',
    'Ollama(OpenAI互換): http://localhost:11434/v1',
] as const;

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
    const [apiKey, setApiKey] = useState('');
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [selectedLocalApiModel, setSelectedLocalApiModel] = useState(() => (
        initialSession?.mode === 'openai-local'
            ? (initialSession.modelId || localLlmSettings.defaultModelId)
            : localLlmSettings.defaultModelId
    ));
    const [lastRequestPayload, setLastRequestPayload] = useState<string | null>(null);
    const [didCopyRequestPayload, setDidCopyRequestPayload] = useState(false);
    const [copiedAnswerMessageId, setCopiedAnswerMessageId] = useState<string | null>(null);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [localApiFetchError, setLocalApiFetchError] = useState<string | null>(null);
    const threadRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(true);
    const requestIdRef = useRef(0);
    const shouldAutoScrollRef = useRef(true);
    const isComposingRef = useRef(false);
    const localApiModelListAbortRef = useRef<AbortController | null>(null);
    const localApiChatAbortRef = useRef<AbortController | null>(null);
    const autoLoadWebLlmKeyRef = useRef<string | null>(null);
    const copyRequestResetTimeoutRef = useRef<number | null>(null);
    const copyAnswerResetTimeoutRef = useRef<number | null>(null);

    const webllmSupport = useMemo(() => getLocalLlmSupport(), []);
    const activeMode = localLlmSettings.preferredMode;
    const selectedWebLlmModel = localLlmSettings.webllmModelId || DEFAULT_WEB_LLM_MODEL_ID;
    const webllmFirstPassTemperature = localLlmSettings.webllmFirstPassTemperature;
    const webllmFirstPassTopP = localLlmSettings.webllmFirstPassTopP;
    const webllmFirstPassThinkingBudget = localLlmSettings.webllmFirstPassThinkingBudget;
    const webllmSecondPassFinalAnswerMaxTokens = localLlmSettings.webllmSecondPassFinalAnswerMaxTokens;
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
        : (selectedLocalApiModel.trim().length > 0 ? `openai-local:${selectedLocalApiModel.trim()}` : '');
    const canSend = input.trim().length > 0
        && !isGenerating
        && questionId !== null
        && (activeMode === 'webllm' ? isModelReady : selectedModel.length > 0);
    const questionContextUserPrompt = useMemo(() => {
        return buildQuestionContextUserPrompt(question, questionIndex, showAnswer);
    }, [question, questionIndex, showAnswer]);
    const webllmSystemPrompt = useMemo(() => {
        return localLlmSettings.webllmSystemPrompt.trim();
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

    const resetCopiedAnswerState = useCallback(() => {
        if (copyAnswerResetTimeoutRef.current !== null) {
            window.clearTimeout(copyAnswerResetTimeoutRef.current);
            copyAnswerResetTimeoutRef.current = null;
        }
        setCopiedAnswerMessageId(null);
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
            cancelActiveWork();
        };
    }, [cancelActiveWork]);

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
        if (hasRestoredMessages) {
            window.requestAnimationFrame(() => {
                threadRef.current?.scrollTo({
                    top: 0,
                    behavior: 'auto',
                });
            });
        }
        if (session?.mode === 'webllm') {
            onLocalLlmModeChange('webllm');
            if (
                session.modelId
                && WEB_LLM_QWEN_MODEL_OPTIONS.some((option) => option.value === session.modelId)
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
        resetCopiedAnswerState();
    }, [
        cancelActiveWork,
        localLlmSettings.defaultModelId,
        onLocalLlmModeChange,
        onWebLlmModelChange,
        questionId,
        quizSetId,
        resetCopiedAnswerState,
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
        if (localLlmSettings.baseUrl.trim().length === 0) {
            return;
        }

        void handleFetchModels();
    }, [handleFetchModels, localLlmSettings.baseUrl]);

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

        setError(null);
        setInput('');
        setIsGenerating(true);
        setWebllmGenerationPhase(null);
        shouldAutoScrollRef.current = true;
        setMessages((previous) => [...previous, userMessage, pendingAssistantMessage]);

        const updateAssistantText = (nextText: string) => {
            assistantText = nextText;
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

        const finalizeAssistantText = (finalText: string) => {
            if (!mountedRef.current || requestIdRef.current !== requestId) {
                return;
            }

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
                    enableThinking: localLlmSettings.webllmEnableThinking,
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
        }
    }, [
        activeMode,
        apiKey,
        input,
        isGenerating,
        isModelReady,
        localLlmSettings.baseUrl,
        localLlmSettings.webllmEnableThinking,
        webllmFirstPassTemperature,
        webllmFirstPassTopP,
        localLlmSettings.webllmFirstPassPresencePenalty,
        localLlmSettings.webllmSecondPassPresencePenalty,
        localLlmSettings.webllmSecondPassTemperature,
        localLlmSettings.webllmSecondPassTopP,
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
    }, [activeMode, finalizeStreamingMessages, invalidateActiveRequest, isGenerating, selectedWebLlmModel]);

    const handleClearChat = useCallback(() => {
        if (isGenerating) {
            return;
        }

        setMessages([]);
        setInput('');
        setError(null);
    }, [isGenerating]);

    const handleModelOptionChange = useCallback((value: string) => {
        if (value.startsWith('webllm:')) {
            const modelId = value.slice('webllm:'.length);
            onLocalLlmModeChange('webllm');
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
                onWebLlmModelChange(modelId);
            }
            return;
        }

        if (value.startsWith('openai-local:')) {
            const modelId = value.slice('openai-local:'.length).trim();
            onLocalLlmModeChange('openai-local');
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
            setSelectedLocalApiModel(modelId);
        }
    }, [onLocalLlmModeChange, onWebLlmModelChange, questionId, quizSetId]);

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
                        <optgroup label="WebLLM">
                            {WEB_LLM_QWEN_MODEL_OPTIONS.map((option) => (
                                <option key={option.value} value={`webllm:${option.value}`}>
                                    {option.label}
                                </option>
                            ))}
                        </optgroup>
                        {localApiSelectableModels.length > 0 && (
                            <optgroup label="ローカルAPI">
                                {localApiSelectableModels.map((modelId) => (
                                    <option key={modelId} value={`openai-local:${modelId}`}>
                                        {modelId}
                                    </option>
                                ))}
                            </optgroup>
                        )}
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
                        <input
                            type="password"
                            className="local-llm-input"
                            value={apiKey}
                            onChange={(event) => setApiKey(event.target.value)}
                            placeholder="必要なときだけ APIキー を入力"
                            autoComplete="off"
                            spellCheck={false}
                        />
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
                            {LOCAL_API_EXAMPLES.map((example) => (
                                <span key={example} className="local-llm-info-chip">{example}</span>
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
                                                                    {message.isStreaming ? (
                                                                        <div className="local-llm-streaming-text local-llm-think-markdown">
                                                                            {segment.content}
                                                                        </div>
                                                                    ) : (
                                                                        <MarkdownText
                                                                            content={segment.content}
                                                                            className="local-llm-markdown local-llm-think-markdown"
                                                                        />
                                                                    )}
                                                                </div>
                                                            </details>
                                                        )
                                                        : (
                                                            message.isStreaming ? (
                                                                <div
                                                                    key={`${message.id}-answer-${index}`}
                                                                    className="local-llm-streaming-text"
                                                                >
                                                                    {segment.content}
                                                                </div>
                                                            ) : (
                                                                <MarkdownText
                                                                    key={`${message.id}-answer-${index}`}
                                                                    content={segment.content}
                                                                    className="local-llm-markdown"
                                                                />
                                                            )
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
                            ? (isModelReady ? 'この問題について質問してください' : '先にモデルを読み込んでください')
                            : (selectedModel.length > 0 ? 'この問題について質問してください' : '先にモデルを選択または入力してください')}
                        rows={4}
                        disabled={(activeMode === 'webllm' ? !isModelReady : selectedModel.length === 0) || isGenerating || questionId === null}
                    />
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
    );
};
