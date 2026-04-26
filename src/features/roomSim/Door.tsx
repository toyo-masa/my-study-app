import type { DoorDefinition } from './types';

type DoorProps = {
    door: DoorDefinition;
};

function isHorizontal(orientation: DoorDefinition['orientation']): boolean {
    return orientation === 'north' || orientation === 'south';
}

export function Door({ door }: DoorProps) {
    const horizontal = isHorizontal(door.orientation);
    const panelHeight = door.height;
    const panelWidth = door.width;

    return (
        <group position={[door.position.x, panelHeight / 2, door.position.z]}>
            <mesh>
                <boxGeometry args={horizontal ? [panelWidth, panelHeight, 0.035] : [0.035, panelHeight, panelWidth]} />
                <meshStandardMaterial color="#c7a27a" roughness={0.72} metalness={0.02} transparent opacity={0.72} />
            </mesh>
            {door.swing !== 'sliding' && door.swing !== 'none' && (
                <mesh position={[0, -panelHeight / 2 + 0.012, 0]} rotation={[-Math.PI / 2, 0, horizontal ? 0 : Math.PI / 2]}>
                    <ringGeometry args={[door.width * 0.82, door.width * 0.84, 32, 1, 0, Math.PI / 2]} />
                    <meshBasicMaterial color="#7c6f64" transparent opacity={0.32} />
                </mesh>
            )}
        </group>
    );
}
