import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';

interface NumericStepperProps {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (value: number) => void;
    trailingLabel?: string;
    decreaseAriaLabel?: string;
    increaseAriaLabel?: string;
}

function getStepPrecision(step: number): number {
    const stepString = step.toString();
    const decimalIndex = stepString.indexOf('.');
    return decimalIndex >= 0 ? stepString.length - decimalIndex - 1 : 0;
}

function formatNumber(value: number, precision: number): string {
    if (precision === 0) {
        return String(Math.round(value));
    }
    return value.toFixed(precision).replace(/\.?0+$/, '');
}

export const NumericStepper: React.FC<NumericStepperProps> = ({
    value,
    min,
    max,
    step = 1,
    onChange,
    trailingLabel,
    decreaseAriaLabel = '減らす',
    increaseAriaLabel = '増やす',
}) => {
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const holdIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const precision = useMemo(() => getStepPrecision(step), [step]);
    const stepScale = useMemo(() => Math.pow(10, precision), [precision]);

    const normalizeValue = useCallback((rawValue: number) => {
        const steppedValue = Math.round(rawValue / step) * step;
        const roundedValue = Math.round(steppedValue * stepScale) / stepScale;
        return Math.min(max, Math.max(min, roundedValue));
    }, [max, min, step, stepScale]);

    const inputRef = useRef<HTMLInputElement | null>(null);
    const displayedValueRef = useRef<string>(formatNumber(normalizeValue(value), precision));
    const currentValueRef = useRef<number>(normalizeValue(value));
    const normalizedValue = useMemo(() => normalizeValue(value), [normalizeValue, value]);
    const initialDisplayValue = useMemo(() => formatNumber(normalizedValue, precision), [normalizedValue, precision]);

    const commitValue = (rawValue: number) => {
        const normalizedValue = normalizeValue(rawValue);
        currentValueRef.current = normalizedValue;
        const formattedValue = formatNumber(normalizedValue, precision);
        displayedValueRef.current = formattedValue;
        if (inputRef.current) {
            inputRef.current.value = formattedValue;
        }
        onChange(normalizedValue);
    };

    const stopContinuousChange = () => {
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        if (holdIntervalRef.current) {
            clearTimeout(holdIntervalRef.current);
            holdIntervalRef.current = null;
        }
    };

    const startContinuousChange = (direction: 1 | -1) => {
        stopContinuousChange();
        commitValue(currentValueRef.current + direction * step);

        holdTimerRef.current = setTimeout(() => {
            let speed = 200;
            let count = 0;

            const run = () => {
                commitValue(currentValueRef.current + direction * step);
                count += 1;
                if (count > 10) speed = 50;
                else if (count > 3) speed = 100;
                holdIntervalRef.current = setTimeout(run, speed);
            };

            run();
        }, 400);
    };

    useEffect(() => {
        return () => stopContinuousChange();
    }, []);

    useEffect(() => {
        currentValueRef.current = normalizedValue;
        const formattedValue = formatNumber(normalizedValue, precision);
        displayedValueRef.current = formattedValue;
        if (inputRef.current) {
            inputRef.current.value = formattedValue;
        }
    }, [normalizedValue, precision]);

    const inputPattern = precision > 0 ? /^\d*(\.\d*)?$/ : /^\d*$/;

    return (
        <div className="quiz-feedback-inline-controls">
            <div className="stepper-control">
                <button
                    type="button"
                    className="stepper-control-btn"
                    onPointerDown={() => startContinuousChange(-1)}
                    onPointerUp={stopContinuousChange}
                    onPointerLeave={stopContinuousChange}
                    onPointerCancel={stopContinuousChange}
                    disabled={normalizedValue <= min}
                    aria-label={decreaseAriaLabel}
                >
                    <Minus size={16} />
                </button>
                <input
                    ref={inputRef}
                    type="text"
                    inputMode={precision > 0 ? 'decimal' : 'numeric'}
                    className="field-input quiz-feedback-size-input stepper-control-input"
                    defaultValue={initialDisplayValue}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        if (nextValue === '' || inputPattern.test(nextValue)) {
                            displayedValueRef.current = nextValue;
                        } else {
                            event.target.value = displayedValueRef.current;
                        }
                    }}
                    onBlur={(event) => {
                        const parsedValue = Number.parseFloat(event.target.value);
                        if (!Number.isFinite(parsedValue)) {
                            commitValue(min);
                            return;
                        }
                        commitValue(parsedValue);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        }
                    }}
                />
                <button
                    type="button"
                    className="stepper-control-btn"
                    onPointerDown={() => startContinuousChange(1)}
                    onPointerUp={stopContinuousChange}
                    onPointerLeave={stopContinuousChange}
                    onPointerCancel={stopContinuousChange}
                    disabled={normalizedValue >= max}
                    aria-label={increaseAriaLabel}
                >
                    <Plus size={16} />
                </button>
            </div>
            {trailingLabel && <span className="quiz-feedback-size-help">{trailingLabel}</span>}
        </div>
    );
};
