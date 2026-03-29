import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export type LocalLlmModelPickerOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

export type LocalLlmModelPickerGroup = {
    label: string;
    options: LocalLlmModelPickerOption[];
};

type LocalLlmModelPickerProps = {
    groups: LocalLlmModelPickerGroup[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    ariaLabel?: string;
};

export const LocalLlmModelPicker: React.FC<LocalLlmModelPickerProps> = ({
    groups,
    value,
    onChange,
    disabled = false,
    ariaLabel = 'モデルを選択',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const effectiveIsOpen = isOpen && !disabled;

    const flatOptions = useMemo(
        () => groups.flatMap((group) => group.options),
        [groups]
    );
    const selectedOption = useMemo(
        () => flatOptions.find((option) => option.value === value) ?? null,
        [flatOptions, value]
    );

    const updatePopoverPosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger || typeof window === 'undefined') {
            return;
        }

        const rect = trigger.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const width = Math.min(Math.max(rect.width, 340), viewportWidth - 24);
        const left = Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - width - 12));
        const spaceAbove = rect.top - 12;
        const spaceBelow = viewportHeight - rect.bottom - 12;
        const shouldOpenAbove = spaceAbove >= Math.min(280, spaceBelow) || spaceAbove > spaceBelow;
        const nextMaxHeight = Math.max(180, Math.min(420, shouldOpenAbove ? spaceAbove : spaceBelow));

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

        const scrollSelectedOption = window.requestAnimationFrame(() => {
            const selectedElement = popoverRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
            selectedElement?.scrollIntoView({ block: 'nearest' });
        });

        return () => {
            window.removeEventListener('resize', scheduleUpdate);
            window.removeEventListener('scroll', scheduleUpdate, true);
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
            if (frameId !== 0) {
                window.cancelAnimationFrame(frameId);
            }
            window.cancelAnimationFrame(scrollSelectedOption);
        };
    }, [effectiveIsOpen, updatePopoverPosition]);

    const handleSelect = useCallback((option: LocalLlmModelPickerOption) => {
        if (option.disabled) {
            return;
        }

        onChange(option.value);
        setIsOpen(false);
    }, [onChange]);

    return (
        <div className="local-llm-model-picker">
            <button
                ref={triggerRef}
                type="button"
                className="local-llm-model-picker-trigger local-llm-tooltip-target"
                onClick={() => setIsOpen((previous) => !previous)}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={effectiveIsOpen}
                aria-label={ariaLabel}
                data-tooltip={selectedOption?.label ?? ariaLabel}
            >
                <span className="local-llm-model-picker-trigger-label">
                    {selectedOption?.label ?? 'モデルを選択'}
                </span>
                <ChevronDown size={16} className={`local-llm-model-picker-trigger-icon ${effectiveIsOpen ? 'is-open' : ''}`} />
            </button>
            {effectiveIsOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={popoverRef}
                    className="local-llm-model-picker-popover"
                    style={popoverStyle}
                    role="listbox"
                    aria-label={ariaLabel}
                >
                    {groups.map((group) => (
                        group.options.length > 0 && (
                            <div key={group.label} className="local-llm-model-picker-group">
                                <div className="local-llm-model-picker-group-label">{group.label}</div>
                                <div className="local-llm-model-picker-option-list">
                                    {group.options.map((option) => {
                                        const isSelected = option.value === value;
                                        return (
                                            <button
                                                key={`${group.label}:${option.value}`}
                                                type="button"
                                                className={`local-llm-model-picker-option ${isSelected ? 'is-selected' : ''}`}
                                                onClick={() => handleSelect(option)}
                                                disabled={option.disabled}
                                                role="option"
                                                aria-selected={isSelected}
                                                data-selected={isSelected ? 'true' : undefined}
                                            >
                                                <span className="local-llm-model-picker-option-check" aria-hidden="true">
                                                    {isSelected ? <Check size={18} /> : null}
                                                </span>
                                                <span className="local-llm-model-picker-option-label">{option.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};
