import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LocalLlmChat } from '../components/LocalLlmChat';
import type { LocalLlmMode, LocalLlmSettings, LocalLlmSettingsUpdater } from '../utils/settings';

interface LocalLlmChatRouteProps {
    localLlmSettings: LocalLlmSettings;
    onLocalLlmSettingsChange: (settings: LocalLlmSettingsUpdater) => void;
    onLocalLlmModeChange: (preferredMode: LocalLlmMode) => void;
    onWebLlmModelChange: (modelId: string) => void;
}

export const LocalLlmChatRoute: React.FC<LocalLlmChatRouteProps> = ({
    localLlmSettings,
    onLocalLlmSettingsChange,
    onLocalLlmModeChange,
    onWebLlmModelChange,
}) => {
    const navigate = useNavigate();

    return (
        <LocalLlmChat
            onBack={() => navigate('/', { flushSync: true })}
            localLlmSettings={localLlmSettings}
            onLocalLlmSettingsChange={onLocalLlmSettingsChange}
            onLocalLlmModeChange={onLocalLlmModeChange}
            onWebLlmModelChange={onWebLlmModelChange}
        />
    );
};
