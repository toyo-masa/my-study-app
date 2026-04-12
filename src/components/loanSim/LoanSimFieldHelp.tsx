import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

type LoanSimFieldHelpProps = {
    title: string;
    ariaLabel: string;
    children: ReactNode;
};

export function LoanSimFieldHelp({ title, ariaLabel, children }: LoanSimFieldHelpProps) {
    return (
        <details className="help-popover-wrapper loan-sim-help">
            <summary className="help-icon-btn loan-sim-help-btn" aria-label={ariaLabel}>
                <HelpCircle size={14} />
            </summary>
            <div className="help-popover loan-sim-help-popover">
                <div className="help-popover-header">
                    <h4>{title}</h4>
                </div>
                <div className="help-popover-body loan-sim-help-body">{children}</div>
            </div>
        </details>
    );
}
