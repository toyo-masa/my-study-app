import type { FurnitureStyle, MaterialKey } from './types';

export type FurnitureMaterialDefinition = {
    key: MaterialKey;
    label: string;
    color: string;
    roughness: number;
    metalness: number;
};

export type FurnitureStylePreset = {
    id: FurnitureStyle;
    label: string;
    description: string;
    primaryMaterial: MaterialKey;
    accentMaterial: MaterialKey;
    neutralMaterial: MaterialKey;
};

export const furnitureMaterials: Record<MaterialKey, FurnitureMaterialDefinition> = {
    floorOak: {
        key: 'floorOak',
        label: '明るい木目',
        color: '#d7b982',
        roughness: 0.78,
        metalness: 0.02,
    },
    wallWarmWhite: {
        key: 'wallWarmWhite',
        label: '白系クロス',
        color: '#f4f1ea',
        roughness: 0.86,
        metalness: 0,
    },
    ceilingWhite: {
        key: 'ceilingWhite',
        label: '白天井',
        color: '#fbfaf7',
        roughness: 0.9,
        metalness: 0,
    },
    glass: {
        key: 'glass',
        label: 'ガラス',
        color: '#a9d6e8',
        roughness: 0.05,
        metalness: 0,
    },
    woodLight: {
        key: 'woodLight',
        label: 'ライトオーク',
        color: '#cfa66a',
        roughness: 0.72,
        metalness: 0.02,
    },
    woodDark: {
        key: 'woodDark',
        label: 'ウォールナット',
        color: '#5a3827',
        roughness: 0.65,
        metalness: 0.02,
    },
    fabricGray: {
        key: 'fabricGray',
        label: 'ファブリックグレー',
        color: '#8f9699',
        roughness: 0.92,
        metalness: 0,
    },
    fabricBeige: {
        key: 'fabricBeige',
        label: 'ファブリックベージュ',
        color: '#c8b79f',
        roughness: 0.92,
        metalness: 0,
    },
    fabricDarkGray: {
        key: 'fabricDarkGray',
        label: 'ダークグレーファブリック',
        color: '#4b5563',
        roughness: 0.9,
        metalness: 0,
    },
    leatherBrown: {
        key: 'leatherBrown',
        label: 'レザー風ブラウン',
        color: '#6b3f2a',
        roughness: 0.48,
        metalness: 0.02,
    },
    metalBlack: {
        key: 'metalBlack',
        label: 'ブラック金属',
        color: '#111827',
        roughness: 0.38,
        metalness: 0.55,
    },
    whiteMatte: {
        key: 'whiteMatte',
        label: 'ホワイトマット',
        color: '#f8fafc',
        roughness: 0.82,
        metalness: 0,
    },
    stoneGray: {
        key: 'stoneGray',
        label: 'グレー石目',
        color: '#9ca3af',
        roughness: 0.76,
        metalness: 0,
    },
    tileWhite: {
        key: 'tileWhite',
        label: '白タイル',
        color: '#eef2f7',
        roughness: 0.64,
        metalness: 0,
    },
    balconyConcrete: {
        key: 'balconyConcrete',
        label: 'バルコニー床',
        color: '#b8b5ad',
        roughness: 0.9,
        metalness: 0,
    },
};

export const furnitureStylePresets: Record<FurnitureStyle, FurnitureStylePreset> = {
    natural: {
        id: 'natural',
        label: 'natural',
        description: '明るい木目と白・ベージュ系で柔らかい印象',
        primaryMaterial: 'woodLight',
        accentMaterial: 'fabricBeige',
        neutralMaterial: 'whiteMatte',
    },
    modern: {
        id: 'modern',
        label: 'modern',
        description: 'グレー・ブラック・ウォールナット系で直線的な印象',
        primaryMaterial: 'woodDark',
        accentMaterial: 'fabricDarkGray',
        neutralMaterial: 'metalBlack',
    },
    hotelLike: {
        id: 'hotelLike',
        label: 'hotelLike',
        description: 'ダークブラウンを基調に高級感を意識',
        primaryMaterial: 'woodDark',
        accentMaterial: 'leatherBrown',
        neutralMaterial: 'metalBlack',
    },
    scandinavian: {
        id: 'scandinavian',
        label: 'scandinavian',
        description: '白・ライトオーク・ファブリック系で明るく軽い印象',
        primaryMaterial: 'woodLight',
        accentMaterial: 'fabricGray',
        neutralMaterial: 'whiteMatte',
    },
};

export const furnitureMaterialOptions = Object.values(furnitureMaterials);
