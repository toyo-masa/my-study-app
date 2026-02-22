import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
}

// Ensure CSS styles in App.css are present:
// .confirmation-overlay, .confirmation-content, .confirmation-title, .confirmation-message, .confirmation-actions, .btn-cancel, .btn-delete

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmLabel = '削除する',
    cancelLabel = 'キャンセル'
}) => {
    // We render always but control visibility via CSS opacity/pointer-events for transition, 
    // OR we can conditionally render if we don't care about exit transition.
    // For simplicity with existing CSS 'open' class pattern:

    // If not open, we can still render if we want exit animation, but simpler to just return null if we didn't implement complex animation logic.
    // CSS has transition: opacity. So we should keep it in DOM but hidden?
    // The CSS .confirmation-overlay has opacity: 0 and pointer-events: none.
    // So if isOpen is false, it's hidden. 
    // However, if we unmount it, transition won't play.
    // Let's rely on isOpen prop being passed to className.

    // Note: If the parent unmounts this component, it disappears instantly.
    // Ideally we keep it mounted and toggle isOpen.

    return (
        <div className={`confirmation-overlay ${isOpen ? 'open' : ''}`}>
            <div className="confirmation-content" onClick={(e) => e.stopPropagation()}>
                <h3 className="confirmation-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={24} color="var(--error-color)" />
                    {title}
                </h3>
                <p className="confirmation-message">{message}</p>
                <div className="confirmation-actions">
                    <button className="btn-cancel" onClick={onCancel}>{cancelLabel}</button>
                    <button className="btn-delete" onClick={onConfirm}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
};
