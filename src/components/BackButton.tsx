import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

type BackButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    label?: ReactNode;
    iconSize?: number;
};

export const BackButton = forwardRef<HTMLButtonElement, BackButtonProps>(
    ({ label = '戻る', iconSize = 16, children, ...buttonProps }, ref) => {
        return (
            <button ref={ref} {...buttonProps}>
                <ArrowLeft size={iconSize} /> {children ?? label}
            </button>
        );
    }
);

BackButton.displayName = 'BackButton';
