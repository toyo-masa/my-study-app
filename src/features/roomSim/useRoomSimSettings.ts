import { useState } from 'react';
import { defaultRoomSimSettings, loadRoomSimSettings, saveRoomSimSettings } from './storage';
import type { RoomSimSettings } from './types';

type RoomSimSettingsState = {
    settings: RoomSimSettings;
    settingsSaveStatus: string;
};

export function useRoomSimSettings() {
    const [settingsState, setSettingsState] = useState<RoomSimSettingsState>(() => {
        const settings = loadRoomSimSettings();
        const saved = saveRoomSimSettings(settings);

        return {
            settings,
            settingsSaveStatus: saved ? '表示設定を保存済み' : '表示設定の保存に失敗しました',
        };
    });
    const settings = settingsState.settings;
    const settingsSaveStatus = settingsState.settingsSaveStatus;

    const commitSettings = (updater: (current: RoomSimSettings) => RoomSimSettings) => {
        setSettingsState((current) => {
            const nextSettings = updater(current.settings);
            const saved = saveRoomSimSettings(nextSettings);

            return {
                settings: nextSettings,
                settingsSaveStatus: saved ? '表示設定を保存済み' : '表示設定の保存に失敗しました',
            };
        });
    };

    const updateSettings = <K extends keyof RoomSimSettings>(key: K, value: RoomSimSettings[K]) => {
        commitSettings((current) => ({
            ...current,
            [key]: value,
        }));
    };

    const resetSettings = () => {
        commitSettings(() => ({ ...defaultRoomSimSettings }));
    };

    return {
        settings,
        settingsSaveStatus,
        updateSettings,
        resetSettings,
    };
}
