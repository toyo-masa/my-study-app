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

const buildDefaultPlaceholder = (value: number | string) => `デフォルト値: ${value}`;

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

    const localApiParameters = useMemo(
        () => resolveLocalApiModelParameterSettings(localLlmSettings, selectedModelId),
        [localLlmSettings, selectedModelId]
    );
    const webLlmParameters = useMemo(
        () => resolveWebLlmModelParameterSettings(localLlmSettings, selectedModelId),
        [localLlmSettings, selectedModelId]
    );
    const hasOverrides = useMemo(() => (
        isLocalApiMode
            ? hasLocalApiModelParameterOverrides(localLlmSettings, selectedModelId)
            : hasWebLlmModelParameterOverrides(localLlmSettings, selectedModelId)
    ), [isLocalApiMode, localLlmSettings, selectedModelId]);

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
                className={`local-llm-parameter-trigger local-llm-tooltip-target ${hasOverrides ? 'active' : ''}`}
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
                        <div className="local-llm-parameter-popover-title">モデルのパラメータ</div>
                        <div className="local-llm-parameter-popover-subtitle" title={selectedModelLabel}>
                            {selectedModelLabel}
                        </div>
                    </div>

                    <div className="local-llm-parameter-popover-body">
                        {isLocalApiMode ? (
                            <>
                                <p className="local-llm-parameter-popover-note">
                                    OpenAI互換APIへ送る項目です。
                                    {isOllama
                                        ? ' Ollama では reasoning_effort も現在モデルごとに切り替えられます。'
                                        : ''}
                                </p>
                                <div className="local-llm-parameter-grid">
                                    <label className="local-llm-parameter-field">
                                        <span>temperature</span>
                                        <input
                                            type="number"
                                            className="local-llm-parameter-input"
                                            value={localApiParameters.temperature ?? ''}
                                            onChange={(event) => updateLocalApiSettings((current) => ({
                                                ...current,
                                                temperature: parseOptionalNumberInput(event.target.value),
                                            }))}
                                            placeholder={buildDefaultPlaceholder('自動')}
                                            min={0}
                                            max={2}
                                            step={0.05}
                                            inputMode="decimal"
                                        />
                                    </label>
                                    <label className="local-llm-parameter-field">
                                        <span>top_p</span>
                                        <input
                                            type="number"
                                            className="local-llm-parameter-input"
                                            value={localApiParameters.topP ?? ''}
                                            onChange={(event) => updateLocalApiSettings((current) => ({
                                                ...current,
                                                topP: parseOptionalNumberInput(event.target.value),
                                            }))}
                                            placeholder={buildDefaultPlaceholder('自動')}
                                            min={0.01}
                                            max={1}
                                            step={0.01}
                                            inputMode="decimal"
                                        />
                                    </label>
                                    <label className="local-llm-parameter-field">
                                        <span>max_tokens</span>
                                        <input
                                            type="number"
                                            className="local-llm-parameter-input"
                                            value={localApiParameters.maxTokens ?? ''}
                                            onChange={(event) => updateLocalApiSettings((current) => ({
                                                ...current,
                                                maxTokens: parseOptionalNumberInput(event.target.value),
                                            }))}
                                            placeholder={buildDefaultPlaceholder('モデル既定')}
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
                                    <div className="local-llm-parameter-grid">
                                        <label className="local-llm-parameter-field">
                                            <span>temperature</span>
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
                                            <span>top_p</span>
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
                                                        {budget}
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
                                    <div className="local-llm-parameter-grid">
                                        <label className="local-llm-parameter-field">
                                            <span>temperature</span>
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
                                            <span>top_p</span>
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
                                            <span>final_answer_max_tokens</span>
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
                                                        {maxTokens}
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

                    <div className="local-llm-parameter-popover-footer">
                        <button
                            type="button"
                            className="local-llm-parameter-reset-btn"
                            onClick={handleReset}
                            disabled={!hasOverrides}
                        >
                            <RotateCcw size={14} />
                            <span>このモデルの上書きを解除</span>
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
