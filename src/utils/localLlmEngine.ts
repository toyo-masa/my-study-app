import type { InitProgressCallback, InitProgressReport, WebWorkerMLCEngine } from '@mlc-ai/web-llm';

export const LOCAL_LLM_MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';

type LocalLlmSupport = {
    supported: boolean;
    reason: string;
};

let workerInstance: Worker | null = null;
let engineInstance: WebWorkerMLCEngine | null = null;
let enginePromise: Promise<WebWorkerMLCEngine> | null = null;
let progressListener: InitProgressCallback | null = null;

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

export const hasLoadedLocalLlmEngine = () => {
    return engineInstance !== null;
};

export const ensureLocalLlmEngine = async (listener?: InitProgressCallback) => {
    progressListener = listener ?? null;

    if (engineInstance) {
        if (listener) {
            engineInstance.setInitProgressCallback(forwardProgress);
        }
        return engineInstance;
    }

    if (!enginePromise) {
        enginePromise = (async () => {
            const webllm = await import('@mlc-ai/web-llm');
            const engine = await webllm.CreateWebWorkerMLCEngine(
                createWorker(),
                LOCAL_LLM_MODEL_ID,
                {
                    initProgressCallback: forwardProgress,
                }
            );
            engineInstance = engine;
            return engine;
        })().catch((error: unknown) => {
            enginePromise = null;
            throw error;
        });
    }

    return enginePromise;
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
