import React, { useMemo } from 'react';
import { Check, Copy, LoaderCircle } from 'lucide-react';
import { MarkdownText } from './MarkdownText';
import {
    parseAssistantMessageContent,
    parseAssistantMessageSegments,
} from '../utils/webLlmBudgetedGeneration';

export type LlmRenderableMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    generationDurationMs?: number;
};

type LocalLlmMessageItemProps = {
    message: LlmRenderableMessage;
    isCopied: boolean;
    onCopy: (message: LlmRenderableMessage) => void;
    streamingLabel?: string;
};

const getCopyableAssistantContent = (content: string) => {
    const answerContent = parseAssistantMessageContent(content).answerContent.trim();
    return answerContent.length > 0 ? answerContent : content.trim();
};

const getCopyableMessageContent = (message: LlmRenderableMessage) => {
    return message.role === 'assistant'
        ? getCopyableAssistantContent(message.content)
        : message.content.trim();
};

const formatGenerationDuration = (durationMs: number) => {
    const seconds = durationMs / 1000;
    if (seconds < 10) {
        return `思考時間 ${seconds.toFixed(1)}秒`;
    }
    if (seconds < 60) {
        return `思考時間 ${Math.round(seconds)}秒`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `思考時間 ${minutes}分${remainingSeconds}秒`;
};

export const LocalLlmMessageItem: React.FC<LocalLlmMessageItemProps> = React.memo(({
    message,
    isCopied,
    onCopy,
    streamingLabel,
}) => {
    const parsedAssistantMessageSegments = useMemo(() => {
        if (message.role !== 'assistant') {
            return null;
        }
        return parseAssistantMessageSegments(message.content);
    }, [message.content, message.role]);

    const copyableContent = useMemo(() => getCopyableMessageContent(message), [message]);

    return (
        <div className={`local-llm-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}>
            <div className="local-llm-message-role">
                {message.role === 'user' ? 'You' : 'Local LLM'}
            </div>
            <div className={`local-llm-message-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                {message.role === 'assistant' ? (
                    <div className="local-llm-assistant-stack">
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
                                    <MarkdownText
                                        key={`${message.id}-answer-${index}`}
                                        content={segment.content}
                                        className={`local-llm-markdown ${message.isStreaming ? 'local-llm-streaming-text' : ''}`}
                                    />
                                )
                        ))}
                    </div>
                ) : (
                    <div className="local-llm-plain-text">{message.content}</div>
                )}
                {message.isStreaming && streamingLabel && (
                    <span className="local-llm-streaming-indicator">
                        <LoaderCircle size={14} className="spin" />
                        {streamingLabel}
                    </span>
                )}
            </div>
            <div className="local-llm-message-footer">
                <div className="local-llm-message-meta">
                    {message.role === 'assistant' && !message.isStreaming && typeof message.generationDurationMs === 'number' && message.generationDurationMs > 0 && (
                        <span>{formatGenerationDuration(message.generationDurationMs)}</span>
                    )}
                </div>
                <div className="local-llm-message-actions">
                    <button
                        type="button"
                        className={`local-llm-thread-overlay-action local-llm-tooltip-target local-llm-mini-btn ${isCopied ? 'is-active' : ''}`}
                        onClick={() => { onCopy(message); }}
                        disabled={copyableContent.length === 0}
                        aria-label={isCopied
                            ? 'コピーしました'
                            : (message.role === 'assistant' ? '回答内容をコピー' : '質問内容をコピー')}
                        data-tooltip={isCopied
                            ? 'コピーしました'
                            : (message.role === 'assistant' ? '回答内容をコピー' : '質問内容をコピー')}
                    >
                        {isCopied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                </div>
            </div>
        </div>
    );
}, (prevProps, nextProps) => (
    prevProps.message === nextProps.message
    && prevProps.isCopied === nextProps.isCopied
    && prevProps.streamingLabel === nextProps.streamingLabel
));
