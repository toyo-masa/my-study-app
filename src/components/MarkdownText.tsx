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
const isKatexElement = (node: React.ReactNode): boolean => {
    if (!React.isValidElement<{ className?: string }>(node)) {
        return false;
    }

    const className = node.props.className ?? '';
    return className.split(/\s+/).some((name) => name === 'katex' || name === 'katex-display');
};

const isMathOnlyParagraph = (children: React.ReactNode): boolean => {
    const nodes = React.Children.toArray(children);
    const meaningfulNodes = nodes.filter((node) => typeof node !== 'string' || node.trim().length > 0);
    return meaningfulNodes.length === 1 && isKatexElement(meaningfulNodes[0]);
};

const markdownComponents: Components = {
    p: ({ children, ...props }) => (
        <p {...props} className={isMathOnlyParagraph(children) ? 'markdown-math-only' : undefined}>
            {children}
        </p>
    ),
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
