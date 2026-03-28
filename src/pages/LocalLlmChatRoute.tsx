import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LocalLlmChat } from '../components/LocalLlmChat';
import type { LocalLlmMode, LocalLlmSettings } from '../utils/settings';

interface LocalLlmChatRouteProps {
    localLlmSettings: LocalLlmSettings;
    onLocalLlmModeChange: (preferredMode: LocalLlmMode) => void;
    onWebLlmModelChange: (modelId: string) => void;
}

export const LocalLlmChatRoute: React.FC<LocalLlmChatRouteProps> = ({
    localLlmSettings,
    onLocalLlmModeChange,
    onWebLlmModelChange,
}) => {
    const navigate = useNavigate();

    return (
        <LocalLlmChat
            onBack={() => navigate('/', { flushSync: true })}
            localLlmSettings={localLlmSettings}
            onLocalLlmModeChange={onLocalLlmModeChange}
            onWebLlmModelChange={onWebLlmModelChange}
        />
    );
};
