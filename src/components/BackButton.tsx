import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

type BackButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    label?: ReactNode;
    iconSize?: number;
};

export function BackButton({ label = '戻る', iconSize = 16, children, ...buttonProps }: BackButtonProps) {
    return (
        <button {...buttonProps}>
            <ArrowLeft size={iconSize} /> {children ?? label}
        </button>
    );
}

