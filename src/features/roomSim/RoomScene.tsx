import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { cameraPresets } from './cameraPresets';
import { CameraController } from './CameraController';
import { Furniture } from './Furniture';
import { roomLightingPresets } from './lighting';
import { RoomShell } from './RoomShell';
import { roomBounds } from './roomData';
import type { FurnitureDefinition, RoomSimSettings, Vector3Meters } from './types';

type RoomSceneProps = {
    furniture: FurnitureDefinition[];
    selectedFurnitureId: string | null;
    settings: RoomSimSettings;
    onSelectFurniture: (id: string | null) => void;
    onMoveFurniture: (id: string, position: Vector3Meters) => void;
    onCanvasReady: (canvas: HTMLCanvasElement) => void;
};

function SceneLighting({ mode }: { mode: RoomSimSettings['lightingMode'] }) {
    const preset = roomLightingPresets[mode];

    return (
        <>
            <color attach="background" args={[preset.backgroundColor]} />
            <ambientLight intensity={preset.ambientIntensity} />
            <directionalLight
                position={preset.directionalPosition}
                intensity={preset.directionalIntensity}
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
            />
            <pointLight position={preset.pointPosition} intensity={preset.pointIntensity} distance={8} />
        </>
    );
}

export function RoomScene({
    furniture,
    selectedFurnitureId,
    settings,
    onSelectFurniture,
    onMoveFurniture,
    onCanvasReady,
}: RoomSceneProps) {
    const [draggingFurnitureId, setDraggingFurnitureId] = useState<string | null>(null);
    const activePreset = useMemo(
        () => cameraPresets.find((preset) => preset.id === settings.activeCameraPresetId) ?? cameraPresets[0],
        [settings.activeCameraPresetId],
    );
    const dragPlaneWidth = roomBounds.maxX - roomBounds.minX;
    const dragPlaneDepth = roomBounds.maxZ - roomBounds.minZ;
    const dragPlaneCenterZ = (roomBounds.minZ + roomBounds.maxZ) / 2;

    useEffect(() => {
        const handlePointerUp = () => {
            setDraggingFurnitureId(null);
        };

        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, []);

    const handleFurniturePointerDown = (id: string, event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        onSelectFurniture(id);
        setDraggingFurnitureId(id);
    };

    const handleDragMove = (event: ThreeEvent<PointerEvent>) => {
        if (!draggingFurnitureId) {
            return;
        }

        event.stopPropagation();
        const targetFurniture = furniture.find((item) => item.id === draggingFurnitureId);
        if (!targetFurniture) {
            return;
        }

        onMoveFurniture(draggingFurnitureId, {
            x: event.point.x,
            y: targetFurniture.position.y,
            z: event.point.z,
        });
    };

    return (
        <Canvas
            className="room-sim-canvas"
            shadows
            camera={{ position: [0, 16.5, 1.0], fov: 52, near: 0.05, far: 80 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            onCreated={({ gl }) => {
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                onCanvasReady(gl.domElement);
            }}
            onPointerMissed={() => {
                if (!draggingFurnitureId) {
                    onSelectFurniture(null);
                }
            }}
        >
            <SceneLighting mode={settings.lightingMode} />
            <RoomShell transparentWalls={settings.transparentWalls} showRoomLabels={settings.showRoomLabels} />
            {settings.furnitureVisible && furniture.map((item) => (
                <Furniture
                    key={item.id}
                    furniture={item}
                    selected={item.id === selectedFurnitureId}
                    onPointerDown={handleFurniturePointerDown}
                />
            ))}
            <mesh
                position={[0, 0.012, dragPlaneCenterZ]}
                rotation={[-Math.PI / 2, 0, 0]}
                onPointerMove={handleDragMove}
                onPointerUp={() => setDraggingFurnitureId(null)}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    if (!draggingFurnitureId) {
                        onSelectFurniture(null);
                    }
                }}
            >
                <planeGeometry args={[dragPlaneWidth, dragPlaneDepth]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <gridHelper args={[14, 28, '#94a3b8', '#cbd5e1']} position={[0, 0.018, 1]} />
            <CameraController settings={settings} activePreset={activePreset} furnitureDragging={draggingFurnitureId !== null} />
        </Canvas>
    );
}
