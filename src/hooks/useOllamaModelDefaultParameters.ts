import { useEffect, useState } from 'react';
import {
    fetchOllamaModelDefaultParameters,
    OLLAMA_FALLBACK_MODEL_DEFAULT_PARAMETERS,
    type OllamaModelDefaultParameters,
} from '../utils/openAiCompatibleLocalApi';

type UseOllamaModelDefaultParametersOptions = {
    baseUrl: string;
    modelId: string;
    enabled: boolean;
};

export const useOllamaModelDefaultParameters = ({
    baseUrl,
    modelId,
    enabled,
}: UseOllamaModelDefaultParametersOptions): OllamaModelDefaultParameters => {
    const normalizedModelId = modelId.trim();
    const requestKey = enabled && normalizedModelId.length > 0
        ? `${baseUrl}::${normalizedModelId}`
        : '';
    const [resolvedState, setResolvedState] = useState<{
        key: string;
        defaults: OllamaModelDefaultParameters;
    } | null>(null);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        if (normalizedModelId.length === 0) {
            return;
        }

        const controller = new AbortController();
        let isActive = true;
        const currentRequestKey = `${baseUrl}::${normalizedModelId}`;

        void fetchOllamaModelDefaultParameters(baseUrl, normalizedModelId, controller.signal)
            .then((nextDefaults) => {
                if (!isActive) {
                    return;
                }
                setResolvedState({
                    key: currentRequestKey,
                    defaults: nextDefaults,
                });
            })
            .catch((error) => {
                if (!isActive) {
                    return;
                }
                if (error instanceof DOMException && error.name === 'AbortError') {
                    return;
                }
                setResolvedState({
                    key: currentRequestKey,
                    defaults: OLLAMA_FALLBACK_MODEL_DEFAULT_PARAMETERS,
                });
            });

        return () => {
            isActive = false;
            controller.abort();
        };
    }, [baseUrl, enabled, normalizedModelId]);

    if (requestKey.length === 0) {
        return OLLAMA_FALLBACK_MODEL_DEFAULT_PARAMETERS;
    }

    return resolvedState?.key === requestKey
        ? resolvedState.defaults
        : OLLAMA_FALLBACK_MODEL_DEFAULT_PARAMETERS;
};
