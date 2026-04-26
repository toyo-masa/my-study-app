import { buildRoomMaterial } from './materialUtils';
import { ceilingHeight, roomSize } from './roomData';

export function Ceiling() {
    return (
        <mesh position={[0, ceilingHeight, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[roomSize.width, roomSize.depth]} />
            {buildRoomMaterial('ceilingWhite', 0.18)}
        </mesh>
    );
}
