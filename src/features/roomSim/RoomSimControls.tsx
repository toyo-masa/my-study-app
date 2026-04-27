import { Camera, Eye, Moon, PanelRight, RotateCcw, Save, Sun } from 'lucide-react';
import { cameraPresets } from './cameraPresets';
import type { CameraMode, LightingMode, RoomSimSettings } from './types';

type RoomSimControlsProps = {
    settings: RoomSimSettings;
    settingsSaveStatus: string;
    onSettingChange: <K extends keyof RoomSimSettings>(key: K, value: RoomSimSettings[K]) => void;
    onResetSettings: () => void;
    onResetFurniture: () => void;
    onScreenshot: () => void;
};

export function RoomSimControls({
    settings,
    settingsSaveStatus,
    onSettingChange,
    onResetSettings,
    onResetFurniture,
    onScreenshot,
}: RoomSimControlsProps) {
    const handleViewModeChange = (viewMode: CameraMode) => {
        onSettingChange('viewMode', viewMode);
        onSettingChange('showRoomLabels', viewMode === 'overview');
        onSettingChange('activeCameraPresetId', viewMode === 'overview' ? 'overview' : 'entrance-to-ldk');
    };

    const handleLightingModeChange = (lightingMode: LightingMode) => {
        onSettingChange('lightingMode', lightingMode);
    };

    return (
        <section className="room-sim-panel-section">
            <div className="room-sim-panel-heading">
                <Eye size={16} />
                <h2>基本操作</h2>
            </div>

            <div className="room-sim-segmented" aria-label="視点モード">
                <button
                    type="button"
                    className={settings.viewMode === 'overview' ? 'is-active' : ''}
                    onClick={() => handleViewModeChange('overview')}
                >
                    俯瞰
                </button>
                <button
                    type="button"
                    className={settings.viewMode === 'walkthrough' ? 'is-active' : ''}
                    onClick={() => handleViewModeChange('walkthrough')}
                >
                    内覧
                </button>
            </div>

            <div className="room-sim-control-group">
                <label className="room-sim-field-label" htmlFor="room-sim-camera-preset">
                    プリセット視点
                </label>
                <select
                    id="room-sim-camera-preset"
                    className="room-sim-select"
                    value={settings.activeCameraPresetId}
                    onChange={(event) => {
                        const preset = cameraPresets.find((item) => item.id === event.target.value);
                        if (!preset) {
                            return;
                        }
                        onSettingChange('activeCameraPresetId', preset.id);
                        onSettingChange('viewMode', preset.mode);
                        onSettingChange('showRoomLabels', preset.mode === 'overview');
                    }}
                >
                    {cameraPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                            {preset.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="room-sim-toggle-grid">
                <label className="room-sim-check-label">
                    <input
                        type="checkbox"
                        checked={settings.furnitureVisible}
                        onChange={(event) => onSettingChange('furnitureVisible', event.target.checked)}
                    />
                    家具表示
                </label>
                <label className="room-sim-check-label">
                    <input
                        type="checkbox"
                        checked={settings.transparentWalls}
                        onChange={(event) => onSettingChange('transparentWalls', event.target.checked)}
                    />
                    壁を透過
                </label>
                <label className="room-sim-check-label">
                    <input
                        type="checkbox"
                        checked={settings.showRoomLabels}
                        onChange={(event) => onSettingChange('showRoomLabels', event.target.checked)}
                    />
                    部屋名表示
                </label>
            </div>

            <div className="room-sim-segmented" aria-label="昼夜切り替え">
                <button
                    type="button"
                    className={settings.lightingMode === 'day' ? 'is-active' : ''}
                    onClick={() => handleLightingModeChange('day')}
                >
                    <Sun size={15} />
                    昼
                </button>
                <button
                    type="button"
                    className={settings.lightingMode === 'night' ? 'is-active' : ''}
                    onClick={() => handleLightingModeChange('night')}
                >
                    <Moon size={15} />
                    夜
                </button>
            </div>

            <div className="room-sim-control-group">
                <label className="room-sim-field-label" htmlFor="room-sim-eye-height">
                    目線高さ {settings.eyeHeight.toFixed(2)}m
                </label>
                <input
                    id="room-sim-eye-height"
                    type="range"
                    min="1.2"
                    max="1.8"
                    step="0.05"
                    value={settings.eyeHeight}
                    onChange={(event) => onSettingChange('eyeHeight', Number(event.target.value))}
                />
            </div>

            <div className="room-sim-action-grid">
                <button type="button" className="room-sim-secondary-btn" onClick={onScreenshot}>
                    <Camera size={15} />
                    スクリーンショット
                </button>
                <button type="button" className="room-sim-secondary-btn" onClick={onResetSettings}>
                    <PanelRight size={15} />
                    表示リセット
                </button>
                <button type="button" className="room-sim-secondary-btn" onClick={onResetFurniture}>
                    <RotateCcw size={15} />
                    初期配置
                </button>
            </div>

            <p className="room-sim-save-status">
                <Save size={14} />
                {settingsSaveStatus}
            </p>
        </section>
    );
}
