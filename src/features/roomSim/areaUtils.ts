import type { AreaDefinition, FurnitureDefinition, Size3D, Vector2Meters, Vector3Meters } from './types';

export type Footprint = {
    width: number;
    depth: number;
};

export function normalizeDegrees(degrees: number): number {
    return ((degrees % 360) + 360) % 360;
}

export function getRotatedFootprint(size: Size3D, rotation: number): Footprint {
    const radians = (normalizeDegrees(rotation) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));

    return {
        width: size.width * cos + size.depth * sin,
        depth: size.width * sin + size.depth * cos,
    };
}

export function getFurnitureFootprint(item: FurnitureDefinition): Footprint {
    return getRotatedFootprint(item.size, item.rotation);
}

function getAreaLimit(area: AreaDefinition, footprint: Footprint, margin: number) {
    const minX = area.position.x - area.size.width / 2 + footprint.width / 2 + margin;
    const maxX = area.position.x + area.size.width / 2 - footprint.width / 2 - margin;
    const minZ = area.position.z - area.size.depth / 2 + footprint.depth / 2 + margin;
    const maxZ = area.position.z + area.size.depth / 2 - footprint.depth / 2 - margin;

    return {
        minX: Math.min(minX, maxX),
        maxX: Math.max(minX, maxX),
        minZ: Math.min(minZ, maxZ),
        maxZ: Math.max(minZ, maxZ),
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function isPointInArea(area: AreaDefinition, point: Vector2Meters, footprint: Footprint, margin = 0): boolean {
    const limit = getAreaLimit(area, footprint, margin);

    return point.x >= limit.minX && point.x <= limit.maxX && point.z >= limit.minZ && point.z <= limit.maxZ;
}

export function clampPointToArea(area: AreaDefinition, point: Vector2Meters, footprint: Footprint, margin = 0): Vector2Meters {
    const limit = getAreaLimit(area, footprint, margin);

    return {
        x: clamp(point.x, limit.minX, limit.maxX),
        z: clamp(point.z, limit.minZ, limit.maxZ),
    };
}

function squaredDistance(a: Vector2Meters, b: Vector2Meters): number {
    return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

export function clampPointToAreas(
    areas: AreaDefinition[],
    point: Vector2Meters,
    footprint: Footprint,
    margin = 0,
): Vector2Meters {
    if (areas.length === 0) {
        return point;
    }

    const containingArea = areas.find((area) => isPointInArea(area, point, footprint, margin));
    if (containingArea) {
        return clampPointToArea(containingArea, point, footprint, margin);
    }

    return areas
        .map((area) => {
            const clampedPoint = clampPointToArea(area, point, footprint, margin);
            return {
                point: clampedPoint,
                distance: squaredDistance(point, clampedPoint),
            };
        })
        .sort((a, b) => a.distance - b.distance)[0].point;
}

export function clampFurniturePositionToAreas(
    item: FurnitureDefinition,
    position: Vector3Meters,
    areas: AreaDefinition[],
    margin = 0.04,
): Vector3Meters {
    const footprint = getFurnitureFootprint(item);
    const clampedPoint = clampPointToAreas(areas, position, footprint, margin);

    return {
        x: clampedPoint.x,
        y: item.position.y,
        z: clampedPoint.z,
    };
}
