export function saveRoomSimScreenshot(canvas: HTMLCanvasElement | null): string {
    if (!canvas) {
        return 'スクリーンショット対象が見つかりませんでした。';
    }

    try {
        const imageUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const now = new Date();
        const timestamp = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
        ].join('');

        link.href = imageUrl;
        link.download = `room-sim-${timestamp}.png`;
        link.click();
        return 'スクリーンショットを保存しました。';
    } catch {
        return 'スクリーンショットの保存に失敗しました。';
    }
}
