import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    ArrowUp,
    Bot,
    Check,
    LoaderCircle,
    Sparkles,
    WandSparkles,
    X,
} from 'lucide-react';
import type { ChatCompletionMessageParam, InitProgressReport } from '@mlc-ai/web-llm';
import { MarkdownText } from './MarkdownText';
import { LocalLlmMessageItem, type LlmRenderableMessage } from './LocalLlmMessageItem';
import { LocalLlmModelPicker, type LocalLlmModelPickerOption } from './LocalLlmModelPicker';
import { LocalLlmParameterPopover } from './LocalLlmParameterPopover';
import {
    DEFAULT_WEB_LLM_MODEL_ID,
    ensureLocalLlmEngine,
    getGroupedWebLlmModelOptions,
    getLocalLlmSupport,
    interruptLocalLlmGeneration,
} from '../utils/localLlmEngine';
import {
    fetchOpenAiCompatibleModelIds,
    getCachedOpenAiCompatibleModelIds,
    streamOpenAiCompatibleChat,
    type OpenAiCompatibleMessage,
} from '../utils/openAiCompatibleLocalApi';
import {
    loadLastLocalApiModelId,
    resolveLocalApiRequestOptions,
    resolveWebLlmModelParameterSettings,
    saveLastLocalApiModelId,
    WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS,
    type LocalLlmMode,
    type LocalLlmSettings,
    type LocalLlmSettingsUpdater,
} from '../utils/settings';
import { findLocalApiProviderByBaseUrl } from '../utils/localApiProviders';
import { buildLocalApiModelOptionList } from '../utils/localApiModelOptions';
import { runWebLlmBudgetedGeneration, type WebLlmGenerationPhase } from '../utils/webLlmBudgetedGeneration';
import { copyTextToClipboard } from '../utils/clipboard';
import { useTemporaryCopiedState } from '../hooks/useTemporaryCopiedState';
import { buildQuestionGenerationSystemPrompt, buildQuestionGenerationUserPrompt } from '../features/questionGeneration/prompt';
import { parseQuestionDraftResponse } from '../features/questionGeneration/parse';
import { findDraftDuplicateCandidates, pickDuplicateReferenceQuestions } from '../features/questionGeneration/duplicateCheck';
import type {
    DuplicateCheckResult,
    QuestionDraftFormValue,
    QuestionGenerationTargetType,
} from '../features/questionGeneration/types';
import type { Question, QuizSetType } from '../types';

type QuestionDraftAiModalProps = {
    isOpen: boolean;
    quizSetName: string;
    quizSetType: QuizSetType | undefined;
    questions: Question[];
    localLlmSettings: LocalLlmSettings;
    onLocalLlmSettingsChange: (settings: LocalLlmSettingsUpdater) => void;
    onLocalLlmModeChange: (preferredMode: LocalLlmMode) => void;
    onWebLlmModelChange: (modelId: string) => void;
    onApplyDraft: (draft: QuestionDraftFormValue) => void;
    onClose: () => void;
};

const toProgressPercent = (progress: InitProgressReport | null) => {
    if (!progress) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
};

const buildDraftSummaryMarkdown = (
    draft: QuestionDraftFormValue,
    duplicateCheck: DuplicateCheckResult
) => {
    const lines = [
        '下書きを生成しました。',
        '',
        `- 種別: ${draft.questionType === 'memorization' ? '暗記カード' : '選択式問題'}`,
        `- カテゴリ: ${draft.category || '未設定'}`,
    ];

    if (draft.questionType === 'quiz') {
        const correctLabels = draft.correctAnswers
            .map((answer) => {
                const optionText = draft.options[answer];
                return optionText ? `${answer + 1}. ${optionText}` : `${answer + 1}`;
            })
            .join(' / ');
        lines.push(`- 正答: ${correctLabels || '未設定'}`);
        lines.push(`- 選択肢数: ${draft.options.length}`);
    }

    if (duplicateCheck.level === 'high') {
        lines.push('- 重複警告: 強め');
    } else if (duplicateCheck.level === 'warning') {
        lines.push('- 重複警告: あり');
    } else {
        lines.push('- 重複警告: なし');
    }

    lines.push('', '下のプレビューで内容を確認してから「フォームへ反映」を押してください。');
    return lines.join('\n');
};

const formatDuplicateScore = (value: number) => `${Math.round(value * 100)}%`;

const buildDuplicateSubtitle = (duplicateCheck: DuplicateCheckResult) => {
    if (duplicateCheck.level === 'high') {
        return '既存問題とかなり近い可能性があります。保存前に必ず確認してください。';
    }
    if (duplicateCheck.level === 'warning') {
        return '近い問題候補があります。表現や論点が重なっていないか確認してください。';
    }
    return '目立つ重複候補は見つかっていません。';
};

const buildOpenAiMessages = (
    systemPrompt: string,
    userPrompt: string
): OpenAiCompatibleMessage[] => {
    return [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ];
};

const buildWebLlmMessages = (
    systemPrompt: string,
    userPrompt: string
): ChatCompletionMessageParam[] => {
    return [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ];
};

const buildTargetTypeLabel = (value: QuestionGenerationTargetType) => (
    value === 'memorization' ? '暗記カード' : '選択式問題'
);

export const QuestionDraftAiModal: React.FC<QuestionDraftAiModalProps> = ({
    isOpen,
    quizSetName,
    quizSetType,
    questions,
    localLlmSettings,
    onLocalLlmSettingsChange,
    onLocalLlmModeChange,
    onWebLlmModelChange,
    onApplyDraft,
    onClose,
}) => {
    const mixedTypeInitialValue = quizSetType === 'memorization' ? 'memorization' : 'quiz';
    const [requestText, setRequestText] = useState('');
    const [messages, setMessages] = useState<LlmRenderableMessage[]>([]);
    const [draft, setDraft] = useState<QuestionDraftFormValue | null>(null);
    const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadProgress, setLoadProgress] = useState<InitProgressReport | null>(null);
    const [isModelLoading, setIsModelLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [webllmGenerationPhase, setWebllmGenerationPhase] = useState<WebLlmGenerationPhase | null>(null);
    const [selectedMixedQuestionType, setSelectedMixedQuestionType] = useState<QuestionGenerationTargetType>(mixedTypeInitialValue);
    const [availableModels, setAvailableModels] = useState<string[]>(() => (
        getCachedOpenAiCompatibleModelIds(localLlmSettings.baseUrl)
    ));
    const [selectedLocalApiModel, setSelectedLocalApiModel] = useState(() => (
        localLlmSettings.defaultModelId || loadLastLocalApiModelId(localLlmSettings.baseUrl)
    ));
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [localApiFetchError, setLocalApiFetchError] = useState<string | null>(null);
    const threadRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const activeAbortRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);
    const shouldAutoScrollRef = useRef(true);
    const mountedRef = useRef(true);
    const isComposingRef = useRef(false);
    const webllmSupport = useMemo(() => getLocalLlmSupport(), []);
    const {
        copiedKey: copiedMessageId,
        markCopied: markMessageCopied,
        clearCopied: clearCopiedMessage,
    } = useTemporaryCopiedState();
    const activeMode = localLlmSettings.preferredMode;
    const selectedWebLlmModel = localLlmSettings.webllmModelId || DEFAULT_WEB_LLM_MODEL_ID;
    const rememberedLocalApiModelId = useMemo(
        () => loadLastLocalApiModelId(localLlmSettings.baseUrl),
        [localLlmSettings.baseUrl]
    );
    const targetQuestionType = quizSetType === 'mixed'
        ? selectedMixedQuestionType
        : quizSetType === 'memorization'
            ? 'memorization'
            : 'quiz';
    const matchedLocalApiProvider = useMemo(
        () => findLocalApiProviderByBaseUrl(localLlmSettings.baseUrl),
        [localLlmSettings.baseUrl]
    );
    const localApiRequestOptions = useMemo(
        () => resolveLocalApiRequestOptions(localLlmSettings, selectedLocalApiModel),
        [localLlmSettings, selectedLocalApiModel]
    );
    const webLlmModelParameters = useMemo(
        () => resolveWebLlmModelParameterSettings(localLlmSettings, selectedWebLlmModel),
        [localLlmSettings, selectedWebLlmModel]
    );
    const localApiSelectableModels = useMemo(() => {
        return buildLocalApiModelOptionList(availableModels, [
            selectedLocalApiModel,
            localLlmSettings.defaultModelId,
            rememberedLocalApiModelId,
        ]);
    }, [availableModels, localLlmSettings.defaultModelId, rememberedLocalApiModelId, selectedLocalApiModel]);
    const selectedLocalApiModelOptionValue = localApiSelectableModels.includes(selectedLocalApiModel.trim())
        ? selectedLocalApiModel.trim()
        : '';
    const selectedModel = activeMode === 'webllm'
        ? selectedWebLlmModel
        : selectedLocalApiModel.trim();
    const composerModelPickerGroups = useMemo(() => {
        const webLlmGroups = getGroupedWebLlmModelOptions(selectedWebLlmModel).map((group) => ({
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
        return [
            ...webLlmGroups,
            {
                label: 'ローカルAPI',
                options: localApiOptions,
            },
        ];
    }, [localApiSelectableModels, selectedWebLlmModel]);
    const composerModelOptionValue = activeMode === 'webllm'
        ? `webllm:${selectedWebLlmModel}`
        : selectedLocalApiModelOptionValue.length > 0
            ? `openai-local:${selectedLocalApiModelOptionValue}`
            : 'openai-local';

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            activeAbortRef.current?.abort();
            interruptLocalLlmGeneration();
        };
    }, []);

    useEffect(() => {
        if (!isOpen) {
            requestIdRef.current += 1;
            activeAbortRef.current?.abort();
            interruptLocalLlmGeneration();
            setIsGenerating(false);
            setIsModelLoading(false);
            setWebllmGenerationPhase(null);
            setLoadProgress(null);
            return;
        }

        if (quizSetType !== 'mixed') {
            setSelectedMixedQuestionType(mixedTypeInitialValue);
        }
    }, [isOpen, mixedTypeInitialValue, quizSetType]);

    useEffect(() => {
        if (!isOpen || activeMode !== 'openai-local' || localLlmSettings.baseUrl.trim().length === 0) {
            return;
        }

        const abortController = new AbortController();
        setIsFetchingModels(true);
        setLocalApiFetchError(null);

        fetchOpenAiCompatibleModelIds(localLlmSettings.baseUrl, undefined, abortController.signal)
            .then((modelIds) => {
                if (!mountedRef.current || abortController.signal.aborted) {
                    return;
                }

                setAvailableModels(modelIds);

                const preferredModel = [
                    selectedLocalApiModel.trim(),
                    localLlmSettings.defaultModelId.trim(),
                    rememberedLocalApiModelId.trim(),
                    modelIds[0] ?? '',
                ].find((modelId) => modelId.length > 0 && modelIds.includes(modelId));

                if (preferredModel && preferredModel !== selectedLocalApiModel) {
                    setSelectedLocalApiModel(preferredModel);
                }
            })
            .catch((fetchError) => {
                if (!mountedRef.current || abortController.signal.aborted) {
                    return;
                }
                if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
                    return;
                }
                setLocalApiFetchError(fetchError instanceof Error ? fetchError.message : 'モデル一覧を取得できませんでした。');
            })
            .finally(() => {
                if (!mountedRef.current || abortController.signal.aborted) {
                    return;
                }
                setIsFetchingModels(false);
            });

        return () => {
            abortController.abort();
        };
    }, [activeMode, isOpen, localLlmSettings.baseUrl, localLlmSettings.defaultModelId, rememberedLocalApiModelId, selectedLocalApiModel]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const thread = threadRef.current;
        if (!thread || !shouldAutoScrollRef.current) {
            return;
        }

        thread.scrollTop = thread.scrollHeight;
    }, [isOpen, messages]);

    const handleThreadScroll = useCallback(() => {
        const thread = threadRef.current;
        if (!thread) {
            return;
        }

        const distanceToBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
        shouldAutoScrollRef.current = distanceToBottom < 48;
    }, []);

    const handleCopyMessage = useCallback(async (message: LlmRenderableMessage) => {
        const text = message.content.trim();
        if (text.length === 0) {
            return;
        }
        try {
            await copyTextToClipboard(text);
            markMessageCopied(message.id);
        } catch {
            clearCopiedMessage();
        }
    }, [clearCopiedMessage, markMessageCopied]);

    const handleModelOptionChange = useCallback((value: string) => {
        if (value.startsWith('webllm:')) {
            const modelId = value.slice('webllm:'.length);
            if (activeMode !== 'webllm') {
                onLocalLlmModeChange('webllm');
            }
            if (modelId !== selectedWebLlmModel) {
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
            if (modelId.length > 0) {
                saveLastLocalApiModelId(localLlmSettings.baseUrl, modelId);
            }
            if (activeMode !== 'openai-local') {
                onLocalLlmModeChange('openai-local');
            }
        }
    }, [activeMode, localLlmSettings.baseUrl, onLocalLlmModeChange, onWebLlmModelChange, selectedLocalApiModel, selectedWebLlmModel]);

    const finalizeAssistantMessage = useCallback((
        assistantMessageId: string,
        content: string,
        durationMs: number,
        isStreaming = false
    ) => {
        if (!mountedRef.current) {
            return;
        }

        setMessages((previous) => previous.map((message) => (
            message.id === assistantMessageId
                ? {
                    ...message,
                    content,
                    isStreaming,
                    generationDurationMs: durationMs > 0 ? durationMs : undefined,
                }
                : message
        )));
    }, []);

    const handleGenerate = useCallback(async () => {
        const trimmedRequest = requestText.trim();
        if (trimmedRequest.length === 0 || isGenerating) {
            return;
        }

        if (activeMode === 'webllm' && !webllmSupport.supported) {
            setError(webllmSupport.reason);
            return;
        }

        if (activeMode === 'openai-local' && selectedModel.length === 0) {
            setError('先にローカルAPIのモデルを選択してください。');
            return;
        }

        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        const startedAt = Date.now();
        const userMessageId = crypto.randomUUID();
        const assistantMessageId = crypto.randomUUID();
        const systemPrompt = buildQuestionGenerationSystemPrompt();
        const duplicateReferences = pickDuplicateReferenceQuestions(
            questions,
            trimmedRequest,
            targetQuestionType,
            quizSetType
        );
        const userPrompt = buildQuestionGenerationUserPrompt({
            quizSetName,
            quizSetType,
            targetType: targetQuestionType,
            requestText: trimmedRequest,
            duplicateReferences,
        });

        setError(null);
        setDraft(null);
        setDuplicateCheck(null);
        setLoadProgress(null);
        setMessages((previous) => [
            ...previous,
            { id: userMessageId, role: 'user', content: trimmedRequest },
            { id: assistantMessageId, role: 'assistant', content: '', isStreaming: true },
        ]);
        setRequestText('');
        setIsGenerating(true);
        shouldAutoScrollRef.current = true;

        try {
            let rawResponseText = '';

            if (activeMode === 'webllm') {
                setIsModelLoading(true);
                const engine = await ensureLocalLlmEngine(selectedWebLlmModel, (progress) => {
                    if (!mountedRef.current || requestIdRef.current !== requestId) {
                        return;
                    }
                    setLoadProgress(progress);
                });
                if (!mountedRef.current || requestIdRef.current !== requestId) {
                    return;
                }
                setIsModelLoading(false);

                const result = await runWebLlmBudgetedGeneration({
                    engine,
                    messages: buildWebLlmMessages(systemPrompt, userPrompt),
                    enableThinking: localLlmSettings.webllmEnableThinking,
                    firstPassThinkingBudget: webLlmModelParameters.firstPassThinkingBudget ?? 1024,
                    firstPassTemperature: webLlmModelParameters.firstPassTemperature ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.temperature,
                    firstPassTopP: webLlmModelParameters.firstPassTopP ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.topP,
                    firstPassPresencePenalty: webLlmModelParameters.firstPassPresencePenalty,
                    secondPassFinalAnswerMaxTokens: webLlmModelParameters.secondPassFinalAnswerMaxTokens ?? 512,
                    secondPassTemperature: webLlmModelParameters.secondPassTemperature,
                    secondPassTopP: webLlmModelParameters.secondPassTopP,
                    secondPassPresencePenalty: webLlmModelParameters.secondPassPresencePenalty,
                    onDisplayText: (displayText) => {
                        if (!mountedRef.current || requestIdRef.current !== requestId) {
                            return;
                        }
                        finalizeAssistantMessage(assistantMessageId, displayText, Date.now() - startedAt, true);
                    },
                    onPhaseChange: (phase) => {
                        if (!mountedRef.current || requestIdRef.current !== requestId) {
                            return;
                        }
                        setWebllmGenerationPhase(phase);
                    },
                });

                rawResponseText = result.displayText;
            } else {
                const abortController = new AbortController();
                activeAbortRef.current?.abort();
                activeAbortRef.current = abortController;

                rawResponseText = await streamOpenAiCompatibleChat({
                    baseUrl: localLlmSettings.baseUrl,
                    model: selectedModel,
                    messages: buildOpenAiMessages(systemPrompt, userPrompt),
                    signal: abortController.signal,
                    onDelta: (delta) => {
                        if (!mountedRef.current || requestIdRef.current !== requestId) {
                            return;
                        }
                        setMessages((previous) => previous.map((message) => (
                            message.id === assistantMessageId
                                ? {
                                    ...message,
                                    content: `${message.content}${delta}`,
                                    isStreaming: true,
                                }
                                : message
                        )));
                    },
                    temperature: localApiRequestOptions.temperature,
                    topP: localApiRequestOptions.topP,
                    maxTokens: localApiRequestOptions.maxTokens,
                    extraBody: localApiRequestOptions.extraBody,
                });
            }

            if (!mountedRef.current || requestIdRef.current !== requestId) {
                return;
            }

            const nextDraft = parseQuestionDraftResponse(rawResponseText, targetQuestionType);
            const nextDuplicateCheck = findDraftDuplicateCandidates(nextDraft, questions, quizSetType);
            setDraft(nextDraft);
            setDuplicateCheck(nextDuplicateCheck);
            finalizeAssistantMessage(
                assistantMessageId,
                buildDraftSummaryMarkdown(nextDraft, nextDuplicateCheck),
                Date.now() - startedAt
            );
        } catch (generationError) {
            if (!mountedRef.current || requestIdRef.current !== requestId) {
                return;
            }

            const message = generationError instanceof Error
                ? generationError.message
                : 'AI での下書き生成に失敗しました。';
            setError(message);
            finalizeAssistantMessage(
                assistantMessageId,
                message,
                Date.now() - startedAt
            );
        } finally {
            if (mountedRef.current && requestIdRef.current === requestId) {
                activeAbortRef.current = null;
                setIsGenerating(false);
                setIsModelLoading(false);
                setWebllmGenerationPhase(null);
            }
        }
    }, [
        activeMode,
        finalizeAssistantMessage,
        isGenerating,
        localApiRequestOptions.extraBody,
        localApiRequestOptions.maxTokens,
        localApiRequestOptions.temperature,
        localApiRequestOptions.topP,
        localLlmSettings.baseUrl,
        localLlmSettings.webllmEnableThinking,
        questions,
        quizSetName,
        quizSetType,
        requestText,
        selectedModel,
        selectedWebLlmModel,
        targetQuestionType,
        webLlmModelParameters.firstPassPresencePenalty,
        webLlmModelParameters.firstPassTemperature,
        webLlmModelParameters.firstPassThinkingBudget,
        webLlmModelParameters.firstPassTopP,
        webLlmModelParameters.secondPassFinalAnswerMaxTokens,
        webLlmModelParameters.secondPassPresencePenalty,
        webLlmModelParameters.secondPassTemperature,
        webLlmModelParameters.secondPassTopP,
        webllmSupport.reason,
        webllmSupport.supported,
    ]);

    const handleTextareaKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.nativeEvent.isComposing || isComposingRef.current || event.keyCode === 229) {
            return;
        }

        if (event.key !== 'Enter' || event.shiftKey) {
            return;
        }

        event.preventDefault();
        void handleGenerate();
    }, [handleGenerate]);

    const canGenerate = requestText.trim().length > 0
        && !isGenerating
        && (activeMode === 'webllm'
            ? webllmSupport.supported
            : selectedModel.length > 0);

    const handleApplyDraft = () => {
        if (!draft) {
            return;
        }
        onApplyDraft(draft);
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div className="modal-overlay" onClick={() => !isGenerating && onClose()}>
            <div
                className="modal-content question-draft-ai-modal"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <div>
                        <h3>AIで問題を下書き作成</h3>
                        <p className="question-draft-ai-modal-subtitle">
                            生成した内容は保存せず、既存の編集フォームへ下書きとして流し込みます。
                        </p>
                    </div>
                    <button className="icon-btn" onClick={onClose} disabled={isGenerating} aria-label="閉じる">
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body question-draft-ai-modal-body">
                    <div className="question-draft-ai-layout">
                        <section className="question-draft-ai-panel question-draft-ai-panel-chat">
                            <div className="question-draft-ai-panel-head">
                                <div>
                                    <h4>依頼</h4>
                                    <p>{quizSetName} に 1 問分の下書きを作らせます。</p>
                                </div>
                                <span className="question-draft-ai-chip">
                                    <Sparkles size={14} />
                                    {buildTargetTypeLabel(targetQuestionType)}
                                </span>
                            </div>

                            {quizSetType === 'mixed' && (
                                <div className="question-draft-ai-type-toggle">
                                    <label>
                                        <input
                                            type="radio"
                                            name="question-draft-type"
                                            checked={selectedMixedQuestionType === 'quiz'}
                                            onChange={() => setSelectedMixedQuestionType('quiz')}
                                            disabled={isGenerating}
                                        />
                                        選択式問題
                                    </label>
                                    <label>
                                        <input
                                            type="radio"
                                            name="question-draft-type"
                                            checked={selectedMixedQuestionType === 'memorization'}
                                            onChange={() => setSelectedMixedQuestionType('memorization')}
                                            disabled={isGenerating}
                                        />
                                        暗記カード
                                    </label>
                                </div>
                            )}

                            <div className="question-draft-ai-helper">
                                生成時に既存問題から近い候補を最大4件だけ参照し、重複しにくい下書きを作ります。
                            </div>

                            {(isGenerating && activeMode === 'webllm' && webllmGenerationPhase) || (isFetchingModels && activeMode === 'openai-local' && availableModels.length === 0) ? (
                                <div className="local-llm-thread-status-row">
                                    {isGenerating && activeMode === 'webllm' && webllmGenerationPhase && (
                                        <span className="local-llm-inline-status">
                                            <LoaderCircle size={15} className="spin" />
                                            {webllmGenerationPhase === 'thinking' ? '思考中' : '最終回答を生成中'}
                                        </span>
                                    )}
                                    {isFetchingModels && activeMode === 'openai-local' && availableModels.length === 0 && (
                                        <span className="local-llm-inline-status">
                                            <LoaderCircle size={15} className="spin" />
                                            接続確認中
                                        </span>
                                    )}
                                </div>
                            ) : null}

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

                            <div className="local-llm-thread-shell">
                                <div
                                    ref={threadRef}
                                    className="local-llm-thread question-draft-ai-thread"
                                    onScroll={handleThreadScroll}
                                >
                                    {messages.length === 0 ? (
                                        <div className="local-llm-thread-empty">
                                            <Bot size={26} />
                                            <p>例: 統計学で4択1問、やや難しめ、解説つき。偏りのない選択肢にしてください。</p>
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
                            </div>

                            <div className="local-llm-composer">
                                <div className="local-llm-composer-shell">
                                    <textarea
                                        ref={textareaRef}
                                        className="local-llm-textarea"
                                        value={requestText}
                                        onChange={(event) => setRequestText(event.target.value)}
                                        onCompositionStart={() => {
                                            isComposingRef.current = true;
                                        }}
                                        onCompositionEnd={() => {
                                            isComposingRef.current = false;
                                        }}
                                        onKeyDown={handleTextareaKeyDown}
                                        placeholder="作りたい問題の条件を日本語で入力..."
                                        rows={3}
                                        disabled={isGenerating}
                                    />
                                    <div className="local-llm-composer-toolbar">
                                        <div className="local-llm-composer-settings">
                                            <LocalLlmModelPicker
                                                groups={composerModelPickerGroups}
                                                value={composerModelOptionValue}
                                                onChange={handleModelOptionChange}
                                                disabled={isGenerating || isModelLoading}
                                                ariaLabel="問題生成に使うモデルを選択する"
                                            />
                                            <LocalLlmParameterPopover
                                                activeMode={activeMode}
                                                localLlmSettings={localLlmSettings}
                                                selectedModelId={selectedModel}
                                                selectedModelLabel={selectedModel}
                                                matchedLocalApiProviderId={matchedLocalApiProvider?.id ?? null}
                                                disabled={isGenerating || isModelLoading}
                                                onLocalLlmSettingsChange={onLocalLlmSettingsChange}
                                            />
                                        </div>
                                        <div className="study-question-chat-composer-actions">
                                            <button
                                                type="button"
                                                className="local-llm-send-btn local-llm-tooltip-target"
                                                onClick={() => { void handleGenerate(); }}
                                                disabled={!canGenerate}
                                                aria-label="下書きを生成"
                                                data-tooltip="下書きを生成"
                                            >
                                                <ArrowUp size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="question-draft-ai-panel question-draft-ai-panel-preview">
                            <div className="question-draft-ai-panel-head">
                                <div>
                                    <h4>生成プレビュー</h4>
                                    <p>既存フォームへ反映する前に内容を確認します。</p>
                                </div>
                                {draft && (
                                    <button
                                        type="button"
                                        className="nav-btn action-btn question-draft-ai-apply-btn"
                                        onClick={handleApplyDraft}
                                        disabled={isGenerating}
                                    >
                                        <WandSparkles size={16} />
                                        フォームへ反映
                                    </button>
                                )}
                            </div>

                            {!draft ? (
                                <div className="question-draft-ai-empty-preview">
                                    <WandSparkles size={28} />
                                    <p>生成が完了すると、ここに問題文・選択肢・解説の下書きが表示されます。</p>
                                </div>
                            ) : (
                                <div className="question-draft-ai-preview-stack">
                                    <div className="question-draft-ai-preview-card">
                                        <div className="question-draft-ai-preview-meta">
                                            <span className="question-draft-ai-preview-badge">{buildTargetTypeLabel(draft.questionType)}</span>
                                            <span className="question-draft-ai-preview-category">
                                                カテゴリ: {draft.category || '未設定'}
                                            </span>
                                        </div>
                                        <div className="question-draft-ai-preview-section">
                                            <h5>問題文</h5>
                                            <MarkdownText content={draft.text} />
                                        </div>
                                        {draft.questionType === 'quiz' && (
                                            <div className="question-draft-ai-preview-section">
                                                <h5>選択肢</h5>
                                                <ol className="question-draft-ai-option-list">
                                                    {draft.options.map((option, index) => {
                                                        const isCorrect = draft.correctAnswers.includes(index);
                                                        return (
                                                            <li key={`${index}:${option}`} className={isCorrect ? 'is-correct' : undefined}>
                                                                <span>{option}</span>
                                                                {isCorrect && (
                                                                    <span className="question-draft-ai-option-correct">
                                                                        <Check size={14} />
                                                                        正答
                                                                    </span>
                                                                )}
                                                            </li>
                                                        );
                                                    })}
                                                </ol>
                                            </div>
                                        )}
                                        <div className="question-draft-ai-preview-section">
                                            <h5>{draft.questionType === 'memorization' ? '解答・解説' : '解説'}</h5>
                                            <MarkdownText content={draft.explanation} />
                                        </div>
                                    </div>

                                    <div className={`question-draft-ai-duplicate-card is-${duplicateCheck?.level ?? 'none'}`}>
                                        <div className="question-draft-ai-duplicate-head">
                                            <div>
                                                <h5>重複チェック</h5>
                                                <p>{duplicateCheck ? buildDuplicateSubtitle(duplicateCheck) : '生成後に確認します。'}</p>
                                            </div>
                                        </div>

                                        {duplicateCheck && duplicateCheck.level === 'none' && (
                                            <div className="question-draft-ai-duplicate-empty">
                                                目立つ重複候補はありませんでした。
                                            </div>
                                        )}

                                        {duplicateCheck && duplicateCheck.level !== 'none' && (
                                            <div className="question-draft-ai-duplicate-list">
                                                {[...duplicateCheck.exactTextMatches, ...duplicateCheck.normalizedTextMatches, ...duplicateCheck.similarMatches]
                                                    .slice(0, 5)
                                                    .map((candidate) => (
                                                        <div
                                                            key={`${candidate.question.id ?? candidate.question.text}:${candidate.reason}`}
                                                            className="question-draft-ai-duplicate-item"
                                                        >
                                                            <div className="question-draft-ai-duplicate-item-head">
                                                                <strong>{candidate.question.category || '未設定'}</strong>
                                                                <span>
                                                                    問題文 {formatDuplicateScore(candidate.textSimilarity)} / 総合 {formatDuplicateScore(candidate.combinedSimilarity)}
                                                                </span>
                                                            </div>
                                                            <p className="question-draft-ai-duplicate-reason">{candidate.reason}</p>
                                                            <p className="question-draft-ai-duplicate-text">{candidate.question.text}</p>
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
};
