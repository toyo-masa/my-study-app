import { defaultCameraPresetId } from './cameraPresets';
import { floorPlanVersion } from './roomData';
import type {
    FurnitureDefinition,
    FurnitureRenderMode,
    FurnitureStyle,
    LightingMode,
    MaterialKey,
    RoomSimSettings,
} from './types';

const FURNITURE_STORAGE_KEY = `room-sim.furniture-layout.v1.${floorPlanVersion}`;
const SETTINGS_STORAGE_KEY = 'room-sim.settings.v1';

type StoredFurnitureLayout = {
    floorPlanVersion: string;
    furniture: FurnitureDefinition[];
};

const materialKeys: MaterialKey[] = [
    'floorOak',
    'wallWarmWhite',
    'ceilingWhite',
    'glass',
    'woodLight',
    'woodDark',
    'fabricGray',
    'fabricBeige',
    'fabricDarkGray',
    'leatherBrown',
    'metalBlack',
    'whiteMatte',
    'stoneGray',
    'tileWhite',
    'balconyConcrete',
];

const furnitureStyles: FurnitureStyle[] = ['natural', 'modern', 'hotelLike', 'scandinavian'];
const lightingModes: LightingMode[] = ['day', 'night'];
const renderModes: FurnitureRenderMode[] = ['simple', 'real'];

export const defaultRoomSimSettings: RoomSimSettings = {
    viewMode: 'overview',
    furnitureVisible: true,
    transparentWalls: false,
    showRoomLabels: true,
    lightingMode: 'day',
    eyeHeight: 1.6,
    globalStyle: 'natural',
    activeCameraPresetId: defaultCameraPresetId,
};

function readLocalStorage(key: string): string | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeLocalStorage(key: string, value: string): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isMaterialKey(value: unknown): value is MaterialKey {
    return typeof value === 'string' && materialKeys.includes(value as MaterialKey);
}

function isFurnitureStyle(value: unknown): value is FurnitureStyle {
    return typeof value === 'string' && furnitureStyles.includes(value as FurnitureStyle);
}

function isRenderMode(value: unknown): value is FurnitureRenderMode {
    return typeof value === 'string' && renderModes.includes(value as FurnitureRenderMode);
}

function parseFurniture(value: unknown): FurnitureDefinition | null {
    if (!isRecord(value)) {
        return null;
    }

    const size = value.size;
    const position = value.position;
    if (!isRecord(size) || !isRecord(position)) {
        return null;
    }

    if (
        typeof value.id !== 'string'
        || typeof value.name !== 'string'
        || typeof value.category !== 'string'
        || !isFiniteNumber(size.width)
        || !isFiniteNumber(size.depth)
        || !isFiniteNumber(size.height)
        || !isFiniteNumber(position.x)
        || !isFiniteNumber(position.y)
        || !isFiniteNumber(position.z)
        || !isFiniteNumber(value.rotation)
        || typeof value.color !== 'string'
        || !isMaterialKey(value.material)
        || !isFurnitureStyle(value.style)
        || typeof value.variant !== 'string'
        || typeof value.visible !== 'boolean'
        || typeof value.fallbackGeometry !== 'string'
        || !isRenderMode(value.renderMode)
    ) {
        return null;
    }

    return {
        id: value.id,
        name: value.name,
        category: value.category as FurnitureDefinition['category'],
        size: {
            width: size.width,
            depth: size.depth,
            height: size.height,
        },
        position: {
            x: position.x,
            y: position.y,
            z: position.z,
        },
        rotation: value.rotation,
        color: value.color,
        material: value.material,
        style: value.style,
        variant: value.variant,
        modelPath: typeof value.modelPath === 'string' ? value.modelPath : undefined,
        visible: value.visible,
        fallbackGeometry: value.fallbackGeometry as FurnitureDefinition['fallbackGeometry'],
        renderMode: value.renderMode,
    };
}

function cloneFurniture(furniture: FurnitureDefinition[]): FurnitureDefinition[] {
    return furniture.map((item) => ({
        ...item,
        size: { ...item.size },
        position: { ...item.position },
    }));
}

function parseStoredFurnitureLayout(value: unknown): StoredFurnitureLayout | null {
    if (Array.isArray(value)) {
        const furniture = value
            .map((item) => parseFurniture(item))
            .filter((item): item is FurnitureDefinition => item !== null);

        return furniture.length > 0 ? { floorPlanVersion, furniture } : null;
    }

    if (!isRecord(value) || value.floorPlanVersion !== floorPlanVersion || !Array.isArray(value.furniture)) {
        return null;
    }

    const furniture = value.furniture
        .map((item) => parseFurniture(item))
        .filter((item): item is FurnitureDefinition => item !== null);

    return furniture.length > 0 ? { floorPlanVersion, furniture } : null;
}

export function loadStoredFurnitureLayout(fallback: FurnitureDefinition[]): FurnitureDefinition[] {
    const raw = readLocalStorage(FURNITURE_STORAGE_KEY);
    if (!raw) {
        return cloneFurniture(fallback);
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        const storedLayout = parseStoredFurnitureLayout(parsed);

        return storedLayout ? cloneFurniture(storedLayout.furniture) : cloneFurniture(fallback);
    } catch {
        return cloneFurniture(fallback);
    }
}

export function saveStoredFurnitureLayout(furniture: FurnitureDefinition[]): boolean {
    return writeLocalStorage(FURNITURE_STORAGE_KEY, JSON.stringify({ floorPlanVersion, furniture }));
}

export function loadRoomSimSettings(): RoomSimSettings {
    const raw = readLocalStorage(SETTINGS_STORAGE_KEY);
    if (!raw) {
        return { ...defaultRoomSimSettings };
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) {
            return { ...defaultRoomSimSettings };
        }

        const viewMode = parsed.viewMode === 'walkthrough' ? 'walkthrough' : 'overview';

        return {
            viewMode,
            furnitureVisible: typeof parsed.furnitureVisible === 'boolean' ? parsed.furnitureVisible : defaultRoomSimSettings.furnitureVisible,
            transparentWalls: typeof parsed.transparentWalls === 'boolean' ? parsed.transparentWalls : defaultRoomSimSettings.transparentWalls,
            showRoomLabels: typeof parsed.showRoomLabels === 'boolean' ? parsed.showRoomLabels : viewMode === 'overview',
            lightingMode: typeof parsed.lightingMode === 'string' && lightingModes.includes(parsed.lightingMode as LightingMode) ? parsed.lightingMode as LightingMode : defaultRoomSimSettings.lightingMode,
            eyeHeight: isFiniteNumber(parsed.eyeHeight) ? Math.min(1.8, Math.max(1.2, parsed.eyeHeight)) : defaultRoomSimSettings.eyeHeight,
            globalStyle: isFurnitureStyle(parsed.globalStyle) ? parsed.globalStyle : defaultRoomSimSettings.globalStyle,
            activeCameraPresetId: typeof parsed.activeCameraPresetId === 'string' ? parsed.activeCameraPresetId : defaultRoomSimSettings.activeCameraPresetId,
        };
    } catch {
        return { ...defaultRoomSimSettings };
    }
}

export function saveRoomSimSettings(settings: RoomSimSettings): boolean {
    return writeLocalStorage(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
