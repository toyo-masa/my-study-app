import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { buildFurnitureMaterial } from './materialUtils';
import { FurnitureModel } from './FurnitureModel';
import type { FurnitureDefinition, MaterialKey } from './types';

type FurnitureProps = {
    furniture: FurnitureDefinition;
    selected: boolean;
    onPointerDown: (id: string, event: ThreeEvent<PointerEvent>) => void;
};

type BoxPartProps = {
    position: [number, number, number];
    size: [number, number, number];
    material: MaterialKey;
    color?: string;
};

function BoxPart({ position, size, material, color }: BoxPartProps) {
    return (
        <mesh position={position} castShadow receiveShadow>
            <boxGeometry args={size} />
            {buildFurnitureMaterial(material, color)}
        </mesh>
    );
}

function SimpleBox({ furniture }: { furniture: FurnitureDefinition }) {
    return (
        <BoxPart
            position={[0, furniture.size.height / 2, 0]}
            size={[furniture.size.width, furniture.size.height, furniture.size.depth]}
            material={furniture.material}
            color={furniture.color}
        />
    );
}

function SofaFallback({ furniture }: { furniture: FurnitureDefinition }) {
    const { width, depth, height } = furniture.size;
    const seatHeight = height * 0.42;
    const backHeight = height * 0.72;

    return (
        <group>
            <BoxPart position={[0, seatHeight / 2, 0.05]} size={[width, seatHeight, depth * 0.78]} material={furniture.material} color={furniture.color} />
            <BoxPart position={[0, seatHeight + backHeight / 2, -depth * 0.42]} size={[width, backHeight, depth * 0.16]} material={furniture.material} color={furniture.color} />
            <BoxPart position={[-width * 0.47, seatHeight * 0.75, 0.04]} size={[width * 0.08, seatHeight * 1.35, depth * 0.78]} material={furniture.material} color={furniture.color} />
            <BoxPart position={[width * 0.47, seatHeight * 0.75, 0.04]} size={[width * 0.08, seatHeight * 1.35, depth * 0.78]} material={furniture.material} color={furniture.color} />
            <BoxPart position={[-width * 0.24, seatHeight + 0.04, 0.08]} size={[width * 0.44, 0.06, depth * 0.58]} material="fabricBeige" />
            <BoxPart position={[width * 0.24, seatHeight + 0.04, 0.08]} size={[width * 0.44, 0.06, depth * 0.58]} material="fabricBeige" />
        </group>
    );
}

function TableFallback({ furniture }: { furniture: FurnitureDefinition }) {
    const { width, depth, height } = furniture.size;
    const legHeight = height - 0.08;
    const legInsetX = width / 2 - 0.12;
    const legInsetZ = depth / 2 - 0.12;

    return (
        <group>
            <BoxPart position={[0, height, 0]} size={[width, 0.08, depth]} material={furniture.material} color={furniture.color} />
            {[
                [-legInsetX, legHeight / 2, -legInsetZ],
                [legInsetX, legHeight / 2, -legInsetZ],
                [-legInsetX, legHeight / 2, legInsetZ],
                [legInsetX, legHeight / 2, legInsetZ],
            ].map((position, index) => (
                <BoxPart key={index} position={position as [number, number, number]} size={[0.06, legHeight, 0.06]} material="metalBlack" />
            ))}
        </group>
    );
}

function ChairFallback({ furniture }: { furniture: FurnitureDefinition }) {
    const { width, depth, height } = furniture.size;
    const seatHeight = 0.42;

    return (
        <group>
            <BoxPart position={[0, seatHeight, 0]} size={[width, 0.08, depth]} material={furniture.material} color={furniture.color} />
            <BoxPart position={[0, height * 0.66, -depth * 0.42]} size={[width, height * 0.58, 0.06]} material={furniture.material} color={furniture.color} />
            {[
                [-width * 0.38, seatHeight / 2, -depth * 0.36],
                [width * 0.38, seatHeight / 2, -depth * 0.36],
                [-width * 0.38, seatHeight / 2, depth * 0.36],
                [width * 0.38, seatHeight / 2, depth * 0.36],
            ].map((position, index) => (
                <BoxPart key={index} position={position as [number, number, number]} size={[0.04, seatHeight, 0.04]} material="metalBlack" />
            ))}
        </group>
    );
}

function BedFallback({ furniture }: { furniture: FurnitureDefinition }) {
    const { width, depth, height } = furniture.size;

    return (
        <group>
            <BoxPart position={[0, height * 0.28, 0]} size={[width, height * 0.3, depth]} material="woodLight" />
            <BoxPart position={[0, height * 0.62, 0.08]} size={[width * 0.95, height * 0.36, depth * 0.86]} material={furniture.material} color={furniture.color} />
            <BoxPart position={[0, height * 0.7, -depth * 0.48]} size={[width, height * 0.86, 0.08]} material="woodLight" />
            <BoxPart position={[0, height * 0.88, -depth * 0.28]} size={[width * 0.82, height * 0.18, depth * 0.18]} material="whiteMatte" />
        </group>
    );
}

function DeskFallback({ furniture }: { furniture: FurnitureDefinition }) {
    return <TableFallback furniture={furniture} />;
}

function ShelfFallback({ furniture }: { furniture: FurnitureDefinition }) {
    const { width, depth, height } = furniture.size;
    const shelfCount = 3;

    return (
        <group>
            <BoxPart position={[0, height / 2, 0]} size={[width, height, depth]} material={furniture.material} color={furniture.color} />
            <BoxPart position={[0, height / 2, 0.01]} size={[width * 0.86, height * 0.88, depth + 0.03]} material="whiteMatte" />
            {Array.from({ length: shelfCount }).map((_, index) => {
                const y = ((index + 1) / (shelfCount + 1)) * height;
                return <BoxPart key={index} position={[0, y, 0.02]} size={[width * 0.88, 0.035, depth + 0.04]} material={furniture.material} color={furniture.color} />;
            })}
        </group>
    );
}

function TvFallback({ furniture }: { furniture: FurnitureDefinition }) {
    const { width, depth, height } = furniture.size;

    return (
        <group>
            <BoxPart position={[0, height / 2, 0]} size={[width, height, depth]} material="metalBlack" />
            <mesh position={[0, height / 2, depth / 2 + 0.006]}>
                <planeGeometry args={[width * 0.9, height * 0.82]} />
                <meshBasicMaterial color="#0f172a" />
            </mesh>
        </group>
    );
}

function RugFallback({ furniture }: { furniture: FurnitureDefinition }) {
    return (
        <mesh position={[0, furniture.size.height / 2, 0]} receiveShadow>
            <boxGeometry args={[furniture.size.width, furniture.size.height, furniture.size.depth]} />
            <meshStandardMaterial color={furniture.color} roughness={0.96} metalness={0} transparent opacity={0.9} />
        </mesh>
    );
}

function renderFallback(furniture: FurnitureDefinition) {
    switch (furniture.fallbackGeometry) {
        case 'sofa':
            return <SofaFallback furniture={furniture} />;
        case 'table':
            return <TableFallback furniture={furniture} />;
        case 'chair':
            return <ChairFallback furniture={furniture} />;
        case 'bed':
            return <BedFallback furniture={furniture} />;
        case 'desk':
            return <DeskFallback furniture={furniture} />;
        case 'shelf':
            return <ShelfFallback furniture={furniture} />;
        case 'tv':
            return <TvFallback furniture={furniture} />;
        case 'rug':
            return <RugFallback furniture={furniture} />;
        case 'box':
            return <SimpleBox furniture={furniture} />;
    }
}

export function Furniture({ furniture, selected, onPointerDown }: FurnitureProps) {
    if (!furniture.visible) {
        return null;
    }

    return (
        <group
            position={[furniture.position.x, furniture.position.y, furniture.position.z]}
            rotation={[0, (furniture.rotation * Math.PI) / 180, 0]}
            onPointerDown={(event) => onPointerDown(furniture.id, event)}
        >
            <FurnitureModel
                modelPath={furniture.modelPath}
                size={furniture.size}
                useRealModel={furniture.renderMode === 'real'}
                fallback={renderFallback(furniture)}
            />
            {selected && (
                <mesh position={[0, furniture.size.height / 2, 0]}>
                    <boxGeometry args={[furniture.size.width + 0.08, furniture.size.height + 0.08, furniture.size.depth + 0.08]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                    <Edges color="#f97316" />
                </mesh>
            )}
        </group>
    );
}
