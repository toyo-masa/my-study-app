import type { CameraPreset } from './types';

export const cameraPresets: CameraPreset[] = [
    {
        id: 'entrance-to-ldk',
        name: '玄関側からLDKを見る',
        position: { x: 0, y: 1.55, z: -4.3 },
        target: { x: 0, y: 1.3, z: 4.8 },
        mode: 'walkthrough',
    },
    {
        id: 'sofa-view',
        name: 'ソファに座った視点',
        position: { x: -1.25, y: 1.1, z: 4.55 },
        target: { x: 2.5, y: 1.0, z: 4.55 },
        mode: 'walkthrough',
    },
    {
        id: 'dining-view',
        name: 'ダイニングに座った視点',
        position: { x: -1.75, y: 1.15, z: 3.05 },
        target: { x: 0.2, y: 1.2, z: 5.2 },
        mode: 'walkthrough',
    },
    {
        id: 'kitchen-to-living',
        name: 'キッチン側からリビングを見る',
        position: { x: -2.2, y: 1.55, z: 2.35 },
        target: { x: 0.5, y: 1.2, z: 5.25 },
        mode: 'walkthrough',
    },
    {
        id: 'balcony-view',
        name: 'バルコニー側を見る',
        position: { x: -0.4, y: 1.55, z: 4.2 },
        target: { x: 0.2, y: 1.45, z: 7.9 },
        mode: 'walkthrough',
    },
    {
        id: 'ldk-from-balcony',
        name: 'LDKからバルコニー側',
        position: { x: 0.2, y: 1.55, z: 3.65 },
        target: { x: 0, y: 1.35, z: 7.6 },
        mode: 'walkthrough',
    },
    {
        id: 'bedroom2-workspace',
        name: '洋室(2)ワークスペース',
        position: { x: 1.0, y: 1.45, z: 0.45 },
        target: { x: 2.45, y: 1.15, z: 0.95 },
        mode: 'walkthrough',
    },
    {
        id: 'service-room',
        name: 'サービスルーム内',
        position: { x: 1.25, y: 1.5, z: -4.9 },
        target: { x: 2.55, y: 1.2, z: -3.6 },
        mode: 'walkthrough',
    },
    {
        id: 'overview',
        name: '俯瞰ビュー',
        position: { x: 0, y: 16.5, z: 1.0 },
        target: { x: 0, y: 0, z: 1.0 },
        mode: 'overview',
    },
];

export const defaultCameraPresetId = 'overview';
