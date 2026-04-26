import type { FurnitureCatalogItem, FurnitureCategory, FurnitureDefinition, FurnitureStyle } from './types';

export const furnitureCatalog: FurnitureCatalogItem[] = [
    {
        furnitureId: 'sofa',
        displayName: 'ソファ',
        category: 'sofa',
        defaultSize: { width: 1.8, depth: 0.86, height: 0.78 },
        availableStyles: ['natural', 'modern', 'hotelLike', 'scandinavian'],
        materialOptions: ['fabricGray', 'fabricBeige', 'fabricDarkGray', 'leatherBrown'],
        designOptions: [
            { id: 'fabricGray', label: 'ファブリックグレー', material: 'fabricGray', color: '#8f9699' },
            { id: 'beige', label: 'ベージュ', material: 'fabricBeige', color: '#c8b79f' },
            { id: 'darkGray', label: 'ダークグレー', material: 'fabricDarkGray', color: '#4b5563' },
            { id: 'leatherBrown', label: 'レザー風ブラウン', material: 'leatherBrown', color: '#6b3f2a' },
        ],
        modelOptions: ['/models/furniture/sofa.glb'],
        fallbackGeometry: 'sofa',
        defaultModelPath: '/models/furniture/sofa.glb',
    },
    {
        furnitureId: 'tvBoard',
        displayName: 'テレビボード',
        category: 'tvBoard',
        defaultSize: { width: 1.6, depth: 0.38, height: 0.42 },
        availableStyles: ['natural', 'modern', 'hotelLike', 'scandinavian'],
        materialOptions: ['woodLight', 'woodDark', 'whiteMatte', 'metalBlack'],
        designOptions: [
            { id: 'lightOak', label: 'ライトオーク', material: 'woodLight', color: '#cfa66a' },
            { id: 'walnut', label: 'ウォールナット', material: 'woodDark', color: '#5a3827' },
            { id: 'white', label: 'ホワイト', material: 'whiteMatte', color: '#f8fafc' },
            { id: 'black', label: 'ブラック', material: 'metalBlack', color: '#111827' },
        ],
        modelOptions: ['/models/furniture/tv-board.glb'],
        fallbackGeometry: 'box',
        defaultModelPath: '/models/furniture/tv-board.glb',
    },
    {
        furnitureId: 'tv',
        displayName: 'テレビ',
        category: 'tv',
        defaultSize: { width: 1.22, depth: 0.08, height: 0.72 },
        availableStyles: ['natural', 'modern', 'hotelLike', 'scandinavian'],
        materialOptions: ['metalBlack'],
        designOptions: [
            { id: 'blackScreen', label: 'ブラックスクリーン', material: 'metalBlack', color: '#111827' },
        ],
        modelOptions: ['/models/furniture/tv.glb'],
        fallbackGeometry: 'tv',
        defaultModelPath: '/models/furniture/tv.glb',
    },
    {
        furnitureId: 'diningTable',
        displayName: 'ダイニングテーブル',
        category: 'diningTable',
        defaultSize: { width: 1.4, depth: 0.8, height: 0.72 },
        availableStyles: ['natural', 'modern', 'hotelLike', 'scandinavian'],
        materialOptions: ['woodLight', 'woodDark', 'metalBlack'],
        designOptions: [
            { id: 'naturalWood', label: '木目ナチュラル', material: 'woodLight', color: '#cfa66a' },
            { id: 'walnut', label: 'ウォールナット', material: 'woodDark', color: '#5a3827' },
            { id: 'woodBlackLegs', label: '黒脚＋木天板', material: 'woodLight', color: '#cfa66a' },
        ],
        modelOptions: ['/models/furniture/dining-table.glb'],
        fallbackGeometry: 'table',
        defaultModelPath: '/models/furniture/dining-table.glb',
    },
    {
        furnitureId: 'chair',
        displayName: 'チェア',
        category: 'chair',
        defaultSize: { width: 0.46, depth: 0.5, height: 0.82 },
        availableStyles: ['natural', 'modern', 'hotelLike', 'scandinavian'],
        materialOptions: ['woodLight', 'fabricGray', 'metalBlack'],
        designOptions: [
            { id: 'wood', label: '木製', material: 'woodLight', color: '#cfa66a' },
            { id: 'fabric', label: 'ファブリック', material: 'fabricGray', color: '#8f9699' },
            { id: 'blackLegs', label: '黒脚タイプ', material: 'metalBlack', color: '#111827' },
        ],
        modelOptions: ['/models/furniture/chair.glb'],
        fallbackGeometry: 'chair',
        defaultModelPath: '/models/furniture/chair.glb',
    },
    {
        furnitureId: 'bed',
        displayName: 'ベッド',
        category: 'bed',
        defaultSize: { width: 1.0, depth: 1.95, height: 0.52 },
        availableStyles: ['natural', 'modern', 'hotelLike', 'scandinavian'],
        materialOptions: ['fabricBeige', 'fabricGray', 'woodLight', 'woodDark'],
        designOptions: [
            { id: 'beigeFabric', label: 'ベージュファブリック', material: 'fabricBeige', color: '#c8b79f' },
            { id: 'grayFabric', label: 'グレーファブリック', material: 'fabricGray', color: '#8f9699' },
            { id: 'woodFrame', label: '木製フレーム', material: 'woodLight', color: '#cfa66a' },
        ],
        modelOptions: ['/models/furniture/bed.glb'],
        fallbackGeometry: 'bed',
        defaultModelPath: '/models/furniture/bed.glb',
    },
    {
        furnitureId: 'desk',
        displayName: 'デスク',
        category: 'desk',
        defaultSize: { width: 1.1, depth: 0.6, height: 0.72 },
        availableStyles: ['natural', 'modern', 'hotelLike', 'scandinavian'],
        materialOptions: ['woodLight', 'whiteMatte', 'metalBlack'],
        designOptions: [
            { id: 'naturalWood', label: 'ナチュラル木目', material: 'woodLight', color: '#cfa66a' },
            { id: 'white', label: 'ホワイト', material: 'whiteMatte', color: '#f8fafc' },
            { id: 'black', label: 'ブラック', material: 'metalBlack', color: '#111827' },
        ],
        modelOptions: ['/models/furniture/desk.glb'],
        fallbackGeometry: 'desk',
        defaultModelPath: '/models/furniture/desk.glb',
    },
    {
        furnitureId: 'shelf',
        displayName: '棚・収納',
        category: 'shelf',
        defaultSize: { width: 0.9, depth: 0.34, height: 1.2 },
        availableStyles: ['natural', 'modern', 'hotelLike', 'scandinavian'],
        materialOptions: ['woodLight', 'woodDark', 'whiteMatte'],
        designOptions: [
            { id: 'openRack', label: 'オープンラック', material: 'woodLight', color: '#cfa66a' },
            { id: 'lowBoard', label: 'ローボード', material: 'woodDark', color: '#5a3827' },
            { id: 'cabinet', label: 'キャビネット風', material: 'whiteMatte', color: '#f8fafc' },
        ],
        modelOptions: ['/models/furniture/shelf.glb'],
        fallbackGeometry: 'shelf',
        defaultModelPath: '/models/furniture/shelf.glb',
    },
    {
        furnitureId: 'rug',
        displayName: 'ラグ',
        category: 'rug',
        defaultSize: { width: 1.8, depth: 1.2, height: 0.03 },
        availableStyles: ['natural', 'modern', 'hotelLike', 'scandinavian'],
        materialOptions: ['fabricBeige', 'fabricGray', 'fabricDarkGray'],
        designOptions: [
            { id: 'beige', label: 'ベージュ', material: 'fabricBeige', color: '#c8b79f' },
            { id: 'gray', label: 'グレー', material: 'fabricGray', color: '#8f9699' },
            { id: 'darkGray', label: 'ダークグレー', material: 'fabricDarkGray', color: '#4b5563' },
        ],
        modelOptions: [],
        fallbackGeometry: 'rug',
    },
];

export function findCatalogItem(category: FurnitureCategory): FurnitureCatalogItem {
    return furnitureCatalog.find((item) => item.category === category) ?? furnitureCatalog[0];
}

export function createFurnitureFromCatalog(
    category: FurnitureCategory,
    id: string,
    position = { x: 0, y: 0, z: 0 },
    rotation = 0,
    style: FurnitureStyle = 'natural',
): FurnitureDefinition {
    const catalogItem = findCatalogItem(category);
    const design = catalogItem.designOptions[0];

    return {
        id,
        name: catalogItem.displayName,
        category: catalogItem.category,
        size: { ...catalogItem.defaultSize },
        position: { ...position },
        rotation,
        color: design.color,
        material: design.material,
        style,
        variant: design.id,
        modelPath: catalogItem.defaultModelPath,
        visible: true,
        fallbackGeometry: catalogItem.fallbackGeometry,
        renderMode: 'simple',
    };
}
