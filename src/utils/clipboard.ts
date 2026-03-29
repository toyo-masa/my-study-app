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
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';

    const activeElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const selection = document.getSelection();
    const savedRanges = selection
        ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
        : [];

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const didCopy = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (selection) {
        selection.removeAllRanges();
        savedRanges.forEach((range) => selection.addRange(range));
    }

    activeElement?.focus();

    if (!didCopy) {
        throw new Error('Clipboard copy failed');
    }
}
