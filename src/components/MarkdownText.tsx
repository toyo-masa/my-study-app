import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownTextProps {
    content: string;
    className?: string;
}

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];
const markdownComponents: Components = {
    table: ({ children, ...props }) => (
        <div className="markdown-table-wrapper">
            <table {...props}>{children}</table>
        </div>
    ),
};

export const MarkdownText: React.FC<MarkdownTextProps> = React.memo(({ content, className = '' }) => {
    return (
        <div className={`markdown-body ${className}`}>
            <ReactMarkdown
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
                components={markdownComponents}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
});
