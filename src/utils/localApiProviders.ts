export type LocalApiProviderPresetId = 'ollama' | 'vllm' | 'lmstudio';

export type LocalApiProviderPreset = {
    id: LocalApiProviderPresetId;
    label: string;
    baseUrl: string;
    exampleModelId: string;
    note: string;
};

export const LOCAL_API_PROVIDER_PRESETS: readonly LocalApiProviderPreset[] = [
    {
        id: 'ollama',
        label: 'Ollama（推奨）',
        baseUrl: 'http://localhost:11434/v1',
        exampleModelId: 'qwen3.5:4b',
        note: '単体PCで動かしやすく、学習アプリからの接続先として扱いやすい構成です。',
    },
    {
        id: 'vllm',
        label: 'vLLM',
        baseUrl: 'http://localhost:8000/v1',
        exampleModelId: 'Qwen/Qwen3.5-4B',
        note: 'Linux + 対応GPUで高スループット運用したいときに向いています。',
    },
    {
        id: 'lmstudio',
        label: 'LM Studio',
        baseUrl: 'http://localhost:1234/v1',
        exampleModelId: 'qwen3.5:4b',
        note: 'デスクトップGUIでローカルAPIを試したいときの候補です。',
    },
] as const;

export const DEFAULT_LOCAL_API_BASE_URL = LOCAL_API_PROVIDER_PRESETS[0].baseUrl;

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, '');

export const findLocalApiProviderByBaseUrl = (baseUrl: string) => {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    return LOCAL_API_PROVIDER_PRESETS.find((preset) => normalizeBaseUrl(preset.baseUrl) === normalizedBaseUrl) ?? null;
};
