import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, Download, LoaderCircle, Send, ShieldCheck, Square, Trash2, X } from 'lucide-react';
import type { ChatCompletionChunk, ChatCompletionMessageParam, InitProgressReport } from '@mlc-ai/web-llm';
import type { Question } from '../types';
import type { LocalLlmMode, LocalLlmSettings } from '../utils/settings';
import { MarkdownText } from './MarkdownText';
import {
    DEFAULT_WEB_LLM_MODEL_ID,
    ensureLocalLlmEngine,
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
    onClose: () => void;
}

const LOCAL_API_EXAMPLES = [
    'LM Studio: http://localhost:1234/v1',
    'vLLM / SGLang: http://localhost:8000/v1',
    'Ollama(OpenAI互換): http://localhost:11434/v1',
] as const;

const WEB_LLM_PROMPT_MESSAGE_LIMIT = 10;
const WEB_LLM_LENGTH_WARNING = 'WebLLM の文脈長または出力上限に達したため、ここで応答を打ち切りました。必要なら続けて質問してください。';

type ParsedAssistantMessage = {
    thinkContent: string | null;
    answerContent: string;
};

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return 'ローカルLLMの処理に失敗しました。';
};

function parseAssistantMessageContent(content: string): ParsedAssistantMessage {
    const thinkStart = content.indexOf('<think>');
    if (thinkStart === -1) {
        return {
            thinkContent: null,
            answerContent: content,
        };
    }

    const thinkTagLength = '<think>'.length;
    const thinkEnd = content.indexOf('</think>', thinkStart + thinkTagLength);
    const leadingContent = content.slice(0, thinkStart).trim();

    if (thinkEnd === -1) {
        return {
            thinkContent: content.slice(thinkStart + thinkTagLength).trim(),
            answerContent: leadingContent,
        };
    }

    const trailingContent = content.slice(thinkEnd + '</think>'.length).trim();
    const answerContent = [leadingContent, trailingContent]
        .filter((segment) => segment.length > 0)
        .join('\n\n');

    return {
        thinkContent: content.slice(thinkStart + thinkTagLength, thinkEnd).trim(),
        answerContent,
    };
}

const toPromptMessageContent = (message: LocalChatMessage) => {
    if (message.role !== 'assistant') {
        return message.content;
    }

    return parseAssistantMessageContent(message.content).answerContent.trim();
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

const buildQuestionContextPrompt = (question: Question, questionIndex: number, showAnswer: boolean) => {
    const questionType = question.questionType === 'memorization' ? 'memorization' : 'quiz';
    const parts: string[] = [
        'あなたは学習中のユーザーを支援する日本語の問題解説アシスタントです。',
        `現在扱っているのは統合セットの問題${questionIndex + 1}です。`,
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

const toOpenAiMessages = (
    messages: LocalChatMessage[],
    systemPrompt: string
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
    onClose,
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
    const [apiKey, setApiKey] = useState('');
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [selectedLocalApiModel, setSelectedLocalApiModel] = useState(() => (
        initialSession?.mode === 'openai-local'
            ? (initialSession.modelId || localLlmSettings.defaultModelId)
            : localLlmSettings.defaultModelId
    ));
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [localApiFetchError, setLocalApiFetchError] = useState<string | null>(null);
    const [hasLoadedModelList, setHasLoadedModelList] = useState(false);
    const threadRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(true);
    const requestIdRef = useRef(0);
    const shouldAutoScrollRef = useRef(true);
    const isComposingRef = useRef(false);
    const localApiModelListAbortRef = useRef<AbortController | null>(null);
    const localApiChatAbortRef = useRef<AbortController | null>(null);

    const activeMode = localLlmSettings.preferredMode;
    const selectedWebLlmModel = localLlmSettings.webllmModelId || DEFAULT_WEB_LLM_MODEL_ID;
    const selectedModel = activeMode === 'webllm'
        ? selectedWebLlmModel
        : selectedLocalApiModel.trim();
    const canSend = input.trim().length > 0
        && !isGenerating
        && questionId !== null
        && (activeMode === 'webllm' ? isModelReady : selectedModel.length > 0);
    const questionContextPrompt = useMemo(() => {
        return buildQuestionContextPrompt(question, questionIndex, showAnswer);
    }, [question, questionIndex, showAnswer]);
    const combinedWebLlmSystemPrompt = useMemo(() => {
        return [localLlmSettings.webllmSystemPrompt.trim(), questionContextPrompt]
            .filter((segment) => segment.length > 0)
            .join('\n\n');
    }, [localLlmSettings.webllmSystemPrompt, questionContextPrompt]);

    const invalidateActiveRequest = useCallback(() => {
        requestIdRef.current += 1;
    }, []);

    const resetTransientState = useCallback(() => {
        setInput('');
        setError(null);
        setLocalApiFetchError(null);
        setHasLoadedModelList(false);
        setAvailableModels([]);
    }, []);

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
    }, [invalidateActiveRequest]);

    useEffect(() => {
        storedSessionsRef.current = storedSessions;
    }, [storedSessions]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            cancelActiveWork();
        };
    }, [cancelActiveWork]);

    useEffect(() => {
        saveStudyQuestionChatSessions(storedSessions);
    }, [storedSessions]);

    useEffect(() => {
        setIsModelReady(hasLoadedLocalLlmEngine(selectedWebLlmModel));
        setLoadProgress(null);
    }, [selectedWebLlmModel]);

    useEffect(() => {
        cancelActiveWork();
        resetTransientState();
        shouldAutoScrollRef.current = true;

        if (questionId === null) {
            setMessages([]);
            setSelectedLocalApiModel(localLlmSettings.defaultModelId);
            return;
        }

        const session = findStudyQuestionChatSession(storedSessionsRef.current, quizSetId, questionId);
        setMessages(session ? toViewMessages(session.messages) : []);
        setSelectedLocalApiModel(
            session?.mode === 'openai-local'
                ? (session.modelId || localLlmSettings.defaultModelId)
                : localLlmSettings.defaultModelId
        );
    }, [cancelActiveWork, localLlmSettings.defaultModelId, questionId, quizSetId, resetTransientState]);

    useEffect(() => {
        if (activeMode !== 'openai-local') {
            return;
        }

        setSelectedLocalApiModel((previous) => previous.trim().length > 0 ? previous : localLlmSettings.defaultModelId);
    }, [activeMode, localLlmSettings.defaultModelId]);

    useEffect(() => {
        setAvailableModels([]);
        setHasLoadedModelList(false);
        setLocalApiFetchError(null);
    }, [activeMode, localLlmSettings.baseUrl]);

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
        if (isModelLoading || isModelReady) {
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
    }, [isModelLoading, isModelReady, selectedWebLlmModel]);

    const handleFetchModels = useCallback(async () => {
        if (activeMode !== 'openai-local' || isFetchingModels || localLlmSettings.baseUrl.trim().length === 0) {
            return;
        }

        localApiModelListAbortRef.current?.abort();
        const controller = new AbortController();
        localApiModelListAbortRef.current = controller;

        setError(null);
        setLocalApiFetchError(null);
        setIsFetchingModels(true);
        setHasLoadedModelList(false);
        setAvailableModels([]);

        try {
            const modelIds = await fetchOpenAiCompatibleModelIds(
                localLlmSettings.baseUrl,
                apiKey.trim() || undefined,
                controller.signal
            );

            if (!mountedRef.current || localApiModelListAbortRef.current !== controller) {
                return;
            }

            setAvailableModels(modelIds);
            setHasLoadedModelList(true);
            setSelectedLocalApiModel((previous) => {
                if (selectedModel.length > 0 && modelIds.includes(selectedModel)) {
                    return selectedModel;
                }
                const preferredModel = localLlmSettings.defaultModelId.trim();
                if (preferredModel.length > 0 && modelIds.includes(preferredModel)) {
                    return preferredModel;
                }
                if (previous.trim().length > 0 && modelIds.includes(previous.trim())) {
                    return previous.trim();
                }
                if (modelIds.length === 1) {
                    return modelIds[0];
                }
                return '';
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
    }, [activeMode, apiKey, isFetchingModels, localLlmSettings.baseUrl, localLlmSettings.defaultModelId, selectedModel]);

    const handleSend = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || isGenerating || questionId === null) {
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
        let webllmFinishReason: string | null = null;

        setError(null);
        setInput('');
        setIsGenerating(true);
        shouldAutoScrollRef.current = true;
        setMessages((previous) => [...previous, userMessage, pendingAssistantMessage]);

        const updateAssistantText = (nextText: string) => {
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
                const stream = await engine.chat.completions.create({
                    messages: toWebLlmMessages([...messages, userMessage], combinedWebLlmSystemPrompt),
                    stream: true,
                    temperature: localLlmSettings.webllmTemperature,
                    top_p: localLlmSettings.webllmTopP,
                    max_tokens: localLlmSettings.webllmMaxTokens,
                    presence_penalty: localLlmSettings.webllmPresencePenalty,
                    extra_body: {
                        enable_thinking: localLlmSettings.webllmEnableThinking,
                    },
                });

                for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
                    const choice = chunk.choices[0];
                    if (choice?.finish_reason) {
                        webllmFinishReason = choice.finish_reason;
                    }

                    const delta = choice?.delta?.content;
                    if (typeof delta !== 'string' || delta.length === 0) {
                        continue;
                    }

                    assistantText += delta;
                    updateAssistantText(assistantText);
                }

                if (assistantText.length === 0) {
                    assistantText = await engine.getMessage();
                }

                if (webllmFinishReason === 'length') {
                    await resetLocalLlmChat(selectedWebLlmModel).catch(() => undefined);
                }
            } else {
                const controller = new AbortController();
                localApiChatAbortRef.current = controller;

                const finalText = await streamOpenAiCompatibleChat({
                    baseUrl: localLlmSettings.baseUrl,
                    model: selectedModel,
                    messages: toOpenAiMessages([...messages, userMessage], questionContextPrompt),
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
            if (webllmFinishReason === 'length' && mountedRef.current && requestIdRef.current === requestId) {
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
            }
        }
    }, [
        activeMode,
        apiKey,
        combinedWebLlmSystemPrompt,
        input,
        isGenerating,
        isModelReady,
        localLlmSettings.baseUrl,
        localLlmSettings.webllmEnableThinking,
        localLlmSettings.webllmMaxTokens,
        localLlmSettings.webllmPresencePenalty,
        localLlmSettings.webllmTemperature,
        localLlmSettings.webllmTopP,
        messages,
        questionContextPrompt,
        questionId,
        selectedModel,
        selectedWebLlmModel,
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

    const questionTypeLabel = question.questionType === 'memorization' ? '暗記問題' : '選択問題';

    return (
        <div className="study-question-chat-panel">
            <div className="study-question-chat-panel-header">
                <div className="study-question-chat-panel-head">
                    <div>
                        <h2>AIチャット</h2>
                        <p>問題{questionIndex + 1}について質問できます。{showAnswer ? '解答後なので解説込みで質問できます。' : '解答前なのでヒント中心で応答します。'}</p>
                    </div>
                    <div className="study-question-chat-head-actions">
                        <span className={`local-llm-status-chip ${(activeMode === 'webllm' ? isModelReady : selectedModel.length > 0) ? 'is-ready' : 'is-muted'}`}>
                            {activeMode === 'webllm'
                                ? (isModelReady ? '送信可能' : '未初期化')
                                : (selectedModel.length > 0 ? '送信可能' : 'モデル未選択')}
                        </span>
                        <button
                            type="button"
                            className="menu-btn right-panel-close-btn"
                            onClick={onClose}
                            aria-label="AIチャットを閉じる"
                            title="閉じる"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="study-question-chat-meta">
                    <span className="local-llm-info-chip"><Bot size={14} /> {questionTypeLabel}</span>
                    <span className="local-llm-info-chip"><ShieldCheck size={14} /> {showAnswer ? '解答後' : '解答前'}</span>
                    <span className="local-llm-info-chip"><Bot size={14} /> 現在のモデル: {selectedModel || '未選択'}</span>
                </div>

                <div className="local-llm-mode-tabs" role="tablist" aria-label="問題チャットの実行モード">
                    <button
                        type="button"
                        className={`local-llm-mode-tab ${activeMode === 'webllm' ? 'active' : ''}`}
                        onClick={() => onLocalLlmModeChange('webllm')}
                        role="tab"
                        aria-selected={activeMode === 'webllm'}
                    >
                        WebLLM
                    </button>
                    <button
                        type="button"
                        className={`local-llm-mode-tab ${activeMode === 'openai-local' ? 'active' : ''}`}
                        onClick={() => onLocalLlmModeChange('openai-local')}
                        role="tab"
                        aria-selected={activeMode === 'openai-local'}
                    >
                        OpenAI互換ローカルAPI
                    </button>
                </div>

                {activeMode === 'webllm' ? (
                    <>
                        <div className="study-question-chat-field-row">
                            <select
                                className="local-llm-input"
                                value={selectedWebLlmModel}
                                onChange={(event) => onWebLlmModelChange(event.target.value)}
                                disabled={isGenerating || isModelLoading}
                            >
                                {WEB_LLM_QWEN_MODEL_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="study-question-chat-actions">
                            <button
                                type="button"
                                className="nav-btn"
                                onClick={() => { void handleLoadModel(); }}
                                disabled={isModelLoading || isModelReady}
                            >
                                {isModelLoading ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
                                {isModelReady ? 'モデル読み込み済み' : 'モデルを読み込む'}
                            </button>
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
                    </>
                ) : (
                    <>
                        <div className="study-question-chat-field-row">
                            {hasLoadedModelList && availableModels.length > 0 ? (
                                <select
                                    className="local-llm-input"
                                    value={selectedModel}
                                    onChange={(event) => setSelectedLocalApiModel(event.target.value)}
                                >
                                    <option value="">モデルを選択してください</option>
                                    {availableModels.map((modelId) => (
                                        <option key={modelId} value={modelId}>{modelId}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    className="local-llm-input"
                                    value={selectedLocalApiModel}
                                    onChange={(event) => setSelectedLocalApiModel(event.target.value)}
                                    placeholder={localLlmSettings.defaultModelId || 'Qwen3.5 などのモデル名を入力'}
                                    spellCheck={false}
                                />
                            )}
                            <button
                                type="button"
                                className="nav-btn"
                                onClick={() => { void handleFetchModels(); }}
                                disabled={isFetchingModels || localLlmSettings.baseUrl.trim().length === 0}
                            >
                                {isFetchingModels ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
                                一覧取得
                            </button>
                        </div>
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

                {localApiFetchError && (
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
                            const parsedAssistantMessage = message.role === 'assistant'
                                ? parseAssistantMessageContent(message.content)
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
                                                {parsedAssistantMessage?.thinkContent && (
                                                    <details
                                                        className="local-llm-think-block"
                                                        open={message.isStreaming ? true : undefined}
                                                    >
                                                        <summary className="local-llm-think-summary">
                                                            {message.isStreaming ? '思考中...' : '思考過程を表示'}
                                                        </summary>
                                                        <div className="local-llm-think-body">
                                                            <MarkdownText
                                                                content={parsedAssistantMessage.thinkContent}
                                                                className="local-llm-markdown local-llm-think-markdown"
                                                            />
                                                        </div>
                                                    </details>
                                                )}
                                                {parsedAssistantMessage?.answerContent.trim().length
                                                    ? (
                                                        <MarkdownText
                                                            content={parsedAssistantMessage.answerContent}
                                                            className="local-llm-markdown"
                                                        />
                                                    )
                                                    : null}
                                            </div>
                                        ) : (
                                            <div className="local-llm-plain-text">{message.content}</div>
                                        )}
                                        {message.isStreaming && (
                                            <span className="local-llm-streaming-indicator">
                                                <LoaderCircle size={14} className="spin" />
                                                生成中
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
