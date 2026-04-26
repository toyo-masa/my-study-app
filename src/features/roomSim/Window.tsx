import { buildRoomMaterial } from './materialUtils';
import type { WindowDefinition } from './types';

type WindowProps = {
    windowDefinition: WindowDefinition;
};

function isHorizontal(orientation: WindowDefinition['orientation']): boolean {
    return orientation === 'north' || orientation === 'south';
}

export function Window({ windowDefinition }: WindowProps) {
    const horizontal = isHorizontal(windowDefinition.orientation);
    const frameColor = '#d1d5db';
    const centerY = windowDefinition.sillHeight + windowDefinition.height / 2;

    return (
        <group position={[windowDefinition.position.x, centerY, windowDefinition.position.z]}>
            <mesh>
                <boxGeometry
                    args={horizontal
                        ? [windowDefinition.width, windowDefinition.height, 0.035]
                        : [0.035, windowDefinition.height, windowDefinition.width]}
                />
                {buildRoomMaterial(windowDefinition.material, 0.36)}
            </mesh>
            <mesh>
                <boxGeometry
                    args={horizontal
                        ? [windowDefinition.width + 0.08, windowDefinition.height + 0.08, 0.045]
                        : [0.045, windowDefinition.height + 0.08, windowDefinition.width + 0.08]}
                />
                <meshBasicMaterial color={frameColor} transparent opacity={0.22} wireframe />
            </mesh>
            <mesh>
                <boxGeometry
                    args={horizontal
                        ? [0.035, windowDefinition.height, 0.052]
                        : [0.052, windowDefinition.height, 0.035]}
                />
                <meshBasicMaterial color={frameColor} />
            </mesh>
        </group>
    );
}
