export type Vector2Meters = {
    x: number;
    z: number;
};

export type Vector3Meters = {
    x: number;
    y: number;
    z: number;
};

export type RoomSize = {
    width: number;
    depth: number;
};

export type AreaDefinition = {
    id: string;
    name: string;
    position: Vector2Meters;
    size: RoomSize;
};

export type Size3D = {
    width: number;
    depth: number;
    height: number;
};

export type MaterialKey =
    | 'floorOak'
    | 'wallWarmWhite'
    | 'ceilingWhite'
    | 'glass'
    | 'woodLight'
    | 'woodDark'
    | 'fabricGray'
    | 'fabricBeige'
    | 'fabricDarkGray'
    | 'leatherBrown'
    | 'metalBlack'
    | 'whiteMatte'
    | 'stoneGray'
    | 'tileWhite'
    | 'balconyConcrete';

export type FurnitureCategory =
    | 'sofa'
    | 'tvBoard'
    | 'tv'
    | 'diningTable'
    | 'chair'
    | 'bed'
    | 'desk'
    | 'shelf'
    | 'rug';

export type FurniturePlacementRule = {
    category: FurnitureCategory;
    preferredAreaId: string;
    areaIds: string[];
};

export type FurnitureStyle = 'natural' | 'modern' | 'hotelLike' | 'scandinavian';

export type FurnitureRenderMode = 'simple' | 'real';

export type WallDefinition = {
    id: string;
    name: string;
    start: Vector2Meters;
    end: Vector2Meters;
    height: number;
    thickness: number;
    material: MaterialKey;
};

export type WindowDefinition = {
    id: string;
    name: string;
    position: Vector2Meters;
    width: number;
    height: number;
    sillHeight: number;
    orientation: 'north' | 'south' | 'east' | 'west';
    material: MaterialKey;
};

export type DoorDefinition = {
    id: string;
    name: string;
    position: Vector2Meters;
    width: number;
    height: number;
    orientation: 'north' | 'south' | 'east' | 'west';
    swing: 'left' | 'right' | 'sliding' | 'none';
};

export type OpeningDefinition = {
    id: string;
    name: string;
    position: Vector2Meters;
    width: number;
    orientation: 'north' | 'south' | 'east' | 'west';
};

export type RoomDefinition = {
    id: string;
    name: string;
    type:
        | 'entrance'
        | 'corridor'
        | 'livingDining'
        | 'kitchen'
        | 'bedroom'
        | 'serviceRoom'
        | 'bathroom'
        | 'washroom'
        | 'toilet'
        | 'balcony'
        | 'closet';
    position: Vector2Meters;
    size: RoomSize;
    height: number;
    floorMaterial: MaterialKey;
    wallMaterial: MaterialKey;
    showLabel?: boolean;
    openings: string[];
    doors: string[];
    windows: string[];
};

export type FixedEquipmentDefinition = {
    id: string;
    name: string;
    roomId: string;
    category:
        | 'kitchenCounter'
        | 'sink'
        | 'cooktop'
        | 'fridgeSpace'
        | 'bathTub'
        | 'vanity'
        | 'toiletBowl'
        | 'washerPan'
        | 'closet'
        | 'balconyRail';
    position: Vector2Meters;
    size: Size3D;
    rotation: number;
    material: MaterialKey;
};

export type FallbackGeometry = 'box' | 'sofa' | 'table' | 'chair' | 'bed' | 'desk' | 'shelf' | 'tv' | 'rug';

export type FurnitureDefinition = {
    id: string;
    name: string;
    category: FurnitureCategory;
    size: Size3D;
    position: Vector3Meters;
    rotation: number;
    color: string;
    material: MaterialKey;
    style: FurnitureStyle;
    variant: string;
    modelPath?: string;
    visible: boolean;
    fallbackGeometry: FallbackGeometry;
    renderMode: FurnitureRenderMode;
};

export type FurnitureCatalogItem = {
    furnitureId: string;
    displayName: string;
    category: FurnitureCategory;
    defaultSize: Size3D;
    availableStyles: FurnitureStyle[];
    materialOptions: MaterialKey[];
    designOptions: FurnitureDesignOption[];
    modelOptions: string[];
    fallbackGeometry: FallbackGeometry;
    defaultModelPath?: string;
};

export type FurnitureDesignOption = {
    id: string;
    label: string;
    material: MaterialKey;
    color: string;
};

export type CameraMode = 'overview' | 'walkthrough';

export type CameraPreset = {
    id: string;
    name: string;
    position: Vector3Meters;
    target: Vector3Meters;
    mode: CameraMode;
};

export type LightingMode = 'day' | 'night';

export type RoomSimSettings = {
    viewMode: CameraMode;
    furnitureVisible: boolean;
    transparentWalls: boolean;
    showRoomLabels: boolean;
    lightingMode: LightingMode;
    eyeHeight: number;
    globalStyle: FurnitureStyle;
    activeCameraPresetId: string;
};
