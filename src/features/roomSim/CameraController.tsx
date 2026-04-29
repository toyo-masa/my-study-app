import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { clampPointToAreas } from './areaUtils';
import { walkableAreas } from './roomData';
import type { CameraPreset, RoomSimSettings } from './types';

type CameraControllerProps = {
    settings: RoomSimSettings;
    activePreset: CameraPreset;
    furnitureDragging: boolean;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function syncAnglesFromTarget(
    position: THREE.Vector3,
    target: THREE.Vector3,
    yawRef: MutableRefObject<number>,
    pitchRef: MutableRefObject<number>,
) {
    const direction = target.clone().sub(position).normalize();
    yawRef.current = Math.atan2(direction.x, direction.z);
    pitchRef.current = Math.asin(clamp(direction.y, -0.9, 0.9));
}

function isEditableElement(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
}

function isMovementKey(key: string): boolean {
    return ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key);
}

export function CameraController({ settings, activePreset, furnitureDragging }: CameraControllerProps) {
    const { camera, gl } = useThree();
    const controlsRef = useRef<OrbitControlsImpl | null>(null);
    const keysRef = useRef<Set<string>>(new Set());
    const isLookingRef = useRef(false);
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
    const yawRef = useRef(0);
    const pitchRef = useRef(-0.3);
    const furnitureDraggingRef = useRef(furnitureDragging);
    const movementEnabledRef = useRef(false);

    useEffect(() => {
        furnitureDraggingRef.current = furnitureDragging;
    }, [furnitureDragging]);

    useEffect(() => {
        if (settings.viewMode !== 'walkthrough') {
            movementEnabledRef.current = false;
            keysRef.current.clear();
        }
    }, [settings.viewMode]);

    useEffect(() => {
        const positionY = activePreset.mode === 'walkthrough' ? settings.eyeHeight : activePreset.position.y;
        const position = new THREE.Vector3(activePreset.position.x, positionY, activePreset.position.z);
        const target = new THREE.Vector3(activePreset.target.x, activePreset.target.y, activePreset.target.z);

        camera.position.copy(position);
        camera.lookAt(target);
        syncAnglesFromTarget(position, target, yawRef, pitchRef);

        if (controlsRef.current) {
            controlsRef.current.target.copy(target);
            controlsRef.current.update();
        }
    }, [activePreset, camera, settings.eyeHeight]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();

            if (!isMovementKey(key)) {
                return;
            }

            if (isEditableElement(event.target) || settings.viewMode !== 'walkthrough' || !movementEnabledRef.current) {
                keysRef.current.delete(key);
                return;
            }

            event.preventDefault();
            keysRef.current.add(key);
        };
        const handleKeyUp = (event: KeyboardEvent) => {
            keysRef.current.delete(event.key.toLowerCase());
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [settings.viewMode]);

    useEffect(() => {
        const canvas = gl.domElement;

        const handlePointerDown = (event: PointerEvent) => {
            if (settings.viewMode !== 'walkthrough' || furnitureDraggingRef.current || event.button !== 0) {
                return;
            }

            movementEnabledRef.current = true;
            isLookingRef.current = true;
            lastPointerRef.current = { x: event.clientX, y: event.clientY };
        };

        const handleWindowPointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !canvas.contains(event.target)) {
                movementEnabledRef.current = false;
                keysRef.current.clear();
            }
        };

        const handlePointerMove = (event: PointerEvent) => {
            if (!isLookingRef.current || !lastPointerRef.current || furnitureDraggingRef.current) {
                return;
            }

            const deltaX = event.clientX - lastPointerRef.current.x;
            const deltaY = event.clientY - lastPointerRef.current.y;
            yawRef.current -= deltaX * 0.004;
            pitchRef.current = clamp(pitchRef.current - deltaY * 0.003, -0.8, 0.55);
            lastPointerRef.current = { x: event.clientX, y: event.clientY };
        };

        const handlePointerUp = () => {
            isLookingRef.current = false;
            lastPointerRef.current = null;
        };

        canvas.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('pointerdown', handleWindowPointerDown);
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        return () => {
            canvas.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('pointerdown', handleWindowPointerDown);
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [gl.domElement, settings.viewMode]);

    useFrame((_, delta) => {
        if (settings.viewMode !== 'walkthrough') {
            return;
        }

        const keys = keysRef.current;
        const speed = 2.1 * delta;
        const movementEnabled = movementEnabledRef.current;
        const forward = movementEnabled ? Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown')) : 0;
        const side = movementEnabled ? Number(keys.has('a') || keys.has('arrowleft')) - Number(keys.has('d') || keys.has('arrowright')) : 0;
        const sin = Math.sin(yawRef.current);
        const cos = Math.cos(yawRef.current);

        if (forward !== 0 || side !== 0) {
            const nextX = camera.position.x + (sin * forward + cos * side) * speed;
            const nextZ = camera.position.z + (cos * forward - sin * side) * speed;
            const clampedPoint = clampPointToAreas(walkableAreas, { x: nextX, z: nextZ }, { width: 0.22, depth: 0.22 }, 0.01);

            camera.position.set(
                clampedPoint.x,
                settings.eyeHeight,
                clampedPoint.z,
            );
        } else {
            camera.position.set(camera.position.x, settings.eyeHeight, camera.position.z);
        }

        const lookDirection = new THREE.Vector3(
            Math.sin(yawRef.current) * Math.cos(pitchRef.current),
            Math.sin(pitchRef.current),
            Math.cos(yawRef.current) * Math.cos(pitchRef.current),
        );
        camera.lookAt(camera.position.clone().add(lookDirection));
    });

    return settings.viewMode === 'overview' ? (
        <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={3}
            maxDistance={26}
            maxPolarAngle={Math.PI / 2.05}
        />
    ) : null;
}
