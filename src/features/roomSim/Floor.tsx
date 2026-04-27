import { Html } from '@react-three/drei';
import { buildRoomMaterial } from './materialUtils';
import type { RoomDefinition } from './types';

type FloorProps = {
    room: RoomDefinition;
    showLabel: boolean;
};

export function Floor({ room, showLabel }: FloorProps) {
    const lineCount = room.floorMaterial === 'floorOak' ? Math.max(1, Math.floor(room.size.depth / 0.32)) : 0;

    return (
        <group position={[room.position.x, 0, room.position.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[room.size.width, room.size.depth]} />
                {buildRoomMaterial(room.floorMaterial)}
            </mesh>
            {Array.from({ length: lineCount }).map((_, index) => {
                const z = -room.size.depth / 2 + index * 0.32;
                return (
                    <mesh key={`${room.id}-floor-line-${index}`} position={[0, 0.006, z]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[room.size.width, 0.01]} />
                        <meshBasicMaterial color="#b99158" transparent opacity={0.2} />
                    </mesh>
                );
            })}
            {showLabel && (
                <Html center position={[0, 0.04, 0]} className="room-sim-room-label" transform={false}>
                    {room.name}
                </Html>
            )}
        </group>
    );
}
