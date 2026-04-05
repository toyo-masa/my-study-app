import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calculator, Wrench, X } from 'lucide-react';

type OperatorSymbol = '+' | '-' | '×' | '÷';

type CalculatorKey = {
    label: string;
    value?: string;
    variant?: 'default' | 'operator' | 'utility' | 'equal';
    span?: 'wide' | 'tall';
};

const CALCULATOR_KEYS: CalculatorKey[] = [
    { label: 'C', value: 'clear', variant: 'utility' },
    { label: '⌫', value: 'backspace', variant: 'utility' },
    { label: '÷', value: '÷', variant: 'operator' },
    { label: '×', value: '×', variant: 'operator' },
    { label: '7', value: '7' },
    { label: '8', value: '8' },
    { label: '9', value: '9' },
    { label: '-', value: '-', variant: 'operator' },
    { label: '4', value: '4' },
    { label: '5', value: '5' },
    { label: '6', value: '6' },
    { label: '+', value: '+', variant: 'operator' },
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },
    { label: '=', value: 'equals', variant: 'equal', span: 'tall' },
    { label: '0', value: '0', span: 'wide' },
    { label: '.', value: '.' },
];

const MAX_DECIMAL_PLACES = 10;

const isDigit = (value: string): boolean => value >= '0' && value <= '9';

const isOperator = (value: string): value is OperatorSymbol =>
    value === '+' || value === '-' || value === '×' || value === '÷';

const normalizeOperatorInput = (value: string): string | null => {
    if (value === '*') {
        return '×';
    }

    if (value === '/') {
        return '÷';
    }

    if (isDigit(value) || value === '.' || value === '+' || value === '-' || value === '×' || value === '÷') {
        return value;
    }

    return null;
};

const getCurrentNumberSegment = (expression: string): string => {
    for (let index = expression.length - 1; index >= 0; index -= 1) {
        const char = expression[index];
        if (isOperator(char) && index !== 0) {
            return expression.slice(index + 1);
        }
    }

    return expression;
};

const formatCalculatorResult = (value: number): string => {
    const rounded = Number.parseFloat(value.toFixed(MAX_DECIMAL_PLACES));
    const normalized = Object.is(rounded, -0) ? 0 : rounded;
    return normalized.toString();
};

const tokenizeExpression = (expression: string): Array<number | OperatorSymbol> | null => {
    const tokens: Array<number | OperatorSymbol> = [];
    let current = '';

    for (const char of expression) {
        if (isDigit(char) || char === '.' || (char === '-' && current === '' && tokens.length === 0)) {
            current += char;
            continue;
        }

        if (!isOperator(char)) {
            return null;
        }

        if (current === '' || current === '-' || current === '.' || current === '-.') {
            return null;
        }

        const parsed = Number.parseFloat(current);
        if (!Number.isFinite(parsed)) {
            return null;
        }

        tokens.push(parsed);
        tokens.push(char);
        current = '';
    }

    if (current === '' || current === '-' || current === '.' || current === '-.') {
        return null;
    }

    const parsed = Number.parseFloat(current);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    tokens.push(parsed);
    return tokens;
};

const evaluateExpression = (expression: string): { result: number | null; error: string | null } => {
    const trimmed = expression.trim();
    const lastChar = trimmed.at(-1);

    if (
        trimmed === ''
        || trimmed === '-'
        || trimmed === '.'
        || trimmed === '-.'
        || (lastChar !== undefined && isOperator(lastChar))
    ) {
        return { result: null, error: '式が不完全です' };
    }

    const tokens = tokenizeExpression(trimmed);
    if (!tokens || typeof tokens[0] !== 'number') {
        return { result: null, error: '計算できません' };
    }

    const multiplied: Array<number | OperatorSymbol> = [tokens[0]];
    for (let index = 1; index < tokens.length; index += 2) {
        const operator = tokens[index];
        const operand = tokens[index + 1];

        if (typeof operator !== 'string' || typeof operand !== 'number') {
            return { result: null, error: '計算できません' };
        }

        if (operator === '×' || operator === '÷') {
            const previousValue = multiplied.pop();
            if (typeof previousValue !== 'number') {
                return { result: null, error: '計算できません' };
            }

            if (operator === '÷' && operand === 0) {
                return { result: null, error: '0で割れません' };
            }

            multiplied.push(operator === '×' ? previousValue * operand : previousValue / operand);
            continue;
        }

        multiplied.push(operator, operand);
    }

    let total = multiplied[0];
    if (typeof total !== 'number') {
        return { result: null, error: '計算できません' };
    }

    for (let index = 1; index < multiplied.length; index += 2) {
        const operator = multiplied[index];
        const operand = multiplied[index + 1];

        if (typeof operator !== 'string' || typeof operand !== 'number') {
            return { result: null, error: '計算できません' };
        }

        total = operator === '+' ? total + operand : total - operand;
    }

    if (!Number.isFinite(total)) {
        return { result: null, error: '計算できません' };
    }

    return { result: total, error: null };
};

export const SessionToolsLauncher: React.FC = () => {
    const menuId = useId();
    const menuItemId = `${menuId}-calculator`;
    const rootRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const toolButtonRef = useRef<HTMLButtonElement>(null);
    const calculatorMenuItemRef = useRef<HTMLButtonElement>(null);
    const displayRef = useRef<HTMLInputElement>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
    const [expression, setExpression] = useState('');
    const [lastResult, setLastResult] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [hasJustEvaluated, setHasJustEvaluated] = useState(false);

    const focusToolButton = useCallback(() => {
        window.requestAnimationFrame(() => {
            toolButtonRef.current?.focus();
        });
    }, []);

    const focusCalculatorDisplay = useCallback(() => {
        window.requestAnimationFrame(() => {
            displayRef.current?.focus();
            displayRef.current?.setSelectionRange(displayRef.current.value.length, displayRef.current.value.length);
        });
    }, []);

    const closeMenu = useCallback((options?: { returnFocus?: boolean }) => {
        setIsMenuOpen(false);
        if (options?.returnFocus) {
            focusToolButton();
        }
    }, [focusToolButton]);

    const closeCalculator = useCallback((options?: { returnFocus?: boolean }) => {
        setIsCalculatorOpen(false);
        if (options?.returnFocus) {
            focusToolButton();
        }
    }, [focusToolButton]);

    const resetCalculator = useCallback(() => {
        setExpression('');
        setLastResult(null);
        setErrorMessage(null);
        setHasJustEvaluated(false);
    }, []);

    const applyInputToken = useCallback((rawValue: string) => {
        const token = normalizeOperatorInput(rawValue);
        if (!token) {
            return;
        }

        const baseExpression = errorMessage
            ? ''
            : hasJustEvaluated
                ? (isOperator(token) ? (lastResult ?? expression) : '')
                : expression;

        let nextExpression: string | null = null;

        if (token === '.') {
            const segment = getCurrentNumberSegment(baseExpression);
            if (segment.includes('.')) {
                return;
            }

            nextExpression = baseExpression === ''
                ? '0.'
                : baseExpression === '-'
                    ? '-0.'
                    : `${baseExpression}.`;
        } else if (isOperator(token)) {
            if (baseExpression === '') {
                if (token === '-') {
                    nextExpression = '-';
                } else {
                    return;
                }
            } else if (baseExpression === '-') {
                return;
            } else {
                const lastChar = baseExpression.at(-1);
                nextExpression = lastChar && isOperator(lastChar)
                    ? `${baseExpression.slice(0, -1)}${token}`
                    : `${baseExpression}${token}`;
            }
        } else {
            nextExpression = `${baseExpression}${token}`;
        }

        if (nextExpression === null) {
            return;
        }

        setExpression(nextExpression);
        setErrorMessage(null);
        setHasJustEvaluated(false);
    }, [errorMessage, expression, hasJustEvaluated, lastResult]);

    const handleBackspace = useCallback(() => {
        setExpression((prevExpression) => {
            if (prevExpression.length === 0) {
                return prevExpression;
            }

            return prevExpression.slice(0, -1);
        });
        setErrorMessage(null);
        setHasJustEvaluated(false);
    }, []);

    const handleEvaluate = useCallback(() => {
        const { result, error } = evaluateExpression(expression);
        if (error || result === null) {
            setErrorMessage(error ?? '計算できません');
            setHasJustEvaluated(false);
            return;
        }

        const formatted = formatCalculatorResult(result);
        setExpression(formatted);
        setLastResult(formatted);
        setErrorMessage(null);
        setHasJustEvaluated(true);
    }, [expression]);

    const handleCalculatorKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
        if (event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }

        if (event.key === 'Enter' || event.key === '=') {
            event.preventDefault();
            handleEvaluate();
            return;
        }

        if (event.key === 'Backspace') {
            event.preventDefault();
            handleBackspace();
            return;
        }

        const token = normalizeOperatorInput(event.key);
        if (!token) {
            return;
        }

        event.preventDefault();
        applyInputToken(token);
    }, [applyInputToken, handleBackspace, handleEvaluate]);

    const handleCalculatorButtonMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
    }, []);

    const handleToolButtonClick = useCallback(() => {
        setIsMenuOpen((prev) => !prev);
    }, []);

    const handleCalculatorMenuClick = useCallback(() => {
        setIsMenuOpen(false);
        setIsCalculatorOpen((prev) => !prev);

        if (isCalculatorOpen) {
            focusToolButton();
        }
    }, [focusToolButton, isCalculatorOpen]);

    const handleCloseCalculator = useCallback(() => {
        closeCalculator({ returnFocus: true });
    }, [closeCalculator]);

    useEffect(() => {
        if (!isMenuOpen) {
            return;
        }

        window.requestAnimationFrame(() => {
            calculatorMenuItemRef.current?.focus();
        });
    }, [isMenuOpen]);

    useEffect(() => {
        if (!isCalculatorOpen) {
            return;
        }

        focusCalculatorDisplay();
    }, [focusCalculatorDisplay, isCalculatorOpen]);

    useEffect(() => {
        if (!isMenuOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }

            if (toolButtonRef.current?.contains(target) || menuRef.current?.contains(target)) {
                return;
            }

            setIsMenuOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [isMenuOpen]);

    useEffect(() => {
        if (!isMenuOpen && !isCalculatorOpen) {
            return;
        }

        const handleDocumentKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }

            if (isMenuOpen) {
                event.preventDefault();
                closeMenu({ returnFocus: !isCalculatorOpen });
                return;
            }

            if (isCalculatorOpen) {
                event.preventDefault();
                closeCalculator({ returnFocus: true });
            }
        };

        document.addEventListener('keydown', handleDocumentKeyDown);
        return () => document.removeEventListener('keydown', handleDocumentKeyDown);
    }, [closeCalculator, closeMenu, isCalculatorOpen, isMenuOpen]);

    const calculatorDisplayValue = useMemo(() => {
        if (errorMessage) {
            return errorMessage;
        }

        return expression || '0';
    }, [errorMessage, expression]);

    return (
        <div ref={rootRef} className="session-tools-root">
            <button
                ref={toolButtonRef}
                type="button"
                className={`menu-btn session-tools-btn ${isMenuOpen ? 'active' : ''}`}
                onClick={handleToolButtonClick}
                aria-label="ツールを開く"
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                aria-controls={isMenuOpen ? menuId : undefined}
                title="ツール"
            >
                <Wrench size={18} />
            </button>

            {isMenuOpen && (
                <div
                    id={menuId}
                    ref={menuRef}
                    className="session-tools-menu"
                    role="menu"
                    aria-label="ツール一覧"
                >
                    <button
                        id={menuItemId}
                        ref={calculatorMenuItemRef}
                        type="button"
                        className={`session-tools-menu-item ${isCalculatorOpen ? 'active' : ''}`}
                        onClick={handleCalculatorMenuClick}
                        role="menuitem"
                    >
                        <Calculator size={16} />
                        {isCalculatorOpen ? '電卓を閉じる' : '電卓'}
                    </button>
                </div>
            )}

            {isCalculatorOpen && (
                <section
                    className="session-calculator-panel"
                    role="dialog"
                    aria-label="電卓"
                    onKeyDown={handleCalculatorKeyDown}
                >
                    <div className="session-calculator-header">
                        <div className="session-calculator-title">
                            <Calculator size={16} />
                            <span>電卓</span>
                        </div>
                        <button
                            type="button"
                            className="icon-btn session-calculator-close-btn"
                            onClick={handleCloseCalculator}
                            aria-label="電卓を閉じる"
                            title="閉じる"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="session-calculator-body">
                        <input
                            ref={displayRef}
                            type="text"
                            readOnly
                            value={calculatorDisplayValue}
                            className={`session-calculator-display ${errorMessage ? 'has-error' : ''}`}
                            aria-label="電卓の表示"
                            spellCheck={false}
                        />
                        <p className="session-calculator-help">
                            キーボード: 数字 / <code>+ - * / .</code> / <code>Enter</code> / <code>Backspace</code>
                        </p>

                        <div className="session-calculator-grid">
                            {CALCULATOR_KEYS.map((key) => (
                                <button
                                    key={key.label}
                                    type="button"
                                    className={`session-calculator-key ${key.variant ?? 'default'} ${key.span ?? ''}`.trim()}
                                    onMouseDown={handleCalculatorButtonMouseDown}
                                    onClick={() => {
                                        if (key.value === 'clear') {
                                            resetCalculator();
                                        } else if (key.value === 'backspace') {
                                            handleBackspace();
                                        } else if (key.value === 'equals') {
                                            handleEvaluate();
                                        } else if (key.value) {
                                            applyInputToken(key.value);
                                        }

                                        focusCalculatorDisplay();
                                    }}
                                >
                                    {key.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
};
