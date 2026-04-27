import React, { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { Size3D } from './types';

type ModelFitMode = 'preserveAspect' | 'stretch';

type ModelErrorBoundaryProps = {
    children: React.ReactNode;
    fallback: React.ReactNode;
    resetKey: string;
};

type ModelErrorBoundaryState = {
    hasError: boolean;
};

class ModelErrorBoundary extends React.Component<ModelErrorBoundaryProps, ModelErrorBoundaryState> {
    state: ModelErrorBoundaryState = {
        hasError: false,
    };

    static getDerivedStateFromError(): ModelErrorBoundaryState {
        return { hasError: true };
    }

    componentDidUpdate(previousProps: ModelErrorBoundaryProps) {
        if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }

        return this.props.children;
    }
}

function getSafeDimension(value: number): number {
    return Math.abs(value) > 0.0001 ? value : 1;
}

function LoadedFurnitureModel({
    modelPath,
    size,
    fitMode,
}: {
    modelPath: string;
    size: Size3D;
    fitMode: ModelFitMode;
}) {
    const gltf = useGLTF(modelPath);
    const modelTransform = useMemo(() => {
        const clonedScene = gltf.scene.clone(true);
        const bounds = new THREE.Box3().setFromObject(clonedScene);
        const modelSize = new THREE.Vector3();
        const modelCenter = new THREE.Vector3();

        bounds.getSize(modelSize);
        bounds.getCenter(modelCenter);

        const scaleByAxis = new THREE.Vector3(
            size.width / getSafeDimension(modelSize.x),
            size.height / getSafeDimension(modelSize.y),
            size.depth / getSafeDimension(modelSize.z),
        );
        const scale = fitMode === 'stretch'
            ? scaleByAxis
            : new THREE.Vector3(
                Math.min(scaleByAxis.x, scaleByAxis.y, scaleByAxis.z),
                Math.min(scaleByAxis.x, scaleByAxis.y, scaleByAxis.z),
                Math.min(scaleByAxis.x, scaleByAxis.y, scaleByAxis.z),
            );
        const offset = bounds.isEmpty()
            ? new THREE.Vector3(0, 0, 0)
            : new THREE.Vector3(-modelCenter.x, -bounds.min.y, -modelCenter.z);

        return {
            clonedScene,
            offset,
            scale,
        };
    }, [fitMode, gltf.scene, size.depth, size.height, size.width]);

    return (
        <group scale={[modelTransform.scale.x, modelTransform.scale.y, modelTransform.scale.z]}>
            <primitive
                object={modelTransform.clonedScene}
                position={[modelTransform.offset.x, modelTransform.offset.y, modelTransform.offset.z]}
            />
        </group>
    );
}

type FurnitureModelProps = {
    modelPath?: string;
    size: Size3D;
    useRealModel: boolean;
    fallback: React.ReactNode;
    fitMode?: ModelFitMode;
};

export function FurnitureModel({ modelPath, size, useRealModel, fallback, fitMode = 'preserveAspect' }: FurnitureModelProps) {
    if (!useRealModel || !modelPath) {
        return <>{fallback}</>;
    }

    return (
        <ModelErrorBoundary fallback={fallback} resetKey={modelPath}>
            <Suspense fallback={fallback}>
                <LoadedFurnitureModel modelPath={modelPath} size={size} fitMode={fitMode} />
            </Suspense>
        </ModelErrorBoundary>
    );
}
