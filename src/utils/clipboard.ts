export async function copyTextToClipboard(text: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch {
            // Fallback below
        }
    }

    if (typeof document === 'undefined') {
        throw new Error('Clipboard is unavailable');
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '1';
    textarea.style.pointerEvents = 'none';
    textarea.style.contain = 'strict';
    textarea.style.whiteSpace = 'pre';
    textarea.style.fontSize = '12pt';

    const activeElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const selection = document.getSelection();
    const savedRanges = selection
        ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
        : [];

    document.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const didCopy = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (selection) {
        selection.removeAllRanges();
        savedRanges.forEach((range) => selection.addRange(range));
    }

    activeElement?.focus({ preventScroll: true });

    if (!didCopy) {
        throw new Error('Clipboard copy failed');
    }
}
