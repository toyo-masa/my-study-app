import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Calculator, Wrench, X } from 'lucide-react';

type CalculatorBinaryOperator = '+' | '-' | '×' | '÷' | '^';
type CalculatorFunctionName = 'sin' | 'cos' | 'tan' | 'log' | 'ln' | 'sqrt';
type CalculatorResizeDirection = 'right' | 'bottom' | 'corner';

type CalculatorPosition = {
    left: number;
    top: number;
};

type CalculatorSize = {
    width: number;
    height: number;
};

type CalculatorToken =
    | { type: 'number'; value: number }
    | { type: 'operator'; value: CalculatorBinaryOperator }
    | { type: 'paren'; value: '(' | ')' }
    | { type: 'function'; value: CalculatorFunctionName };

type CalculatorButton = {
    label: string;
    action:
        | 'digit'
        | 'decimal'
        | 'operator'
        | 'openParen'
        | 'closeParen'
        | 'clear'
        | 'backspace'
        | 'equals'
        | 'prefixFunction'
        | 'postfixAppend'
        | 'toggleSign'
        | 'percent';
    value?: string;
    functionName?: CalculatorFunctionName;
    variant?: 'default' | 'operator' | 'utility' | 'equal' | 'function';
    span?: 'wide' | 'full';
};

const CALCULATOR_SCIENTIFIC_KEYS: CalculatorButton[] = [
    { label: '(', action: 'openParen', variant: 'utility' },
    { label: ')', action: 'closeParen', variant: 'utility' },
    { label: 'x²', action: 'postfixAppend', value: '^2', variant: 'function' },
    { label: 'x³', action: 'postfixAppend', value: '^3', variant: 'function' },
    { label: 'xʸ', action: 'operator', value: '^', variant: 'function' },
    { label: '√', action: 'prefixFunction', functionName: 'sqrt', variant: 'function' },
    { label: 'ln', action: 'prefixFunction', functionName: 'ln', variant: 'function' },
    { label: 'log', action: 'prefixFunction', functionName: 'log', variant: 'function' },
    { label: 'sin', action: 'prefixFunction', functionName: 'sin', variant: 'function' },
    { label: 'cos', action: 'prefixFunction', functionName: 'cos', variant: 'function' },
    { label: 'tan', action: 'prefixFunction', functionName: 'tan', variant: 'function' },
];

const CALCULATOR_DIGIT_KEYS: CalculatorButton[] = [
    { label: '7', action: 'digit', value: '7' },
    { label: '8', action: 'digit', value: '8' },
    { label: '9', action: 'digit', value: '9' },
    { label: '4', action: 'digit', value: '4' },
    { label: '5', action: 'digit', value: '5' },
    { label: '6', action: 'digit', value: '6' },
    { label: '1', action: 'digit', value: '1' },
    { label: '2', action: 'digit', value: '2' },
    { label: '3', action: 'digit', value: '3' },
    { label: '±', action: 'toggleSign', variant: 'utility' },
    { label: '0', action: 'digit', value: '0' },
    { label: '.', action: 'decimal' },
];

const CALCULATOR_OPERATOR_KEYS: CalculatorButton[] = [
    { label: '÷', action: 'operator', value: '÷', variant: 'operator' },
    { label: '×', action: 'operator', value: '×', variant: 'operator' },
    { label: '-', action: 'operator', value: '-', variant: 'operator' },
    { label: '+', action: 'operator', value: '+', variant: 'operator' },
    { label: '=', action: 'equals', variant: 'equal' },
];

const BASE_CALCULATOR_PANEL_WIDTH = 500;
const BASE_CALCULATOR_PANEL_HEIGHT = 620;
const CALCULATOR_PANEL_MARGIN = 12;
const DEFAULT_CALCULATOR_TOP = 72;
const MIN_CALCULATOR_SCALE = 0.64;
const MIN_CALCULATOR_PANEL_WIDTH = Math.round(BASE_CALCULATOR_PANEL_WIDTH * MIN_CALCULATOR_SCALE);
const MIN_CALCULATOR_PANEL_HEIGHT = Math.round(BASE_CALCULATOR_PANEL_HEIGHT * MIN_CALCULATOR_SCALE);
const CALCULATOR_SCALE_STYLE_KEY = '--session-calculator-scale' as const;
const MAX_DECIMAL_PLACES = 10;
const DEGREE_TO_RADIAN = Math.PI / 180;

const FUNCTION_NAMES: CalculatorFunctionName[] = ['sin', 'cos', 'tan', 'log', 'ln', 'sqrt'];
const FUNCTION_OPENERS = FUNCTION_NAMES
    .map((name) => `${name}(`)
    .sort((left, right) => right.length - left.length);

const isDigit = (value: string): boolean => value >= '0' && value <= '9';

const isBinaryOperator = (value: string): value is CalculatorBinaryOperator =>
    value === '+' || value === '-' || value === '×' || value === '÷' || value === '^';

const getLastChar = (expression: string): string | null => expression.at(-1) ?? null;

const canExpressionEndWithValue = (expression: string): boolean => {
    const lastChar = getLastChar(expression);
    return lastChar !== null && (isDigit(lastChar) || lastChar === '.' || lastChar === ')');
};

const hasTrailingUnaryMinus = (expression: string): boolean => {
    if (!expression.endsWith('-') || expression.length < 2) {
        return false;
    }

    const previousChar = expression[expression.length - 2];
    return previousChar === '(' || isBinaryOperator(previousChar);
};

const countOpenParentheses = (expression: string): number => {
    let balance = 0;

    for (const char of expression) {
        if (char === '(') {
            balance += 1;
        } else if (char === ')') {
            balance = Math.max(0, balance - 1);
        }
    }

    return balance;
};

const getCurrentNumberSegment = (expression: string): string => {
    for (let index = expression.length - 1; index >= 0; index -= 1) {
        const char = expression[index];
        if (isBinaryOperator(char) || char === '(' || char === ')') {
            return expression.slice(index + 1);
        }
    }

    return expression;
};

const normalizeOperatorInput = (value: string): string | null => {
    if (value === '*') {
        return '×';
    }

    if (value === '/') {
        return '÷';
    }

    if (isDigit(value) || value === '.' || value === '(' || value === ')' || isBinaryOperator(value)) {
        return value;
    }

    return null;
};

const formatCalculatorResult = (value: number): string => {
    const rounded = Number.parseFloat(value.toFixed(MAX_DECIMAL_PLACES));
    const normalized = Object.is(rounded, -0) ? 0 : rounded;
    return normalized.toString();
};

const formatNumberSegmentForDisplay = (segment: string): string => {
    const [integerPart, fractionalPart] = segment.split('.');
    const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    if (fractionalPart === undefined) {
        return groupedInteger;
    }

    return `${groupedInteger}.${fractionalPart}`;
};

const formatExpressionForDisplay = (expression: string): string => {
    let result = '';
    let index = 0;

    while (index < expression.length) {
        if (expression.startsWith('sqrt', index)) {
            result += '√';
            index += 4;
            continue;
        }

        const char = expression[index];

        if (isDigit(char) || char === '.') {
            let nextIndex = index + 1;
            while (nextIndex < expression.length) {
                const nextChar = expression[nextIndex];
                if (!isDigit(nextChar) && nextChar !== '.') {
                    break;
                }

                nextIndex += 1;
            }

            result += formatNumberSegmentForDisplay(expression.slice(index, nextIndex));
            index = nextIndex;
            continue;
        }

        result += char;
        index += 1;
    }

    return result;
};

const getAutoClosedExpression = (expression: string): string => {
    const trimmed = expression.trim();
    if (trimmed.length === 0 || !canExpressionEndWithValue(trimmed)) {
        return trimmed;
    }

    return `${trimmed}${')'.repeat(countOpenParentheses(trimmed))}`;
};

const removeTrailingExpressionUnit = (expression: string): string => {
    if (expression.length === 0) {
        return expression;
    }

    if (expression.endsWith('^2') || expression.endsWith('^3')) {
        return expression.slice(0, -2);
    }

    for (const opener of FUNCTION_OPENERS) {
        if (expression.endsWith(opener)) {
            return expression.slice(0, -opener.length);
        }
    }

    return expression.slice(0, -1);
};

const findTrailingNumberRange = (expression: string): { start: number; end: number } | null => {
    if (expression.length === 0) {
        return null;
    }

    let index = expression.length - 1;
    while (index >= 0 && (isDigit(expression[index]) || expression[index] === '.')) {
        index -= 1;
    }

    if (index === expression.length - 1) {
        return null;
    }

    let start = index + 1;
    if (
        index >= 0
        && expression[index] === '-'
        && (index === 0 || expression[index - 1] === '(' || isBinaryOperator(expression[index - 1]))
    ) {
        start = index;
    }

    return {
        start,
        end: expression.length,
    };
};

const findTrailingWrappedValueRange = (expression: string): { start: number; end: number } | null => {
    const lastChar = getLastChar(expression);
    if (lastChar === null) {
        return null;
    }

    if (lastChar !== ')') {
        return findTrailingNumberRange(expression);
    }

    let balance = 0;
    let start = -1;

    for (let index = expression.length - 1; index >= 0; index -= 1) {
        const char = expression[index];
        if (char === ')') {
            balance += 1;
            continue;
        }

        if (char === '(') {
            balance -= 1;
            if (balance === 0) {
                start = index;
                break;
            }
        }
    }

    if (start < 0) {
        return null;
    }

    while (start > 0 && /[a-z]/i.test(expression[start - 1])) {
        start -= 1;
    }

    return {
        start,
        end: expression.length,
    };
};

const clampValue = (value: number, min: number, max: number): number => {
    if (max < min) {
        return min;
    }

    return Math.min(max, Math.max(min, value));
};

const getDefaultCalculatorPosition = (panelSize: CalculatorSize): CalculatorPosition => {
    if (typeof window === 'undefined') {
        return { left: CALCULATOR_PANEL_MARGIN, top: DEFAULT_CALCULATOR_TOP };
    }

    return {
        left: Math.max(CALCULATOR_PANEL_MARGIN, window.innerWidth - panelSize.width - 16),
        top: DEFAULT_CALCULATOR_TOP,
    };
};

const clampCalculatorPosition = (
    position: CalculatorPosition,
    panelSize: CalculatorSize
): CalculatorPosition => {
    if (typeof window === 'undefined') {
        return position;
    }

    const maxLeft = window.innerWidth - panelSize.width - CALCULATOR_PANEL_MARGIN;
    const maxTop = window.innerHeight - panelSize.height - CALCULATOR_PANEL_MARGIN;

    return {
        left: clampValue(position.left, CALCULATOR_PANEL_MARGIN, maxLeft),
        top: clampValue(position.top, CALCULATOR_PANEL_MARGIN, maxTop),
    };
};

const clampCalculatorSize = (
    size: CalculatorSize,
    position: CalculatorPosition
): CalculatorSize => {
    if (typeof window === 'undefined') {
        return size;
    }

    const availableWidth = Math.max(220, window.innerWidth - position.left - CALCULATOR_PANEL_MARGIN);
    const availableHeight = Math.max(280, window.innerHeight - position.top - CALCULATOR_PANEL_MARGIN);
    const minWidth = Math.min(MIN_CALCULATOR_PANEL_WIDTH, availableWidth);
    const minHeight = Math.min(MIN_CALCULATOR_PANEL_HEIGHT, availableHeight);

    return {
        width: clampValue(size.width, minWidth, availableWidth),
        height: clampValue(size.height, minHeight, availableHeight),
    };
};

const applyCalculatorFunction = (name: CalculatorFunctionName, input: number): number => {
    switch (name) {
        case 'sin':
            return Math.sin(input * DEGREE_TO_RADIAN);
        case 'cos':
            return Math.cos(input * DEGREE_TO_RADIAN);
        case 'tan': {
            const radian = input * DEGREE_TO_RADIAN;
            if (Math.abs(Math.cos(radian)) < 1e-10) {
                throw new Error('tanが定義されない角度です');
            }
            return Math.tan(radian);
        }
        case 'log':
            if (input <= 0) {
                throw new Error('logは正の値で入力してください');
            }
            return Math.log10(input);
        case 'ln':
            if (input <= 0) {
                throw new Error('lnは正の値で入力してください');
            }
            return Math.log(input);
        case 'sqrt':
            if (input < 0) {
                throw new Error('平方根の中は0以上で入力してください');
            }
            return Math.sqrt(input);
    }
};

const tokenizeExpression = (expression: string): { tokens: CalculatorToken[] | null; error: string | null } => {
    const tokens: CalculatorToken[] = [];
    let index = 0;

    while (index < expression.length) {
        const char = expression[index];

        if (char === ' ') {
            index += 1;
            continue;
        }

        if (isDigit(char) || char === '.') {
            let nextIndex = index + 1;
            let hasDecimalPoint = char === '.';

            while (nextIndex < expression.length) {
                const nextChar = expression[nextIndex];
                if (isDigit(nextChar)) {
                    nextIndex += 1;
                    continue;
                }

                if (nextChar === '.' && !hasDecimalPoint) {
                    hasDecimalPoint = true;
                    nextIndex += 1;
                    continue;
                }

                break;
            }

            const rawNumber = expression.slice(index, nextIndex);
            if (rawNumber === '.') {
                return { tokens: null, error: '数字を入力してください' };
            }

            const parsed = Number.parseFloat(rawNumber);
            if (!Number.isFinite(parsed)) {
                return { tokens: null, error: '計算できません' };
            }

            tokens.push({ type: 'number', value: parsed });
            index = nextIndex;
            continue;
        }

        if (isBinaryOperator(char)) {
            tokens.push({ type: 'operator', value: char });
            index += 1;
            continue;
        }

        if (char === '(' || char === ')') {
            tokens.push({ type: 'paren', value: char });
            index += 1;
            continue;
        }

        if (char === '√') {
            tokens.push({ type: 'function', value: 'sqrt' });
            index += 1;
            continue;
        }

        if (/[a-z]/i.test(char)) {
            let nextIndex = index + 1;
            while (nextIndex < expression.length && /[a-z]/i.test(expression[nextIndex])) {
                nextIndex += 1;
            }

            const rawName = expression.slice(index, nextIndex).toLowerCase();
            if (!FUNCTION_NAMES.includes(rawName as CalculatorFunctionName)) {
                return { tokens: null, error: '計算できません' };
            }

            tokens.push({ type: 'function', value: rawName as CalculatorFunctionName });
            index = nextIndex;
            continue;
        }

        return { tokens: null, error: '計算できません' };
    }

    return { tokens, error: null };
};

class CalculatorParser {
    private index = 0;
    private readonly tokens: CalculatorToken[];

    constructor(tokens: CalculatorToken[]) {
        this.tokens = tokens;
    }

    parse(): number {
        const value = this.parseExpression();
        if (this.index < this.tokens.length) {
            throw new Error('式が不完全です');
        }
        return value;
    }

    private parseExpression(): number {
        return this.parseAdditive();
    }

    private parseAdditive(): number {
        let value = this.parseMultiplicative();

        while (true) {
            const token = this.peek();
            if (token?.type !== 'operator' || (token.value !== '+' && token.value !== '-')) {
                return value;
            }

            this.index += 1;
            const nextValue = this.parseMultiplicative();
            value = token.value === '+' ? value + nextValue : value - nextValue;
        }
    }

    private parseMultiplicative(): number {
        let value = this.parsePower();

        while (true) {
            const token = this.peek();
            if (token?.type !== 'operator' || (token.value !== '×' && token.value !== '÷')) {
                return value;
            }

            this.index += 1;
            const nextValue = this.parsePower();
            if (token.value === '÷' && nextValue === 0) {
                throw new Error('0で割れません');
            }

            value = token.value === '×' ? value * nextValue : value / nextValue;
        }
    }

    private parsePower(): number {
        const value = this.parseUnary();
        const token = this.peek();
        if (token?.type !== 'operator' || token.value !== '^') {
            return value;
        }

        this.index += 1;
        const exponent = this.parsePower();
        const result = Math.pow(value, exponent);
        if (!Number.isFinite(result)) {
            throw new Error('計算できません');
        }

        return result;
    }

    private parseUnary(): number {
        const token = this.peek();
        if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
            this.index += 1;
            const value = this.parseUnary();
            return token.value === '-' ? -value : value;
        }

        return this.parsePrimary();
    }

    private parsePrimary(): number {
        const token = this.peek();
        if (!token) {
            throw new Error('式が不完全です');
        }

        if (token.type === 'number') {
            this.index += 1;
            return token.value;
        }

        if (token.type === 'function') {
            this.index += 1;
            this.expectParen('(');
            const value = this.parseExpression();
            this.expectParen(')');
            return applyCalculatorFunction(token.value, value);
        }

        if (token.type === 'paren' && token.value === '(') {
            this.index += 1;
            const value = this.parseExpression();
            this.expectParen(')');
            return value;
        }

        throw new Error('計算できません');
    }

    private expectParen(expected: '(' | ')') {
        const token = this.peek();
        if (token?.type === 'paren' && token.value === expected) {
            this.index += 1;
            return;
        }

        throw new Error(expected === ')' ? '括弧が閉じられていません' : '式が不完全です');
    }

    private peek(): CalculatorToken | undefined {
        return this.tokens[this.index];
    }
}

const evaluateExpression = (expression: string): { result: number | null; error: string | null } => {
    const trimmed = expression.trim();
    if (trimmed.length === 0) {
        return { result: null, error: '式が不完全です' };
    }

    const { tokens, error } = tokenizeExpression(trimmed);
    if (error || !tokens) {
        return { result: null, error: error ?? '計算できません' };
    }

    try {
        const parser = new CalculatorParser(tokens);
        const result = parser.parse();
        if (!Number.isFinite(result)) {
            return { result: null, error: '計算できません' };
        }

        return { result, error: null };
    } catch (parserError) {
        if (parserError instanceof Error && parserError.message.trim().length > 0) {
            return { result: null, error: parserError.message };
        }

        return { result: null, error: '計算できません' };
    }
};

export const SessionToolsLauncher: React.FC = () => {
    const menuId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const toolButtonRef = useRef<HTMLButtonElement>(null);
    const calculatorMenuItemRef = useRef<HTMLButtonElement>(null);
    const calculatorPanelRef = useRef<HTMLElement>(null);
    const dragPointerIdRef = useRef<number | null>(null);
    const dragOffsetRef = useRef({ x: 0, y: 0 });
    const resizePointerIdRef = useRef<number | null>(null);
    const resizeStartPointRef = useRef({ x: 0, y: 0 });
    const resizeStartSizeRef = useRef<CalculatorSize>({ width: BASE_CALCULATOR_PANEL_WIDTH, height: BASE_CALCULATOR_PANEL_HEIGHT });
    const resizeStartPositionRef = useRef<CalculatorPosition>({ left: CALCULATOR_PANEL_MARGIN, top: CALCULATOR_PANEL_MARGIN });
    const displayRef = useRef<HTMLDivElement>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
    const [expression, setExpression] = useState('');
    const [lastResult, setLastResult] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [hasJustEvaluated, setHasJustEvaluated] = useState(false);
    const [calculatorPosition, setCalculatorPosition] = useState<CalculatorPosition | null>(null);
    const [calculatorSize, setCalculatorSize] = useState<CalculatorSize>({
        width: BASE_CALCULATOR_PANEL_WIDTH,
        height: BASE_CALCULATOR_PANEL_HEIGHT,
    });

    const focusToolButton = useCallback(() => {
        window.requestAnimationFrame(() => {
            toolButtonRef.current?.focus();
        });
    }, []);

    const focusCalculatorDisplay = useCallback(() => {
        window.requestAnimationFrame(() => {
            displayRef.current?.focus();
        });
    }, []);

    const clearErrorState = useCallback(() => {
        setErrorMessage(null);
        setHasJustEvaluated(false);
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

    const toggleSign = useCallback(() => {
        const baseExpression = errorMessage
            ? (lastResult ?? '')
            : hasJustEvaluated
                ? (lastResult ?? expression)
                : expression;

        if (baseExpression === '') {
            setExpression('-');
            clearErrorState();
            return;
        }

        const range = findTrailingNumberRange(baseExpression);
        if (!range) {
            if (baseExpression === '-') {
                setExpression('');
                clearErrorState();
            }
            return;
        }

        const segment = baseExpression.slice(range.start, range.end);
        const nextSegment = segment.startsWith('-') ? segment.slice(1) : `-${segment}`;
        setExpression(`${baseExpression.slice(0, range.start)}${nextSegment}`);
        clearErrorState();
    }, [clearErrorState, errorMessage, expression, hasJustEvaluated, lastResult]);

    const applyPercent = useCallback(() => {
        const baseExpression = errorMessage
            ? (lastResult ?? '')
            : hasJustEvaluated
                ? (lastResult ?? expression)
                : expression;

        const range = findTrailingNumberRange(baseExpression);
        if (!range) {
            return;
        }

        const segment = baseExpression.slice(range.start, range.end);
        setExpression(`${baseExpression.slice(0, range.start)}(${segment}÷100)`);
        clearErrorState();
    }, [clearErrorState, errorMessage, expression, hasJustEvaluated, lastResult]);

    const insertDigit = useCallback((digit: string) => {
        let baseExpression = errorMessage ? '' : hasJustEvaluated ? '' : expression;
        if (getLastChar(baseExpression) === ')') {
            baseExpression = `${baseExpression}×`;
        }

        setExpression(`${baseExpression}${digit}`);
        clearErrorState();
    }, [clearErrorState, errorMessage, expression, hasJustEvaluated]);

    const insertDecimalPoint = useCallback(() => {
        let baseExpression = errorMessage ? '' : hasJustEvaluated ? '' : expression;
        const lastChar = getLastChar(baseExpression);

        if (lastChar === ')') {
            baseExpression = `${baseExpression}×0`;
        } else if (baseExpression === '' || lastChar === '(' || (lastChar !== null && isBinaryOperator(lastChar))) {
            baseExpression = `${baseExpression}0`;
        }

        const segment = getCurrentNumberSegment(baseExpression);
        if (segment.includes('.')) {
            return;
        }

        setExpression(`${baseExpression}.`);
        clearErrorState();
    }, [clearErrorState, errorMessage, expression, hasJustEvaluated]);

    const insertBinaryOperator = useCallback((operator: CalculatorBinaryOperator) => {
        let baseExpression = errorMessage
            ? (lastResult ?? '')
            : hasJustEvaluated
                ? (lastResult ?? expression)
                : expression;

        if (baseExpression === '') {
            if (operator === '-') {
                setExpression('-');
                clearErrorState();
            }
            return;
        }

        const lastChar = getLastChar(baseExpression);
        if (lastChar === '(') {
            if (operator === '-') {
                setExpression(`${baseExpression}-`);
                clearErrorState();
            }
            return;
        }

        if (hasTrailingUnaryMinus(baseExpression)) {
            if (operator === '-') {
                return;
            }

            baseExpression = `${baseExpression.slice(0, -2)}${operator}`;
            setExpression(baseExpression);
            clearErrorState();
            return;
        }

        if (lastChar !== null && isBinaryOperator(lastChar)) {
            if (operator === '-') {
                baseExpression = `${baseExpression}-`;
            } else {
                baseExpression = `${baseExpression.slice(0, -1)}${operator}`;
            }
        } else {
            baseExpression = `${baseExpression}${operator}`;
        }

        setExpression(baseExpression);
        clearErrorState();
    }, [clearErrorState, errorMessage, expression, hasJustEvaluated, lastResult]);

    const insertOpenParen = useCallback(() => {
        const baseExpression = errorMessage ? '' : hasJustEvaluated ? '' : expression;

        if (baseExpression === '') {
            setExpression('(');
            clearErrorState();
            return;
        }

        const lastChar = getLastChar(baseExpression);
        if (canExpressionEndWithValue(baseExpression)) {
            setExpression(`${baseExpression}×(`);
            clearErrorState();
            return;
        }

        if (lastChar === '(' || (lastChar !== null && isBinaryOperator(lastChar))) {
            setExpression(`${baseExpression}(`);
            clearErrorState();
        }
    }, [clearErrorState, errorMessage, expression, hasJustEvaluated]);

    const insertCloseParen = useCallback(() => {
        const baseExpression = errorMessage ? '' : expression;
        if (baseExpression === '') {
            return;
        }

        if (!canExpressionEndWithValue(baseExpression)) {
            return;
        }

        if (countOpenParentheses(baseExpression) <= 0) {
            return;
        }

        setExpression(`${baseExpression})`);
        clearErrorState();
    }, [clearErrorState, errorMessage, expression]);

    const insertPrefixFunction = useCallback((functionName: CalculatorFunctionName) => {
        if (hasJustEvaluated && !errorMessage && lastResult) {
            setExpression(`${functionName}(${lastResult})`);
            clearErrorState();
            return;
        }

        let baseExpression = errorMessage ? '' : expression;
        if (baseExpression === '') {
            setExpression(`${functionName}(`);
            clearErrorState();
            return;
        }

        if (canExpressionEndWithValue(baseExpression)) {
            const range = findTrailingWrappedValueRange(baseExpression);
            if (!range) {
                return;
            }

            const operand = baseExpression.slice(range.start, range.end);
            setExpression(`${baseExpression.slice(0, range.start)}${functionName}(${operand})`);
            clearErrorState();
            return;
        }

        const lastChar = getLastChar(baseExpression);
        if (lastChar === '(' || (lastChar !== null && isBinaryOperator(lastChar))) {
            baseExpression = `${baseExpression}${functionName}(`;
        } else {
            return;
        }

        setExpression(baseExpression);
        clearErrorState();
    }, [clearErrorState, errorMessage, expression, hasJustEvaluated, lastResult]);

    const appendPostfixExpression = useCallback((value: string) => {
        const baseExpression = errorMessage
            ? (lastResult ?? '')
            : hasJustEvaluated
                ? (lastResult ?? expression)
                : expression;

        if (!canExpressionEndWithValue(baseExpression)) {
            return;
        }

        setExpression(`${baseExpression}${value}`);
        clearErrorState();
    }, [clearErrorState, errorMessage, expression, hasJustEvaluated, lastResult]);

    const handleBackspace = useCallback(() => {
        setExpression((prevExpression) => removeTrailingExpressionUnit(prevExpression));
        clearErrorState();
    }, [clearErrorState]);

    const handleEvaluate = useCallback(() => {
        const trimmedExpression = expression.trim();
        if (trimmedExpression.length === 0 || !canExpressionEndWithValue(trimmedExpression)) {
            return;
        }

        const { result, error } = evaluateExpression(getAutoClosedExpression(trimmedExpression));
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

        const normalizedInput = normalizeOperatorInput(event.key);
        if (!normalizedInput) {
            return;
        }

        event.preventDefault();

        if (isDigit(normalizedInput)) {
            insertDigit(normalizedInput);
            return;
        }

        if (normalizedInput === '.') {
            insertDecimalPoint();
            return;
        }

        if (normalizedInput === '(') {
            insertOpenParen();
            return;
        }

        if (normalizedInput === ')') {
            insertCloseParen();
            return;
        }

        if (isBinaryOperator(normalizedInput)) {
            insertBinaryOperator(normalizedInput);
        }
    }, [handleBackspace, handleEvaluate, insertBinaryOperator, insertCloseParen, insertDecimalPoint, insertDigit, insertOpenParen]);

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

    const handleCalculatorHeaderPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('button')) {
            return;
        }

        const panelElement = calculatorPanelRef.current;
        if (!panelElement) {
            return;
        }

        const panelRect = panelElement.getBoundingClientRect();
        const panelSize = { width: panelRect.width, height: panelRect.height };
        dragPointerIdRef.current = event.pointerId;
        dragOffsetRef.current = {
            x: event.clientX - panelRect.left,
            y: event.clientY - panelRect.top,
        };

        const headerElement = event.currentTarget;
        headerElement.setPointerCapture(event.pointerId);
        document.body.classList.add('is-dragging-session-calculator');

        const handlePointerMove = (moveEvent: PointerEvent) => {
            if (dragPointerIdRef.current !== moveEvent.pointerId) {
                return;
            }

            const nextPosition = clampCalculatorPosition({
                left: moveEvent.clientX - dragOffsetRef.current.x,
                top: moveEvent.clientY - dragOffsetRef.current.y,
            }, panelSize);

            setCalculatorPosition(nextPosition);
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
            if (dragPointerIdRef.current !== upEvent.pointerId) {
                return;
            }

            dragPointerIdRef.current = null;
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            document.body.classList.remove('is-dragging-session-calculator');

            if (headerElement.hasPointerCapture(event.pointerId)) {
                headerElement.releasePointerCapture(event.pointerId);
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
    }, []);

    const handleCalculatorResizePointerDown = useCallback((
        direction: CalculatorResizeDirection,
        event: React.PointerEvent<HTMLButtonElement>
    ) => {
        event.preventDefault();
        event.stopPropagation();

        const panelElement = calculatorPanelRef.current;
        if (!panelElement) {
            return;
        }

        const panelRect = panelElement.getBoundingClientRect();
        const anchoredPosition = calculatorPosition ?? { left: panelRect.left, top: panelRect.top };
        const startSize = { width: panelRect.width, height: panelRect.height };

        resizePointerIdRef.current = event.pointerId;
        resizeStartPointRef.current = { x: event.clientX, y: event.clientY };
        resizeStartSizeRef.current = startSize;
        resizeStartPositionRef.current = anchoredPosition;

        setCalculatorPosition(anchoredPosition);
        setCalculatorSize(startSize);

        const handleElement = event.currentTarget;
        handleElement.setPointerCapture(event.pointerId);
        document.body.classList.add('is-resizing-session-calculator');

        const handlePointerMove = (moveEvent: PointerEvent) => {
            if (resizePointerIdRef.current !== moveEvent.pointerId) {
                return;
            }

            const deltaX = moveEvent.clientX - resizeStartPointRef.current.x;
            const deltaY = moveEvent.clientY - resizeStartPointRef.current.y;

            const nextSize = clampCalculatorSize({
                width: resizeStartSizeRef.current.width + (direction === 'right' || direction === 'corner' ? deltaX : 0),
                height: resizeStartSizeRef.current.height + (direction === 'bottom' || direction === 'corner' ? deltaY : 0),
            }, resizeStartPositionRef.current);

            setCalculatorSize(nextSize);
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
            if (resizePointerIdRef.current !== upEvent.pointerId) {
                return;
            }

            resizePointerIdRef.current = null;
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            document.body.classList.remove('is-resizing-session-calculator');

            if (handleElement.hasPointerCapture(event.pointerId)) {
                handleElement.releasePointerCapture(event.pointerId);
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
    }, [calculatorPosition]);

    const handleCalculatorButtonClick = useCallback((button: CalculatorButton) => {
        switch (button.action) {
            case 'digit':
                if (button.value) {
                    insertDigit(button.value);
                }
                break;
            case 'decimal':
                insertDecimalPoint();
                break;
            case 'operator':
                if (button.value && isBinaryOperator(button.value)) {
                    insertBinaryOperator(button.value);
                }
                break;
            case 'openParen':
                insertOpenParen();
                break;
            case 'closeParen':
                insertCloseParen();
                break;
            case 'clear':
                resetCalculator();
                break;
            case 'backspace':
                handleBackspace();
                break;
            case 'toggleSign':
                toggleSign();
                break;
            case 'percent':
                applyPercent();
                break;
            case 'equals':
                handleEvaluate();
                break;
            case 'prefixFunction':
                if (button.functionName) {
                    insertPrefixFunction(button.functionName);
                }
                break;
            case 'postfixAppend':
                if (button.value) {
                    appendPostfixExpression(button.value);
                }
                break;
        }

        focusCalculatorDisplay();
    }, [
        appendPostfixExpression,
        focusCalculatorDisplay,
        handleBackspace,
        handleEvaluate,
        insertBinaryOperator,
        insertCloseParen,
        insertDecimalPoint,
        insertDigit,
        insertOpenParen,
        insertPrefixFunction,
        resetCalculator,
        toggleSign,
        applyPercent,
    ]);

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
        if (!isCalculatorOpen) {
            return;
        }

        const handleResize = () => {
            const panelElement = calculatorPanelRef.current;
            if (!panelElement) {
                return;
            }

            const rect = panelElement.getBoundingClientRect();
            const currentPosition = calculatorPosition ?? getDefaultCalculatorPosition(calculatorSize);
            const nextSize = clampCalculatorSize(calculatorSize, currentPosition);
            const sizeForPosition = nextSize ?? { width: rect.width, height: rect.height };
            const nextPosition = calculatorPosition
                ? clampCalculatorPosition(calculatorPosition, sizeForPosition)
                : null;

            setCalculatorSize(nextSize);

            if (nextPosition) {
                setCalculatorPosition(nextPosition);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [calculatorPosition, calculatorSize, isCalculatorOpen]);

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

    const clearButtonLabel = useMemo(() => (
        expression.length > 0 || errorMessage !== null || lastResult !== null || hasJustEvaluated
            ? 'C'
            : 'AC'
    ), [errorMessage, expression.length, hasJustEvaluated, lastResult]);

    const calculatorDigitUtilityKeys = useMemo<CalculatorButton[]>(() => [
        { label: '⌫', action: 'backspace', variant: 'utility' },
        { label: clearButtonLabel, action: 'clear', variant: 'utility' },
        { label: '%', action: 'percent', variant: 'utility' },
    ], [clearButtonLabel]);

    const calculatorDisplayState = useMemo(() => {
        if (errorMessage) {
            return {
                mainText: errorMessage,
                ghostText: '',
            };
        }

        if (expression.length === 0) {
            return {
                mainText: '0',
                ghostText: '',
            };
        }

        return {
            mainText: formatExpressionForDisplay(expression),
            ghostText: ')'.repeat(countOpenParentheses(expression)),
        };
    }, [errorMessage, expression]);

    const provisionalCalculatorPosition = useMemo(
        () => calculatorPosition ?? getDefaultCalculatorPosition(calculatorSize),
        [calculatorPosition, calculatorSize]
    );
    const renderedCalculatorSize = useMemo(
        () => clampCalculatorSize(calculatorSize, provisionalCalculatorPosition),
        [calculatorSize, provisionalCalculatorPosition]
    );
    const renderedCalculatorPosition = useMemo(
        () => calculatorPosition
            ? clampCalculatorPosition(calculatorPosition, renderedCalculatorSize)
            : getDefaultCalculatorPosition(renderedCalculatorSize),
        [calculatorPosition, renderedCalculatorSize]
    );
    const calculatorScale = useMemo(
        () => Math.min(
            renderedCalculatorSize.width / BASE_CALCULATOR_PANEL_WIDTH,
            renderedCalculatorSize.height / BASE_CALCULATOR_PANEL_HEIGHT
        ),
        [renderedCalculatorSize.height, renderedCalculatorSize.width]
    );
    const calculatorPanelStyle = useMemo<React.CSSProperties>(() => ({
        left: `${renderedCalculatorPosition.left}px`,
        top: `${renderedCalculatorPosition.top}px`,
        width: `${renderedCalculatorSize.width}px`,
        height: `${renderedCalculatorSize.height}px`,
        [CALCULATOR_SCALE_STYLE_KEY]: calculatorScale.toString(),
    }), [calculatorScale, renderedCalculatorPosition.left, renderedCalculatorPosition.top, renderedCalculatorSize.height, renderedCalculatorSize.width]);

    const renderCalculatorButton = useCallback((button: CalculatorButton) => (
        <button
            key={`${button.action}-${button.label}`}
            type="button"
            className={`session-calculator-key ${button.variant ?? 'default'} ${button.span ?? ''}`.trim()}
            onMouseDown={handleCalculatorButtonMouseDown}
            onClick={() => handleCalculatorButtonClick(button)}
        >
            {button.label}
        </button>
    ), [handleCalculatorButtonClick, handleCalculatorButtonMouseDown]);

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
                    ref={calculatorPanelRef}
                    className="session-calculator-panel"
                    role="dialog"
                    aria-label="電卓"
                    onKeyDown={handleCalculatorKeyDown}
                    style={calculatorPanelStyle}
                >
                    <div
                        className="session-calculator-header"
                        onPointerDown={handleCalculatorHeaderPointerDown}
                    >
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
                        <div
                            ref={displayRef}
                            className={`session-calculator-display ${errorMessage ? 'has-error' : ''}`}
                            role="textbox"
                            aria-readonly="true"
                            aria-label="電卓の表示"
                            aria-valuetext={`${calculatorDisplayState.mainText}${calculatorDisplayState.ghostText}`}
                            tabIndex={0}
                        >
                            <span className="session-calculator-display-text">
                                {calculatorDisplayState.mainText}
                            </span>
                            {calculatorDisplayState.ghostText && (
                                <span className="session-calculator-display-ghost" aria-hidden="true">
                                    {calculatorDisplayState.ghostText}
                                </span>
                            )}
                        </div>

                        <div className="session-calculator-toolbar">
                            <div className="session-calculator-scientific-grid">
                                {CALCULATOR_SCIENTIFIC_KEYS.map(renderCalculatorButton)}
                            </div>
                        </div>

                        <div className="session-calculator-main-layout">
                            <div className="session-calculator-digit-area">
                                <div className="session-calculator-utility-grid">
                                    {calculatorDigitUtilityKeys.map(renderCalculatorButton)}
                                </div>
                                <div className="session-calculator-main-grid">
                                    {CALCULATOR_DIGIT_KEYS.map(renderCalculatorButton)}
                                </div>
                            </div>
                            <div className="session-calculator-operator-column">
                                {CALCULATOR_OPERATOR_KEYS.map(renderCalculatorButton)}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="session-calculator-resize-handle right"
                        aria-label="電卓の幅を調整"
                        title="左右にドラッグして幅を調整"
                        onPointerDown={(event) => handleCalculatorResizePointerDown('right', event)}
                    />
                    <button
                        type="button"
                        className="session-calculator-resize-handle bottom"
                        aria-label="電卓の高さを調整"
                        title="上下にドラッグして高さを調整"
                        onPointerDown={(event) => handleCalculatorResizePointerDown('bottom', event)}
                    />
                    <button
                        type="button"
                        className="session-calculator-resize-handle corner"
                        aria-label="電卓の大きさを調整"
                        title="斜めにドラッグして大きさを調整"
                        onPointerDown={(event) => handleCalculatorResizePointerDown('corner', event)}
                    />
                </section>
            )}
        </div>
    );
};
