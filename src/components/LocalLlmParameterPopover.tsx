import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
    LOCAL_API_REASONING_EFFORT_OPTIONS,
    WEB_LLM_QWEN_DEFAULT_FIRST_PASS_PRESENCE_PENALTY,
    WEB_LLM_QWEN_DEFAULT_FIRST_PASS_THINKING_BUDGET,
    WEB_LLM_QWEN_DEFAULT_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS,
    WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS,
    WEB_LLM_QWEN_FIRST_PASS_THINKING_BUDGET_OPTIONS,
    WEB_LLM_QWEN_SECOND_PASS_DEFAULTS,
    WEB_LLM_QWEN_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS_OPTIONS,
    clearLocalApiModelParameterSettings,
    clearWebLlmModelParameterSettings,
    hasLocalApiModelParameterOverrides,
    hasWebLlmModelParameterOverrides,
    resolveLocalApiModelParameterSettings,
    resolveWebLlmModelParameterSettings,
    upsertLocalApiModelParameterSettings,
    upsertWebLlmModelParameterSettings,
    type LocalApiModelParameterSettings,
    type LocalLlmMode,
    type LocalLlmSettings,
    type LocalLlmSettingsUpdater,
    type WebLlmModelParameterSettings,
} from '../utils/settings';
import type { LocalApiProviderPresetId } from '../utils/localApiProviders';
import { useOllamaModelDefaultParameters } from '../hooks/useOllamaModelDefaultParameters';
import { ParameterHelpLabel } from './ParameterHelpLabel';

type LocalLlmParameterPopoverProps = {
    activeMode: LocalLlmMode;
    localLlmSettings: LocalLlmSettings;
    selectedModelId: string;
    selectedModelLabel: string;
    matchedLocalApiProviderId?: LocalApiProviderPresetId | null;
    disabled?: boolean;
    onLocalLlmSettingsChange: (settings: LocalLlmSettingsUpdater) => void;
};

const parseOptionalNumberInput = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return null;
    }

    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
};

const buildDefaultPlaceholder = (value: number | string) => `default : ${value}`;

const PARAMETER_HELP_TOOLTIPS = {
    temperature: '出力のばらつきを調整します。低いほど安定し、高いほど表現の幅が広がります。',
    topP: '候補トークンを上位の累積確率で絞り込みます。低いほど無難、高いほど多様になります。',
    maxTokens: '1回の応答で生成する最大トークン数です。小さすぎると回答が途中で切れます。',
    finalAnswerMaxTokens: '最終回答フェーズで生成する最大トークン数です。小さすぎると回答が途中で切れます。',
} as const;

export const LocalLlmParameterPopover: React.FC<LocalLlmParameterPopoverProps> = ({
    activeMode,
    localLlmSettings,
    selectedModelId,
    selectedModelLabel,
    matchedLocalApiProviderId = null,
    disabled = false,
    onLocalLlmSettingsChange,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const effectiveIsOpen = isOpen && !disabled && selectedModelId.trim().length > 0;
    const isLocalApiMode = activeMode === 'openai-local';
    const isOllama = isLocalApiMode && matchedLocalApiProviderId === 'ollama';
    const ollamaDefaults = useOllamaModelDefaultParameters({
        baseUrl: localLlmSettings.baseUrl,
        modelId: selectedModelId,
        enabled: isOllama,
    });
    const hasLocalApiOverrides = useMemo(
        () => hasLocalApiModelParameterOverrides(localLlmSettings, selectedModelId),
        [localLlmSettings, selectedModelId]
    );

    const localApiParameters = useMemo(
        () => resolveLocalApiModelParameterSettings(localLlmSettings, selectedModelId),
        [localLlmSettings, selectedModelId]
    );
    const defaultLocalApiParameters = useMemo(
        () => resolveLocalApiModelParameterSettings(localLlmSettings, ''),
        [localLlmSettings]
    );
    const webLlmParameters = useMemo(
        () => resolveWebLlmModelParameterSettings(localLlmSettings, selectedModelId),
        [localLlmSettings, selectedModelId]
    );
    const defaultWebLlmParameters = useMemo(
        () => resolveWebLlmModelParameterSettings(localLlmSettings, ''),
        [localLlmSettings]
    );
    const hasOverrides = useMemo(() => (
        isLocalApiMode
            ? hasLocalApiModelParameterOverrides(localLlmSettings, selectedModelId)
            : hasWebLlmModelParameterOverrides(localLlmSettings, selectedModelId)
    ), [isLocalApiMode, localLlmSettings, selectedModelId]);
    const hasCustomParameterValues = useMemo(() => {
        if (isLocalApiMode) {
            if (isOllama && ollamaDefaults.isResolved) {
                const defaultOllamaMaxTokens = ollamaDefaults.maxTokens > 0 ? ollamaDefaults.maxTokens : null;
                return localApiParameters.temperature !== ollamaDefaults.temperature
                    || localApiParameters.topP !== ollamaDefaults.topP
                    || localApiParameters.maxTokens !== defaultOllamaMaxTokens
                    || localApiParameters.reasoningEffort !== 'default';
            }

            return localApiParameters.temperature !== defaultLocalApiParameters.temperature
                || localApiParameters.topP !== defaultLocalApiParameters.topP
                || localApiParameters.maxTokens !== defaultLocalApiParameters.maxTokens
                || localApiParameters.reasoningEffort !== defaultLocalApiParameters.reasoningEffort;
        }

        return webLlmParameters.firstPassTemperature !== defaultWebLlmParameters.firstPassTemperature
            || webLlmParameters.firstPassTopP !== defaultWebLlmParameters.firstPassTopP
            || webLlmParameters.firstPassThinkingBudget !== defaultWebLlmParameters.firstPassThinkingBudget
            || webLlmParameters.firstPassPresencePenalty !== defaultWebLlmParameters.firstPassPresencePenalty
            || webLlmParameters.secondPassTemperature !== defaultWebLlmParameters.secondPassTemperature
            || webLlmParameters.secondPassTopP !== defaultWebLlmParameters.secondPassTopP
            || webLlmParameters.secondPassFinalAnswerMaxTokens !== defaultWebLlmParameters.secondPassFinalAnswerMaxTokens
            || webLlmParameters.secondPassPresencePenalty !== defaultWebLlmParameters.secondPassPresencePenalty;
    }, [
        defaultLocalApiParameters.maxTokens,
        defaultLocalApiParameters.reasoningEffort,
        defaultLocalApiParameters.temperature,
        defaultLocalApiParameters.topP,
        defaultWebLlmParameters.firstPassPresencePenalty,
        defaultWebLlmParameters.firstPassTemperature,
        defaultWebLlmParameters.firstPassThinkingBudget,
        defaultWebLlmParameters.firstPassTopP,
        defaultWebLlmParameters.secondPassFinalAnswerMaxTokens,
        defaultWebLlmParameters.secondPassPresencePenalty,
        defaultWebLlmParameters.secondPassTemperature,
        defaultWebLlmParameters.secondPassTopP,
        isLocalApiMode,
        isOllama,
        localApiParameters.maxTokens,
        localApiParameters.reasoningEffort,
        localApiParameters.temperature,
        localApiParameters.topP,
        ollamaDefaults.isResolved,
        ollamaDefaults.maxTokens,
        ollamaDefaults.temperature,
        ollamaDefaults.topP,
        webLlmParameters.firstPassPresencePenalty,
        webLlmParameters.firstPassTemperature,
        webLlmParameters.firstPassThinkingBudget,
        webLlmParameters.firstPassTopP,
        webLlmParameters.secondPassFinalAnswerMaxTokens,
        webLlmParameters.secondPassPresencePenalty,
        webLlmParameters.secondPassTemperature,
        webLlmParameters.secondPassTopP,
    ]);

    const updatePopoverPosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger || typeof window === 'undefined') {
            return;
        }

        const rect = trigger.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const width = Math.min(360, viewportWidth - 24);
        const left = Math.min(
            Math.max(12, rect.right - width),
            Math.max(12, viewportWidth - width - 12)
        );
        const spaceAbove = rect.top - 12;
        const spaceBelow = viewportHeight - rect.bottom - 12;
        const shouldOpenAbove = spaceAbove >= Math.min(360, spaceBelow) || spaceAbove > spaceBelow;
        const nextMaxHeight = Math.max(220, Math.min(480, shouldOpenAbove ? spaceAbove : spaceBelow));

        setPopoverStyle(shouldOpenAbove
            ? {
                position: 'fixed',
                left,
                bottom: viewportHeight - rect.top + 8,
                width,
                maxHeight: nextMaxHeight,
                zIndex: 3600,
            }
            : {
                position: 'fixed',
                left,
                top: rect.bottom + 8,
                width,
                maxHeight: nextMaxHeight,
                zIndex: 3600,
            });
    }, []);

    useEffect(() => {
        if (!effectiveIsOpen) {
            return;
        }

        let frameId = 0;
        const scheduleUpdate = () => {
            if (frameId !== 0) {
                window.cancelAnimationFrame(frameId);
            }
            frameId = window.requestAnimationFrame(() => {
                frameId = 0;
                updatePopoverPosition();
            });
        };

        scheduleUpdate();

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                setIsOpen(false);
                return;
            }

            if (
                triggerRef.current?.contains(target)
                || popoverRef.current?.contains(target)
            ) {
                return;
            }

            setIsOpen(false);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
                triggerRef.current?.focus();
            }
        };

        window.addEventListener('resize', scheduleUpdate);
        window.addEventListener('scroll', scheduleUpdate, true);
        window.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('resize', scheduleUpdate);
            window.removeEventListener('scroll', scheduleUpdate, true);
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
            if (frameId !== 0) {
                window.cancelAnimationFrame(frameId);
            }
        };
    }, [effectiveIsOpen, updatePopoverPosition]);

    const updateLocalApiSettings = useCallback((
        recipe: (current: LocalApiModelParameterSettings) => LocalApiModelParameterSettings
    ) => {
        onLocalLlmSettingsChange((previous) => {
            const current = resolveLocalApiModelParameterSettings(previous, selectedModelId);
            return upsertLocalApiModelParameterSettings(previous, selectedModelId, recipe(current));
        });
    }, [onLocalLlmSettingsChange, selectedModelId]);

    const updateWebLlmSettings = useCallback((
        recipe: (current: WebLlmModelParameterSettings) => WebLlmModelParameterSettings
    ) => {
        onLocalLlmSettingsChange((previous) => {
            const current = resolveWebLlmModelParameterSettings(previous, selectedModelId);
            return upsertWebLlmModelParameterSettings(previous, selectedModelId, recipe(current));
        });
    }, [onLocalLlmSettingsChange, selectedModelId]);

    useEffect(() => {
        if (!effectiveIsOpen || !isOllama || !ollamaDefaults.isResolved || hasLocalApiOverrides) {
            return;
        }

        onLocalLlmSettingsChange((previous) => upsertLocalApiModelParameterSettings(previous, selectedModelId, {
            temperature: ollamaDefaults.temperature,
            topP: ollamaDefaults.topP,
            maxTokens: ollamaDefaults.maxTokens > 0 ? ollamaDefaults.maxTokens : null,
            reasoningEffort: 'default',
        }));
    }, [
        effectiveIsOpen,
        hasLocalApiOverrides,
        isOllama,
        ollamaDefaults.isResolved,
        ollamaDefaults.maxTokens,
        ollamaDefaults.temperature,
        ollamaDefaults.topP,
        onLocalLlmSettingsChange,
        selectedModelId,
    ]);

    const handleReset = useCallback(() => {
        onLocalLlmSettingsChange((previous) => (
            isLocalApiMode
                ? clearLocalApiModelParameterSettings(previous, selectedModelId)
                : clearWebLlmModelParameterSettings(previous, selectedModelId)
        ));
    }, [isLocalApiMode, onLocalLlmSettingsChange, selectedModelId]);

    return (
        <div className="local-llm-parameter-popover">
            <button
                ref={triggerRef}
                type="button"
                className={`local-llm-parameter-trigger local-llm-tooltip-target ${hasCustomParameterValues ? 'active' : ''}`}
                onClick={() => setIsOpen((previous) => !previous)}
                disabled={disabled || selectedModelId.trim().length === 0}
                aria-haspopup="dialog"
                aria-expanded={effectiveIsOpen}
                aria-label="モデルのパラメータを設定"
                data-tooltip="モデルのパラメータ"
            >
                <SlidersHorizontal size={14} />
            </button>
            {effectiveIsOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={popoverRef}
                    className="local-llm-parameter-popover-panel"
                    style={popoverStyle}
                    role="dialog"
                    aria-label={`${selectedModelLabel} のパラメータ`}
                >
                    <div className="local-llm-parameter-popover-header">
                        <div className="local-llm-parameter-popover-heading">
                            <div className="local-llm-parameter-popover-title">モデルのパラメータ</div>
                            <div className="local-llm-parameter-popover-subtitle" title={selectedModelLabel}>
                                {selectedModelLabel}
                            </div>
                        </div>
                        <button
                            type="button"
                            className="local-llm-parameter-reset-btn"
                            onClick={handleReset}
                            disabled={!hasOverrides}
                        >
                            <RotateCcw size={14} />
                            <span>デフォルト設定に戻す</span>
                        </button>
                    </div>

                    <div className="local-llm-parameter-popover-body">
                        {isLocalApiMode ? (
                            <>
                                <div className="local-llm-parameter-grid">
                                    <label className="local-llm-parameter-field">
                                        <span>
                                            <ParameterHelpLabel label="temperature" tooltip={PARAMETER_HELP_TOOLTIPS.temperature} />
                                        </span>
                                        <input
                                            type="number"
                                            className="local-llm-parameter-input"
                                            value={localApiParameters.temperature ?? ''}
                                            onChange={(event) => updateLocalApiSettings((current) => ({
                                                ...current,
                                                temperature: parseOptionalNumberInput(event.target.value),
                                            }))}
                                            placeholder={buildDefaultPlaceholder(
                                                isOllama ? ollamaDefaults.temperature : '自動'
                                            )}
                                            min={0}
                                            max={2}
                                            step={0.05}
                                            inputMode="decimal"
                                        />
                                    </label>
                                    <label className="local-llm-parameter-field">
                                        <span>
                                            <ParameterHelpLabel label="top_p" tooltip={PARAMETER_HELP_TOOLTIPS.topP} />
                                        </span>
                                        <input
                                            type="number"
                                            className="local-llm-parameter-input"
                                            value={localApiParameters.topP ?? ''}
                                            onChange={(event) => updateLocalApiSettings((current) => ({
                                                ...current,
                                                topP: parseOptionalNumberInput(event.target.value),
                                            }))}
                                            placeholder={buildDefaultPlaceholder(
                                                isOllama ? ollamaDefaults.topP : '自動'
                                            )}
                                            min={0.01}
                                            max={1}
                                            step={0.01}
                                            inputMode="decimal"
                                        />
                                    </label>
                                    <label className="local-llm-parameter-field">
                                        <span>
                                            <ParameterHelpLabel label="max_tokens" tooltip={PARAMETER_HELP_TOOLTIPS.maxTokens} />
                                        </span>
                                        <input
                                            type="number"
                                            className="local-llm-parameter-input"
                                            value={localApiParameters.maxTokens ?? ''}
                                            onChange={(event) => updateLocalApiSettings((current) => ({
                                                ...current,
                                                maxTokens: parseOptionalNumberInput(event.target.value),
                                            }))}
                                            placeholder={buildDefaultPlaceholder(
                                                isOllama ? ollamaDefaults.maxTokens : 'モデル既定'
                                            )}
                                            min={1}
                                            max={32768}
                                            step={1}
                                            inputMode="numeric"
                                        />
                                    </label>
                                    {isOllama && (
                                        <label className="local-llm-parameter-field">
                                            <span>reasoning_effort</span>
                                            <select
                                                className="local-llm-parameter-input"
                                                value={localApiParameters.reasoningEffort}
                                                onChange={(event) => updateLocalApiSettings((current) => ({
                                                    ...current,
                                                    reasoningEffort: event.target.value as LocalApiModelParameterSettings['reasoningEffort'],
                                                }))}
                                            >
                                                {LOCAL_API_REASONING_EFFORT_OPTIONS.map((value) => (
                                                    <option key={value} value={value}>
                                                        {value === 'default' ? buildDefaultPlaceholder('モデル既定') : value}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="local-llm-parameter-popover-note">
                                    このアプリが WebLLM で実際に使う 1回目と 2回目の生成パラメータを、現在モデルごとに上書きできます。
                                </p>
                                <div className="local-llm-parameter-section">
                                    <div className="local-llm-parameter-section-title">1回目</div>
                                    <p className="local-llm-parameter-popover-note">
                                        default : temperature {WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.temperature} / top_p {WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.topP} / thinking_budget {WEB_LLM_QWEN_DEFAULT_FIRST_PASS_THINKING_BUDGET} / presence_penalty {WEB_LLM_QWEN_DEFAULT_FIRST_PASS_PRESENCE_PENALTY}
                                    </p>
                                    <div className="local-llm-parameter-grid">
                                        <label className="local-llm-parameter-field">
                                            <span>
                                                <ParameterHelpLabel label="temperature" tooltip={PARAMETER_HELP_TOOLTIPS.temperature} />
                                            </span>
                                            <input
                                                type="number"
                                                className="local-llm-parameter-input"
                                                value={webLlmParameters.firstPassTemperature ?? ''}
                                                onChange={(event) => updateWebLlmSettings((current) => ({
                                                    ...current,
                                                    firstPassTemperature: parseOptionalNumberInput(event.target.value)
                                                        ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.temperature,
                                                }))}
                                                placeholder={buildDefaultPlaceholder(WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.temperature)}
                                                min={0}
                                                max={2}
                                                step={0.05}
                                                inputMode="decimal"
                                            />
                                        </label>
                                        <label className="local-llm-parameter-field">
                                            <span>
                                                <ParameterHelpLabel label="top_p" tooltip={PARAMETER_HELP_TOOLTIPS.topP} />
                                            </span>
                                            <input
                                                type="number"
                                                className="local-llm-parameter-input"
                                                value={webLlmParameters.firstPassTopP ?? ''}
                                                onChange={(event) => updateWebLlmSettings((current) => ({
                                                    ...current,
                                                    firstPassTopP: parseOptionalNumberInput(event.target.value)
                                                        ?? WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.topP,
                                                }))}
                                                placeholder={buildDefaultPlaceholder(WEB_LLM_QWEN_FIRST_PASS_FIXED_DEFAULTS.topP)}
                                                min={0.01}
                                                max={1}
                                                step={0.01}
                                                inputMode="decimal"
                                            />
                                        </label>
                                        <label className="local-llm-parameter-field">
                                            <span>thinking_budget</span>
                                            <select
                                                className="local-llm-parameter-input"
                                                value={String(webLlmParameters.firstPassThinkingBudget ?? WEB_LLM_QWEN_DEFAULT_FIRST_PASS_THINKING_BUDGET)}
                                                onChange={(event) => updateWebLlmSettings((current) => ({
                                                    ...current,
                                                    firstPassThinkingBudget: Number.parseInt(event.target.value, 10),
                                                }))}
                                            >
                                                {WEB_LLM_QWEN_FIRST_PASS_THINKING_BUDGET_OPTIONS.map((budget) => (
                                                    <option key={budget} value={budget}>
                                                        {budget}{budget === WEB_LLM_QWEN_DEFAULT_FIRST_PASS_THINKING_BUDGET ? ' (default)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="local-llm-parameter-field">
                                            <span>presence_penalty</span>
                                            <input
                                                type="number"
                                                className="local-llm-parameter-input"
                                                value={webLlmParameters.firstPassPresencePenalty ?? ''}
                                                onChange={(event) => updateWebLlmSettings((current) => ({
                                                    ...current,
                                                    firstPassPresencePenalty: parseOptionalNumberInput(event.target.value)
                                                        ?? WEB_LLM_QWEN_DEFAULT_FIRST_PASS_PRESENCE_PENALTY,
                                                }))}
                                                placeholder={buildDefaultPlaceholder(WEB_LLM_QWEN_DEFAULT_FIRST_PASS_PRESENCE_PENALTY)}
                                                min={0.3}
                                                max={0.6}
                                                step={0.05}
                                                inputMode="decimal"
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="local-llm-parameter-section">
                                    <div className="local-llm-parameter-section-title">2回目</div>
                                    <p className="local-llm-parameter-popover-note">
                                        default : temperature {WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.temperature} / top_p {WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.topP} / final_answer_max_tokens {WEB_LLM_QWEN_DEFAULT_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS} / presence_penalty {WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.presencePenalty}
                                    </p>
                                    <div className="local-llm-parameter-grid">
                                        <label className="local-llm-parameter-field">
                                            <span>
                                                <ParameterHelpLabel label="temperature" tooltip={PARAMETER_HELP_TOOLTIPS.temperature} />
                                            </span>
                                            <input
                                                type="number"
                                                className="local-llm-parameter-input"
                                                value={webLlmParameters.secondPassTemperature ?? ''}
                                                onChange={(event) => updateWebLlmSettings((current) => ({
                                                    ...current,
                                                    secondPassTemperature: parseOptionalNumberInput(event.target.value)
                                                        ?? WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.temperature,
                                                }))}
                                                placeholder={buildDefaultPlaceholder(WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.temperature)}
                                                min={0.5}
                                                max={0.7}
                                                step={0.05}
                                                inputMode="decimal"
                                            />
                                        </label>
                                        <label className="local-llm-parameter-field">
                                            <span>
                                                <ParameterHelpLabel label="top_p" tooltip={PARAMETER_HELP_TOOLTIPS.topP} />
                                            </span>
                                            <input
                                                type="number"
                                                className="local-llm-parameter-input"
                                                value={webLlmParameters.secondPassTopP ?? ''}
                                                onChange={(event) => updateWebLlmSettings((current) => ({
                                                    ...current,
                                                    secondPassTopP: parseOptionalNumberInput(event.target.value)
                                                        ?? WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.topP,
                                                }))}
                                                placeholder={buildDefaultPlaceholder(WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.topP)}
                                                min={0.8}
                                                max={0.9}
                                                step={0.01}
                                                inputMode="decimal"
                                            />
                                        </label>
                                        <label className="local-llm-parameter-field">
                                            <span>
                                                <ParameterHelpLabel label="final_answer_max_tokens" tooltip={PARAMETER_HELP_TOOLTIPS.finalAnswerMaxTokens} />
                                            </span>
                                            <select
                                                className="local-llm-parameter-input"
                                                value={String(webLlmParameters.secondPassFinalAnswerMaxTokens ?? WEB_LLM_QWEN_DEFAULT_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS)}
                                                onChange={(event) => updateWebLlmSettings((current) => ({
                                                    ...current,
                                                    secondPassFinalAnswerMaxTokens: Number.parseInt(event.target.value, 10),
                                                }))}
                                            >
                                                {WEB_LLM_QWEN_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS_OPTIONS.map((maxTokens) => (
                                                    <option key={maxTokens} value={maxTokens}>
                                                        {maxTokens}{maxTokens === WEB_LLM_QWEN_DEFAULT_SECOND_PASS_FINAL_ANSWER_MAX_TOKENS ? ' (default)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="local-llm-parameter-field">
                                            <span>presence_penalty</span>
                                            <input
                                                type="number"
                                                className="local-llm-parameter-input"
                                                value={webLlmParameters.secondPassPresencePenalty ?? ''}
                                                onChange={(event) => updateWebLlmSettings((current) => ({
                                                    ...current,
                                                    secondPassPresencePenalty: parseOptionalNumberInput(event.target.value)
                                                        ?? WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.presencePenalty,
                                                }))}
                                                placeholder={buildDefaultPlaceholder(WEB_LLM_QWEN_SECOND_PASS_DEFAULTS.presencePenalty)}
                                                min={0}
                                                max={0.3}
                                                step={0.05}
                                                inputMode="decimal"
                                            />
                                        </label>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
