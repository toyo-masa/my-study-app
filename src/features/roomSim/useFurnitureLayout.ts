import { useMemo, useState } from 'react';
import { clampFurniturePositionToAreas, normalizeDegrees } from './areaUtils';
import { createFurnitureFromCatalog, findCatalogItem } from './furnitureCatalog';
import { furnitureStylePresets } from './furnitureMaterials';
import { furniturePlacementRules, initialFurniture, placementAreas } from './roomData';
import { loadStoredFurnitureLayout, saveStoredFurnitureLayout } from './storage';
import type {
    AreaDefinition,
    FurnitureCategory,
    FurnitureDefinition,
    FurnitureRenderMode,
    FurnitureStyle,
    MaterialKey,
    Vector3Meters,
} from './types';

type FurnitureUpdate = Partial<Omit<FurnitureDefinition, 'id'>>;
type FurnitureLayoutState = {
    furniture: FurnitureDefinition[];
    layoutSaveStatus: string;
};

function cloneFurniture(furniture: FurnitureDefinition[]): FurnitureDefinition[] {
    return furniture.map((item) => ({
        ...item,
        size: { ...item.size },
        position: { ...item.position },
    }));
}

function clampFurniturePosition(item: FurnitureDefinition, position: Vector3Meters): Vector3Meters {
    return clampFurniturePositionToAreas(item, position, getPlacementAreasForCategory(item.category));
}

function getPlacementAreasForCategory(category: FurnitureCategory): AreaDefinition[] {
    const rule = furniturePlacementRules[category];
    const areaIds = new Set(rule.areaIds);
    const areas = placementAreas.filter((area) => areaIds.has(area.id));

    return areas.length > 0 ? areas : placementAreas;
}

function getPreferredPosition(category: FurnitureCategory): Vector3Meters {
    const rule = furniturePlacementRules[category];
    const preferredArea = placementAreas.find((area) => area.id === rule.preferredAreaId) ?? placementAreas[0];

    return {
        x: preferredArea.position.x,
        y: 0,
        z: preferredArea.position.z,
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
    const [layoutState, setLayoutState] = useState<FurnitureLayoutState>(() => {
        const furniture = loadStoredFurnitureLayout(initialFurniture);
        const saved = saveStoredFurnitureLayout(furniture);

        return {
            furniture,
            layoutSaveStatus: saved ? '家具配置を保存済み' : '家具配置の保存に失敗しました',
        };
    });
    const furniture = layoutState.furniture;
    const layoutSaveStatus = layoutState.layoutSaveStatus;

    const commitFurniture = (updater: (current: FurnitureDefinition[]) => FurnitureDefinition[]) => {
        setLayoutState((current) => {
            const nextFurniture = updater(current.furniture);
            const saved = saveStoredFurnitureLayout(nextFurniture);

            return {
                furniture: nextFurniture,
                layoutSaveStatus: saved ? '家具配置を保存済み' : '家具配置の保存に失敗しました',
            };
        });
    };

    const visibleFurniture = useMemo(
        () => furniture.filter((item) => item.visible),
        [furniture],
    );

    const updateFurniture = (id: string, update: FurnitureUpdate) => {
        commitFurniture((current) => current.map((item) => (
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
        commitFurniture((current) => current.map((item) => (
            item.id === id
                ? { ...item, position: clampFurniturePosition(item, nextPosition) }
                : item
        )));
    };

    const rotateFurniture = (id: string, deltaDegrees = 90) => {
        commitFurniture((current) => current.map((item) => {
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
        commitFurniture((current) => current.map((item) => {
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
        const created = createFurnitureFromCatalog(category, id, getPreferredPosition(category), 0, style);
        const design = pickDesignForStyle(category, style);
        const styledFurniture: FurnitureDefinition = {
            ...created,
            color: design.color,
            material: design.material,
            variant: design.id,
            style,
        };

        commitFurniture((current) => [...current, {
            ...styledFurniture,
            position: clampFurniturePosition(styledFurniture, styledFurniture.position),
        }]);
        return id;
    };

    const deleteFurniture = (id: string) => {
        commitFurniture((current) => current.filter((item) => item.id !== id));
    };

    const resetFurniture = () => {
        commitFurniture(() => cloneFurniture(initialFurniture));
    };

    const applyGlobalStyle = (style: FurnitureStyle) => {
        commitFurniture((current) => current.map((item) => {
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
        commitFurniture((current) => current.map((item) => (
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
