import { useEffect, useState } from 'react';
import { Home } from 'lucide-react';
import { BackButton } from '../../components/BackButton';
import { FurnitureControls } from './FurnitureControls';
import { FurnitureStyleControls } from './FurnitureStyleControls';
import { RoomScene } from './RoomScene';
import { RoomSimControls } from './RoomSimControls';
import { saveRoomSimScreenshot } from './screenshot';
import { useFurnitureLayout } from './useFurnitureLayout';
import { useFurnitureSelection } from './useFurnitureSelection';
import { useRoomSimSettings } from './useRoomSimSettings';
import type { FurnitureCategory, FurnitureStyle } from './types';

type RoomSimPageProps = {
    onBack: () => void;
};

const approximationNotice = 'この3D内覧は図面をもとにした近似再現です。寸法・素材・眺望・家具配置は実際と異なる場合があります。';

function isEditableElement(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

export function RoomSimPage({ onBack }: RoomSimPageProps) {
    const {
        furniture,
        layoutSaveStatus,
        moveFurniture,
        rotateFurniture,
        setFurnitureRotation,
        addFurniture,
        deleteFurniture,
        resetFurniture,
        applyGlobalStyle,
        updateFurnitureDesign,
        updateFurnitureRenderMode,
        toggleFurnitureVisibility,
    } = useFurnitureLayout();
    const {
        selectedFurnitureId,
        selectedFurniture,
        setSelectedFurnitureId,
        clearSelection,
    } = useFurnitureSelection(furniture);
    const {
        settings,
        settingsSaveStatus,
        updateSettings,
        resetSettings,
    } = useRoomSimSettings();
    const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
    const [screenshotStatus, setScreenshotStatus] = useState<string | null>(null);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableElement(event.target)) {
                return;
            }

            if (event.key === 'Escape') {
                clearSelection();
                return;
            }

            if (!selectedFurnitureId) {
                return;
            }

            if (event.key.toLowerCase() === 'r') {
                event.preventDefault();
                rotateFurniture(selectedFurnitureId, 90);
            }

            if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                const targetFurniture = furniture.find((item) => item.id === selectedFurnitureId);
                const confirmed = window.confirm(`「${targetFurniture?.name ?? '選択中の家具'}」を削除しますか？`);
                if (confirmed) {
                    deleteFurniture(selectedFurnitureId);
                    clearSelection();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [clearSelection, deleteFurniture, furniture, rotateFurniture, selectedFurnitureId]);

    const handleAddFurniture = (category: FurnitureCategory, style: FurnitureStyle) => {
        const id = addFurniture(category, style);
        setSelectedFurnitureId(id);
    };

    const handleDeleteFurniture = (id: string) => {
        deleteFurniture(id);
        if (selectedFurnitureId === id) {
            clearSelection();
        }
    };

    const handleResetFurniture = () => {
        resetFurniture();
        clearSelection();
    };

    const handleGlobalStyleChange = (style: FurnitureStyle) => {
        updateSettings('globalStyle', style);
        applyGlobalStyle(style);
    };

    const handleScreenshot = () => {
        setScreenshotStatus(saveRoomSimScreenshot(canvasElement));
    };

    return (
        <main className="content-area room-sim-page">
            <div className="room-sim-header-row">
                <BackButton className="nav-btn" onClick={onBack} label="ホームへ戻る" />
                <div className="room-sim-title-block">
                    <div className="room-sim-title-icon">
                        <Home size={20} />
                    </div>
                    <div>
                        <h1>3D内覧シミュレーター</h1>
                        <p>図面ベースの近似住戸で、家具配置・視点・素材感を確認できます。</p>
                    </div>
                </div>
            </div>

            <div className="room-sim-workspace">
                <section className="room-sim-viewer-shell" aria-label="3D内覧ビュー">
                    <RoomScene
                        furniture={furniture}
                        selectedFurnitureId={selectedFurnitureId}
                        settings={settings}
                        onSelectFurniture={setSelectedFurnitureId}
                        onMoveFurniture={moveFurniture}
                        onCanvasReady={setCanvasElement}
                    />
                    <div className="room-sim-overlay-note">{approximationNotice}</div>
                </section>

                <aside className="room-sim-control-panel" aria-label="3D内覧操作パネル">
                    <RoomSimControls
                        settings={settings}
                        settingsSaveStatus={settingsSaveStatus}
                        onSettingChange={updateSettings}
                        onResetSettings={resetSettings}
                        onResetFurniture={handleResetFurniture}
                        onScreenshot={handleScreenshot}
                    />
                    <FurnitureControls
                        furniture={furniture}
                        selectedFurniture={selectedFurniture}
                        layoutSaveStatus={layoutSaveStatus}
                        globalStyle={settings.globalStyle}
                        onAddFurniture={handleAddFurniture}
                        onDeleteFurniture={handleDeleteFurniture}
                        onMoveFurniture={moveFurniture}
                        onRotateFurniture={rotateFurniture}
                        onSetFurnitureRotation={setFurnitureRotation}
                        onToggleFurnitureVisibility={toggleFurnitureVisibility}
                        onResetFurniture={handleResetFurniture}
                    />
                    <FurnitureStyleControls
                        globalStyle={settings.globalStyle}
                        selectedFurniture={selectedFurniture}
                        onGlobalStyleChange={handleGlobalStyleChange}
                        onUpdateFurnitureDesign={updateFurnitureDesign}
                        onUpdateFurnitureRenderMode={updateFurnitureRenderMode}
                    />
                    {screenshotStatus && <p className="room-sim-save-status">{screenshotStatus}</p>}
                    <p className="room-sim-notice">{approximationNotice}</p>
                </aside>
            </div>
        </main>
    );
}
