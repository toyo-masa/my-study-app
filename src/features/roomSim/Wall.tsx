import { buildRoomMaterial } from './materialUtils';
import type { WallDefinition } from './types';

type WallProps = {
    wall: WallDefinition;
    transparent: boolean;
};

export function Wall({ wall, transparent }: WallProps) {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    const rotationY = -Math.atan2(dz, dx);
    const opacity = transparent ? 0.32 : 1;

    return (
        <mesh
            position={[(wall.start.x + wall.end.x) / 2, wall.height / 2, (wall.start.z + wall.end.z) / 2]}
            rotation={[0, rotationY, 0]}
            castShadow
            receiveShadow
        >
            <boxGeometry args={[length, wall.height, wall.thickness]} />
            {buildRoomMaterial(wall.material, opacity)}
        </mesh>
    );
}
