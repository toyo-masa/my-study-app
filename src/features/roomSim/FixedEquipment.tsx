import { Html } from '@react-three/drei';
import { buildRoomMaterial } from './materialUtils';
import type { FixedEquipmentDefinition } from './types';

type FixedEquipmentProps = {
    equipment: FixedEquipmentDefinition;
};

export function FixedEquipment({ equipment }: FixedEquipmentProps) {
    return (
        <group
            position={[equipment.position.x, equipment.size.height / 2, equipment.position.z]}
            rotation={[0, (equipment.rotation * Math.PI) / 180, 0]}
        >
            <mesh castShadow receiveShadow>
                <boxGeometry args={[equipment.size.width, equipment.size.height, equipment.size.depth]} />
                {buildRoomMaterial(equipment.material, equipment.material === 'glass' ? 0.42 : undefined)}
            </mesh>
            {equipment.size.width > 0.5 && equipment.size.depth > 0.3 && (
                <Html center position={[0, equipment.size.height / 2 + 0.08, 0]} className="room-sim-equipment-label" transform={false}>
                    {equipment.name}
                </Html>
            )}
        </group>
    );
}
