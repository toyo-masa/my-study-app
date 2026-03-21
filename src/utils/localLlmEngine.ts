import type { InitProgressCallback, InitProgressReport, WebWorkerMLCEngine } from '@mlc-ai/web-llm';

export const WEB_LLM_QWEN_MODEL_OPTIONS = [
    { value: 'Qwen3-0.6B-q4f16_1-MLC', label: 'Qwen3 0.6B' },
    { value: 'Qwen3-1.7B-q4f16_1-MLC', label: 'Qwen3 1.7B' },
    { value: 'Qwen3-4B-q4f16_1-MLC', label: 'Qwen3 4B' },
    { value: 'Qwen3-8B-q4f16_1-MLC', label: 'Qwen3 8B' },
    { value: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 0.5B Instruct' },
    { value: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 1.5B Instruct' },
    { value: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 3B Instruct' },
    { value: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 7B Instruct' },
] as const;

export const DEFAULT_WEB_LLM_MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';

type LocalLlmSupport = {
    supported: boolean;
    reason: string;
};

let workerInstance: Worker | null = null;
let engineInstance: WebWorkerMLCEngine | null = null;
let enginePromise: Promise<WebWorkerMLCEngine> | null = null;
let progressListener: InitProgressCallback | null = null;
let loadedModelId: string | null = null;

const forwardProgress = (report: InitProgressReport) => {
    progressListener?.(report);
};

const createWorker = () => {
    if (workerInstance) {
        return workerInstance;
    }

    workerInstance = new Worker(new URL('../workers/webllm.worker.ts', import.meta.url), {
        type: 'module',
    });
    return workerInstance;
};

export const getLocalLlmSupport = (): LocalLlmSupport => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return {
            supported: false,
            reason: 'この画面はブラウザ環境でのみ利用できます。',
        };
    }

    if (!window.isSecureContext) {
        return {
            supported: false,
            reason: 'WebLLM は HTTPS または localhost の secure context でのみ利用できます。',
        };
    }

    const navigatorWithGpu = navigator as Navigator & { gpu?: unknown };
    if (!navigatorWithGpu.gpu) {
        return {
            supported: false,
            reason: 'この端末 / ブラウザでは WebGPU が利用できないため、この試作アプリは使えません。',
        };
    }

    if (typeof Worker === 'undefined') {
        return {
            supported: false,
            reason: 'このブラウザでは Web Worker が利用できません。',
        };
    }

    return {
        supported: true,
        reason: '',
    };
};

export const hasLoadedLocalLlmEngine = (modelId?: string) => {
    if (!engineInstance || !loadedModelId) {
        return false;
    }

    if (!modelId) {
        return true;
    }

    return loadedModelId === modelId;
};

export const ensureLocalLlmEngine = async (
    modelId = DEFAULT_WEB_LLM_MODEL_ID,
    listener?: InitProgressCallback
) => {
    progressListener = listener ?? null;

    if (engineInstance) {
        if (listener) {
            engineInstance.setInitProgressCallback(forwardProgress);
        }
        if (loadedModelId !== modelId) {
            await engineInstance.reload(modelId);
            loadedModelId = modelId;
        }
        return engineInstance;
    }

    if (!enginePromise) {
        enginePromise = (async () => {
            const webllm = await import('@mlc-ai/web-llm');
            const engine = await webllm.CreateWebWorkerMLCEngine(
                createWorker(),
                modelId,
                {
                    initProgressCallback: forwardProgress,
                }
            );
            engineInstance = engine;
            loadedModelId = modelId;
            return engine;
        })().catch((error: unknown) => {
            enginePromise = null;
            loadedModelId = null;
            throw error;
        });
    }

    const engine = await enginePromise;
    if (loadedModelId !== modelId) {
        if (listener) {
            engine.setInitProgressCallback(forwardProgress);
        }
        await engine.reload(modelId);
        loadedModelId = modelId;
    }
    return engine;
};

export const getLocalLlmGpuVendor = async () => {
    if (!engineInstance) {
        return '';
    }
    return engineInstance.getGPUVendor();
};

export const interruptLocalLlmGeneration = () => {
    engineInstance?.interruptGenerate();
};
