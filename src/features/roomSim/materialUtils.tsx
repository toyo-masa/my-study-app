import type { JSX } from 'react';
import { furnitureMaterials } from './furnitureMaterials';
import { roomMaterials } from './roomMaterials';
import type { MaterialKey } from './types';

export function buildRoomMaterial(key: MaterialKey, opacityOverride?: number): JSX.Element {
    const material = roomMaterials[key];
    const opacity = opacityOverride ?? material.opacity ?? 1;

    return (
        <meshStandardMaterial
            color={material.color}
            roughness={material.roughness}
            metalness={material.metalness}
            transparent={opacity < 1}
            opacity={opacity}
        />
    );
}

export function buildFurnitureMaterial(key: MaterialKey, colorOverride?: string): JSX.Element {
    const material = furnitureMaterials[key];

    return (
        <meshStandardMaterial
            color={colorOverride ?? material.color}
            roughness={material.roughness}
            metalness={material.metalness}
        />
    );
}
