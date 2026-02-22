import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownTextProps {
    content: string;
    className?: string;
}

const remarkPlugins = [remarkMath];
const rehypePlugins = [rehypeKatex];

export const MarkdownText: React.FC<MarkdownTextProps> = React.memo(({ content, className = '' }) => {
    return (
        <div className={`markdown-body ${className}`}>
            <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
});
