import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bot, Clock3, Cpu, Download, LoaderCircle, Plus, Send, ShieldCheck, Trash2 } from 'lucide-react';
import type { ChatCompletionChunk, ChatCompletionMessageParam, InitProgressReport } from '@mlc-ai/web-llm';
import { BackButton } from './BackButton';
import type { LocalLlmMode, LocalLlmSettings } from '../utils/settings';
import {
    ensureLocalLlmEngine,
    getLocalLlmGpuVendor,
    getLocalLlmSupport,
    hasLoadedLocalLlmEngine,
    interruptLocalLlmGeneration,
    LOCAL_LLM_MODEL_ID,
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
}

const LOCAL_API_EXAMPLES = [
    'LM Studio: http://localhost:1234/v1',
    'vLLM / SGLang: http://localhost:8000/v1',
    'Ollama(OpenAI互換): http://localhost:11434/v1',
] as const;

const getErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return 'ローカルLLMの処理に失敗しました。';
};

const toWebLlmMessages = (messages: LocalChatMessage[]): ChatCompletionMessageParam[] => {
    return messages.map((message) => ({
        role: message.role,
        content: message.content,
    }));
};

const toOpenAiMessages = (messages: LocalChatMessage[]): OpenAiCompatibleMessage[] => {
    return messages.map((message) => ({
        role: message.role,
        content: message.content,
    }));
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
    fallbackLocalModelId: string
): StoredLocalLlmChatSession => {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        title: '新しいチャット',
        mode,
        modelId: mode === 'webllm' ? LOCAL_LLM_MODEL_ID : fallbackLocalModelId.trim(),
        messages: [],
        createdAt: now,
        updatedAt: now,
    };
};

export const LocalLlmChat: React.FC<LocalLlmChatProps> = ({
    onBack,
    localLlmSettings,
    onLocalLlmModeChange,
}) => {
    const webllmSupport = useMemo(() => getLocalLlmSupport(), []);
    const initialSessionsRef = useRef<StoredLocalLlmChatSession[] | null>(null);
    if (initialSessionsRef.current === null && typeof window !== 'undefined') {
        initialSessionsRef.current = loadLocalLlmChatSessions();
    }

    const initialSessions = initialSessionsRef.current ?? [];
    const initialSession = initialSessions[0] ?? buildEmptySession(localLlmSettings.preferredMode, localLlmSettings.defaultModelId);

    const [chatSessions, setChatSessions] = useState<StoredLocalLlmChatSession[]>(initialSessions.length > 0 ? initialSessions : [initialSession]);
    const [currentSessionId, setCurrentSessionId] = useState(initialSession.id);
    const [messages, setMessages] = useState<LocalChatMessage[]>(() => toViewMessages(initialSession.messages));
    const [input, setInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loadProgress, setLoadProgress] = useState<InitProgressReport | null>(null);
    const [isModelLoading, setIsModelLoading] = useState(false);
    const [isModelReady, setIsModelReady] = useState(() => hasLoadedLocalLlmEngine());
    const [isGenerating, setIsGenerating] = useState(false);
    const [gpuVendor, setGpuVendor] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [selectedLocalApiModel, setSelectedLocalApiModel] = useState(() => (
        initialSession.mode === 'openai-local'
            ? initialSession.modelId || localLlmSettings.defaultModelId
            : localLlmSettings.defaultModelId
    ));
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [localApiFetchError, setLocalApiFetchError] = useState<string | null>(null);
    const [hasLoadedModelList, setHasLoadedModelList] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const mountedRef = useRef(true);
    const requestIdRef = useRef(0);
    const localApiModelListAbortRef = useRef<AbortController | null>(null);
    const localApiChatAbortRef = useRef<AbortController | null>(null);
    const previousModeRef = useRef<LocalLlmMode>(localLlmSettings.preferredMode);
    const modeChangeReasonRef = useRef<'session-load' | null>(null);

    const activeMode = localLlmSettings.preferredMode;
    const selectedModel = activeMode === 'webllm'
        ? LOCAL_LLM_MODEL_ID
        : selectedLocalApiModel.trim();
    const canSend = input.trim().length > 0
        && !isGenerating
        && (activeMode === 'webllm' ? isModelReady : selectedModel.length > 0);

    const invalidateActiveRequest = useCallback(() => {
        requestIdRef.current += 1;
    }, []);

    const resetViewState = useCallback(() => {
        setInput('');
        setError(null);
        setLoadProgress(null);
        setLocalApiFetchError(null);
        setHasLoadedModelList(false);
        setAvailableModels([]);
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

    const createFreshSession = useCallback((mode: LocalLlmMode) => {
        const nextSession = buildEmptySession(mode, localLlmSettings.defaultModelId);
        setChatSessions((previous) => sortLocalLlmChatSessions([nextSession, ...previous.filter((session) => session.id !== nextSession.id)]));
        setCurrentSessionId(nextSession.id);
        setMessages([]);
        setSelectedLocalApiModel(mode === 'openai-local' ? nextSession.modelId : localLlmSettings.defaultModelId);
        resetViewState();
    }, [localLlmSettings.defaultModelId, resetViewState]);

    const handleModeChange = useCallback((nextMode: LocalLlmMode) => {
        if (nextMode === activeMode) {
            return;
        }
        onLocalLlmModeChange(nextMode);
    }, [activeMode, onLocalLlmModeChange]);

    const handleSelectSession = useCallback((sessionId: string) => {
        const targetSession = chatSessions.find((session) => session.id === sessionId);
        if (!targetSession || targetSession.id === currentSessionId) {
            return;
        }

        cancelActiveWork();
        modeChangeReasonRef.current = targetSession.mode !== activeMode ? 'session-load' : null;
        setCurrentSessionId(targetSession.id);
        setMessages(toViewMessages(targetSession.messages));
        setSelectedLocalApiModel(
            targetSession.mode === 'openai-local'
                ? (targetSession.modelId || localLlmSettings.defaultModelId)
                : localLlmSettings.defaultModelId
        );
        resetViewState();

        if (targetSession.mode !== activeMode) {
            onLocalLlmModeChange(targetSession.mode);
        }
    }, [activeMode, cancelActiveWork, chatSessions, currentSessionId, localLlmSettings.defaultModelId, onLocalLlmModeChange, resetViewState]);

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

    useEffect(() => {
        mountedRef.current = true;

        if (initialSession.mode !== localLlmSettings.preferredMode) {
            modeChangeReasonRef.current = 'session-load';
            onLocalLlmModeChange(initialSession.mode);
        }

        return () => {
            mountedRef.current = false;
            cancelActiveWork();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, loadProgress]);

    useEffect(() => {
        saveLocalLlmChatSessions(chatSessions);
    }, [chatSessions]);

    useEffect(() => {
        if (!isModelReady) {
            return;
        }

        void (async () => {
            const vendor = await getLocalLlmGpuVendor();
            if (mountedRef.current) {
                setGpuVendor(vendor);
            }
        })();
    }, [isModelReady]);

    useEffect(() => {
        if (previousModeRef.current === activeMode) {
            return;
        }

        previousModeRef.current = activeMode;
        cancelActiveWork();

        if (modeChangeReasonRef.current === 'session-load') {
            modeChangeReasonRef.current = null;
            return;
        }

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
        setHasLoadedModelList(false);
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
        const nextSession: StoredLocalLlmChatSession = {
            id: currentSessionId,
            title: buildSessionTitle(storedMessages),
            mode: activeMode,
            modelId: activeMode === 'webllm' ? LOCAL_LLM_MODEL_ID : selectedModel,
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
    }, [activeMode, chatSessions, currentSessionId, messages, selectedModel]);

    const handleLoadModel = useCallback(async () => {
        if (!webllmSupport.supported || isModelLoading || isModelReady) {
            return;
        }

        setError(null);
        setIsModelLoading(true);
        setLoadProgress(null);

        try {
            await ensureLocalLlmEngine((report) => {
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
    }, [isModelLoading, isModelReady, webllmSupport.supported]);

    const handleClearChat = useCallback(() => {
        if (isGenerating) {
            return;
        }
        setMessages([]);
        resetViewState();
    }, [isGenerating, resetViewState]);

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

        setError(null);
        setInput('');
        setIsGenerating(true);
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
                const engine = await ensureLocalLlmEngine();
                const stream = await engine.chat.completions.create({
                    messages: toWebLlmMessages([...messages, userMessage]),
                    stream: true,
                });

                for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
                    const delta = chunk.choices[0]?.delta?.content;
                    if (typeof delta !== 'string' || delta.length === 0) {
                        continue;
                    }
                    assistantText += delta;
                    updateAssistantText(assistantText);
                }

                if (assistantText.length === 0) {
                    assistantText = await engine.getMessage();
                }
            } else {
                const controller = new AbortController();
                localApiChatAbortRef.current = controller;

                const finalText = await streamOpenAiCompatibleChat({
                    baseUrl: localLlmSettings.baseUrl,
                    model: selectedModel,
                    messages: toOpenAiMessages([...messages, userMessage]),
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
        } catch (generationError) {
            if (generationError instanceof DOMException && generationError.name === 'AbortError') {
                return;
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
        input,
        isGenerating,
        isModelReady,
        localLlmSettings.baseUrl,
        messages,
        selectedModel,
    ]);

    const handleTextareaKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
                        外出先向けの WebLLM と、PC 上の OpenAI互換ローカルAPI を同じ画面で切り替えて試せる簡易チャットです。
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
                            <button
                                key={session.id}
                                type="button"
                                className={`local-llm-session-item ${session.id === currentSessionId ? 'active' : ''}`}
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
                        ))}
                    </div>
                </aside>

                <div className="local-llm-main">
                    <section className="local-llm-card">
                        <div className="local-llm-card-head">
                            <div>
                                <h2>実行モード</h2>
                                <p>設定サイドバーの「ローカルLLM設定」と同期しながら、推論の実行先を切り替えられます。</p>
                            </div>
                            <span className={`local-llm-status-chip ${activeMode === 'webllm' ? (webllmSupport.supported ? 'is-ready' : 'is-error') : 'is-muted'}`}>
                                {activeMode === 'webllm'
                                    ? (webllmSupport.supported ? 'WebLLM 使用中' : 'WebLLM 未対応')
                                    : 'ローカルAPI 使用中'}
                            </span>
                        </div>

                        <div className="local-llm-mode-tabs" role="tablist" aria-label="ローカルLLM実行モード">
                            <button
                                type="button"
                                className={`local-llm-mode-tab ${activeMode === 'webllm' ? 'active' : ''}`}
                                onClick={() => handleModeChange('webllm')}
                                role="tab"
                                aria-selected={activeMode === 'webllm'}
                            >
                                WebLLM
                            </button>
                            <button
                                type="button"
                                className={`local-llm-mode-tab ${activeMode === 'openai-local' ? 'active' : ''}`}
                                onClick={() => handleModeChange('openai-local')}
                                role="tab"
                                aria-selected={activeMode === 'openai-local'}
                            >
                                OpenAI互換ローカルAPI
                            </button>
                        </div>

                        <div className="local-llm-status-row">
                            {activeMode === 'webllm' ? (
                                <>
                                    <span className="local-llm-info-chip"><Cpu size={14} /> WebLLM + WebGPU</span>
                                    <span className="local-llm-info-chip"><Bot size={14} /> 現在のモデル: {LOCAL_LLM_MODEL_ID}</span>
                                    <span className="local-llm-info-chip"><ShieldCheck size={14} /> 動作確認対象: PC Chrome / Edge</span>
                                    {gpuVendor && (
                                        <span className="local-llm-info-chip">{`GPU Vendor: ${gpuVendor}`}</span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <span className="local-llm-info-chip"><Bot size={14} /> OpenAI互換ローカルAPI</span>
                                    <span className="local-llm-info-chip"><ShieldCheck size={14} /> 接続先: {localLlmSettings.baseUrl}</span>
                                    <span className="local-llm-info-chip"><Bot size={14} /> 現在のモデル: {selectedModel || '未選択'}</span>
                                </>
                            )}
                        </div>

                        {activeMode === 'webllm' ? (
                            <>
                                <p className="local-llm-helper-text">
                                    初回はモデルをブラウザへダウンロードするため、読み込みに時間がかかります。外出先でも、対応ブラウザならサーバーなしで使えます。
                                </p>

                                {!webllmSupport.supported && (
                                    <div className="local-llm-alert is-error">
                                        <AlertTriangle size={18} />
                                        <span>{webllmSupport.reason}</span>
                                    </div>
                                )}

                                <div className="local-llm-actions">
                                    <button
                                        type="button"
                                        className="nav-btn"
                                        onClick={() => { void handleLoadModel(); }}
                                        disabled={!webllmSupport.supported || isModelLoading || isModelReady}
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
                                        会話をクリア
                                    </button>
                                </div>

                                {loadProgress && (
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
                            </>
                        ) : (
                            <>
                                <p className="local-llm-helper-text">
                                    Qwen3.5 などの高品質モデルを使いたい場合は、PC 上で LM Studio / vLLM / SGLang / Ollama の OpenAI互換サーバーを起動して使います。
                                </p>

                                <div className="local-llm-examples">
                                    {LOCAL_API_EXAMPLES.map((example) => (
                                        <span key={example} className="local-llm-info-chip">{example}</span>
                                    ))}
                                </div>

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
                                        <span className="local-llm-field-note">保存されず、この画面を閉じると消えます。</span>
                                    </label>

                                    <label className="local-llm-field">
                                        <span className="local-llm-field-label">モデル</span>
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
                                        <span className="local-llm-field-note">
                                            設定サイドバーの既定モデル名を初期値として使います。`/v1/models` に失敗したときは手入力で送信できます。
                                        </span>
                                    </label>
                                </div>

                                <div className="local-llm-actions">
                                    <button
                                        type="button"
                                        className="nav-btn"
                                        onClick={() => { void handleFetchModels(); }}
                                        disabled={isFetchingModels || localLlmSettings.baseUrl.trim().length === 0}
                                    >
                                        {isFetchingModels ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
                                        モデル一覧を取得
                                    </button>
                                    <button
                                        type="button"
                                        className="nav-btn"
                                        onClick={handleClearChat}
                                        disabled={messages.length === 0 || isGenerating}
                                    >
                                        <Trash2 size={16} />
                                        会話をクリア
                                    </button>
                                </div>

                                {localApiFetchError && (
                                    <div className="local-llm-alert is-error">
                                        <AlertTriangle size={18} />
                                        <span>{localApiFetchError}</span>
                                    </div>
                                )}
                            </>
                        )}

                        {error && (
                            <div className="local-llm-alert is-error">
                                <AlertTriangle size={18} />
                                <span>{error}</span>
                            </div>
                        )}
                    </section>

                    <section className="local-llm-card local-llm-chat-card">
                        <div className="local-llm-card-head">
                            <div>
                                <h2>チャット</h2>
                                <p>
                                    {activeMode === 'webllm'
                                        ? 'モデル読み込み後に質問を送信できます。Shift + Enter で改行、Enter で送信します。'
                                        : 'ローカルAPIの接続先とモデルを確認してから質問を送信できます。Shift + Enter で改行、Enter で送信します。'}
                                </p>
                            </div>
                            <span className={`local-llm-status-chip ${(activeMode === 'webllm' ? isModelReady : selectedModel.length > 0) ? 'is-ready' : 'is-muted'}`}>
                                {activeMode === 'webllm'
                                    ? (isModelReady ? '送信可能' : '未初期化')
                                    : (selectedModel.length > 0 ? '送信可能' : 'モデル未選択')}
                            </span>
                        </div>

                        <div className="local-llm-thread">
                            {messages.length === 0 ? (
                                <div className="local-llm-thread-empty">
                                    <Bot size={28} />
                                    <p>
                                        {activeMode === 'webllm'
                                            ? 'モデルを読み込んだあと、ここに会話が表示されます。'
                                            : 'ローカルAPIへ接続してモデルを決めたあと、ここに会話が表示されます。'}
                                    </p>
                                </div>
                            ) : (
                                messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={`local-llm-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
                                    >
                                        <div className="local-llm-message-role">
                                            {message.role === 'user' ? 'You' : 'Local LLM'}
                                        </div>
                                        <div className={`local-llm-message-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                                            {message.content}
                                            {message.isStreaming && (
                                                <span className="local-llm-streaming-indicator">
                                                    <LoaderCircle size={14} className="spin" />
                                                    生成中
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={bottomRef} />
                        </div>

                        <div className="local-llm-composer">
                            <textarea
                                className="local-llm-textarea"
                                value={input}
                                onChange={(event) => setInput(event.target.value)}
                                onKeyDown={handleTextareaKeyDown}
                                placeholder={activeMode === 'webllm'
                                    ? (isModelReady ? 'ローカルLLMに質問を入力してください' : '先にモデルを読み込んでください')
                                    : (selectedModel.length > 0 ? '接続先のローカルAPIへ質問を入力してください' : '先にモデルを選択または入力してください')}
                                rows={4}
                                disabled={(activeMode === 'webllm' ? !isModelReady : selectedModel.length === 0) || isGenerating}
                            />
                            <div className="local-llm-composer-actions">
                                <button
                                    type="button"
                                    className="nav-btn"
                                    onClick={() => { void handleSend(); }}
                                    disabled={!canSend}
                                >
                                    {isGenerating ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
                                    送信
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
