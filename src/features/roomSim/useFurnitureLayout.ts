import { useEffect, useMemo, useState } from 'react';
import { createFurnitureFromCatalog, findCatalogItem } from './furnitureCatalog';
import { furnitureStylePresets } from './furnitureMaterials';
import { initialFurniture, roomBounds } from './roomData';
import { loadStoredFurnitureLayout, saveStoredFurnitureLayout } from './storage';
import type {
    FurnitureCategory,
    FurnitureDefinition,
    FurnitureRenderMode,
    FurnitureStyle,
    MaterialKey,
    Vector3Meters,
} from './types';

type FurnitureUpdate = Partial<Omit<FurnitureDefinition, 'id'>>;

function cloneFurniture(furniture: FurnitureDefinition[]): FurnitureDefinition[] {
    return furniture.map((item) => ({
        ...item,
        size: { ...item.size },
        position: { ...item.position },
    }));
}

function normalizeDegrees(degrees: number): number {
    return ((degrees % 360) + 360) % 360;
}

function getRotatedFootprint(item: FurnitureDefinition): { width: number; depth: number } {
    const radians = (normalizeDegrees(item.rotation) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));

    return {
        width: item.size.width * cos + item.size.depth * sin,
        depth: item.size.width * sin + item.size.depth * cos,
    };
}

function clampFurniturePosition(item: FurnitureDefinition, position: Vector3Meters): Vector3Meters {
    const footprint = getRotatedFootprint(item);
    const halfWidth = footprint.width / 2;
    const halfDepth = footprint.depth / 2;
    const margin = 0.04;

    return {
        x: Math.min(roomBounds.maxX - halfWidth - margin, Math.max(roomBounds.minX + halfWidth + margin, position.x)),
        y: item.position.y,
        z: Math.min(roomBounds.maxZ - halfDepth - margin, Math.max(roomBounds.minZ + halfDepth + margin, position.z)),
    };
}

function pickDesignForStyle(category: FurnitureCategory, style: FurnitureStyle) {
    const catalogItem = findCatalogItem(category);
    const stylePreset = furnitureStylePresets[style];
    const preferredMaterials: MaterialKey[] = category === 'sofa' || category === 'chair' || category === 'bed'
        ? [stylePreset.accentMaterial, stylePreset.neutralMaterial, stylePreset.primaryMaterial]
        : [stylePreset.primaryMaterial, stylePreset.neutralMaterial, stylePreset.accentMaterial];

    return catalogItem.designOptions.find((option) => preferredMaterials.includes(option.material))
        ?? catalogItem.designOptions[0];
}

export function useFurnitureLayout() {
    const [furniture, setFurniture] = useState<FurnitureDefinition[]>(() => loadStoredFurnitureLayout(initialFurniture));
    const layoutSaveStatus = '家具配置を保存済み';

    useEffect(() => {
        saveStoredFurnitureLayout(furniture);
    }, [furniture]);

    const visibleFurniture = useMemo(
        () => furniture.filter((item) => item.visible),
        [furniture],
    );

    const updateFurniture = (id: string, update: FurnitureUpdate) => {
        setFurniture((current) => current.map((item) => (
            item.id === id
                ? {
                    ...item,
                    ...update,
                    size: update.size ? { ...update.size } : item.size,
                    position: update.position ? { ...update.position } : item.position,
                }
                : item
        )));
    };

    const moveFurniture = (id: string, nextPosition: Vector3Meters) => {
        setFurniture((current) => current.map((item) => (
            item.id === id
                ? { ...item, position: clampFurniturePosition(item, nextPosition) }
                : item
        )));
    };

    const rotateFurniture = (id: string, deltaDegrees = 90) => {
        setFurniture((current) => current.map((item) => {
            if (item.id !== id) {
                return item;
            }

            const rotated = {
                ...item,
                rotation: normalizeDegrees(item.rotation + deltaDegrees),
            };

            return {
                ...rotated,
                position: clampFurniturePosition(rotated, rotated.position),
            };
        }));
    };

    const setFurnitureRotation = (id: string, rotation: number) => {
        setFurniture((current) => current.map((item) => {
            if (item.id !== id) {
                return item;
            }

            const rotated = {
                ...item,
                rotation: normalizeDegrees(rotation),
            };

            return {
                ...rotated,
                position: clampFurniturePosition(rotated, rotated.position),
            };
        }));
    };

    const addFurniture = (category: FurnitureCategory, style: FurnitureStyle): string => {
        const id = `${category}-${Date.now()}`;
        const created = createFurnitureFromCatalog(category, id, { x: 0, y: 0, z: 3.8 }, 0, style);
        const design = pickDesignForStyle(category, style);
        const styledFurniture: FurnitureDefinition = {
            ...created,
            color: design.color,
            material: design.material,
            variant: design.id,
            style,
        };

        setFurniture((current) => [...current, styledFurniture]);
        return id;
    };

    const deleteFurniture = (id: string) => {
        setFurniture((current) => current.filter((item) => item.id !== id));
    };

    const resetFurniture = () => {
        setFurniture(cloneFurniture(initialFurniture));
    };

    const applyGlobalStyle = (style: FurnitureStyle) => {
        setFurniture((current) => current.map((item) => {
            const design = pickDesignForStyle(item.category, style);
            return {
                ...item,
                style,
                variant: design.id,
                material: design.material,
                color: design.color,
            };
        }));
    };

    const updateFurnitureDesign = (id: string, variant: string, material: MaterialKey, color: string) => {
        updateFurniture(id, { variant, material, color });
    };

    const updateFurnitureRenderMode = (id: string, renderMode: FurnitureRenderMode) => {
        updateFurniture(id, { renderMode });
    };

    const toggleFurnitureVisibility = (id: string) => {
        setFurniture((current) => current.map((item) => (
            item.id === id ? { ...item, visible: !item.visible } : item
        )));
    };

    return {
        furniture,
        visibleFurniture,
        layoutSaveStatus,
        updateFurniture,
        moveFurniture,
        rotateFurniture,
        setFurnitureRotation,
        addFurniture,
        deleteFurniture,
        resetFurniture,
        applyGlobalStyle,
        updateFurnitureDesign,
        updateFurnitureRenderMode,
        toggleFurnitureVisibility,
    };
}
