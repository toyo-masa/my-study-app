import type { LightingMode } from './types';

export type RoomLightingPreset = {
    ambientIntensity: number;
    directionalIntensity: number;
    directionalPosition: [number, number, number];
    pointIntensity: number;
    pointPosition: [number, number, number];
    backgroundColor: string;
};

export const roomLightingPresets: Record<LightingMode, RoomLightingPreset> = {
    day: {
        ambientIntensity: 0.55,
        directionalIntensity: 1.2,
        directionalPosition: [2.8, 6.2, 7.2],
        pointIntensity: 0.45,
        pointPosition: [0, 2.2, 3.4],
        backgroundColor: '#d9edf7',
    },
    night: {
        ambientIntensity: 0.28,
        directionalIntensity: 0.25,
        directionalPosition: [2.0, 4.8, 6.5],
        pointIntensity: 1.3,
        pointPosition: [0, 2.2, 3.4],
        backgroundColor: '#1f2937',
    },
};
