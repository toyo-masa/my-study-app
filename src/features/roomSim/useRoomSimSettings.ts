import { useEffect, useState } from 'react';
import { defaultRoomSimSettings, loadRoomSimSettings, saveRoomSimSettings } from './storage';
import type { RoomSimSettings } from './types';

export function useRoomSimSettings() {
    const [settings, setSettings] = useState<RoomSimSettings>(() => loadRoomSimSettings());
    const settingsSaveStatus = '表示設定を保存済み';

    useEffect(() => {
        saveRoomSimSettings(settings);
    }, [settings]);

    const updateSettings = <K extends keyof RoomSimSettings>(key: K, value: RoomSimSettings[K]) => {
        setSettings((current) => ({
            ...current,
            [key]: value,
        }));
    };

    const resetSettings = () => {
        setSettings({ ...defaultRoomSimSettings });
    };

    return {
        settings,
        settingsSaveStatus,
        setSettings,
        updateSettings,
        resetSettings,
    };
}
