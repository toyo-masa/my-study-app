import { Ceiling } from './Ceiling';
import { Door } from './Door';
import { FixedEquipment } from './FixedEquipment';
import { Floor } from './Floor';
import { Wall } from './Wall';
import { Window } from './Window';
import { doors, fixedEquipments, openings, rooms, walls, windows } from './roomData';
import type { OpeningDefinition } from './types';

type RoomShellProps = {
    transparentWalls: boolean;
};

function OpeningMarker({ opening }: { opening: OpeningDefinition }) {
    const horizontal = opening.orientation === 'north' || opening.orientation === 'south';

    return (
        <mesh position={[opening.position.x, 0.025, opening.position.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={horizontal ? [opening.width, 0.045] : [0.045, opening.width]} />
            <meshBasicMaterial color="#0ea5e9" transparent opacity={0.34} />
        </mesh>
    );
}

export function RoomShell({ transparentWalls }: RoomShellProps) {
    return (
        <group>
            {rooms.map((room) => (
                <Floor key={room.id} room={room} />
            ))}
            {walls.map((wall) => (
                <Wall key={wall.id} wall={wall} transparent={transparentWalls} />
            ))}
            {windows.map((windowDefinition) => (
                <Window key={windowDefinition.id} windowDefinition={windowDefinition} />
            ))}
            {doors.map((door) => (
                <Door key={door.id} door={door} />
            ))}
            {openings.map((opening) => (
                <OpeningMarker key={opening.id} opening={opening} />
            ))}
            {fixedEquipments.map((equipment) => (
                <FixedEquipment key={equipment.id} equipment={equipment} />
            ))}
            <Ceiling />
            <mesh position={[0, 1.45, 8.35]}>
                <boxGeometry args={[6.2, 2.5, 0.04]} />
                <meshBasicMaterial color="#b7d7e8" transparent opacity={0.28} />
            </mesh>
        </group>
    );
}
