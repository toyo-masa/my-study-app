import React, { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Size3D } from './types';

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

function LoadedFurnitureModel({ modelPath, size }: { modelPath: string; size: Size3D }) {
    const gltf = useGLTF(modelPath);
    const clonedScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

    return (
        <group scale={[size.width, size.height, size.depth]}>
            <primitive object={clonedScene} />
        </group>
    );
}

type FurnitureModelProps = {
    modelPath?: string;
    size: Size3D;
    useRealModel: boolean;
    fallback: React.ReactNode;
};

export function FurnitureModel({ modelPath, size, useRealModel, fallback }: FurnitureModelProps) {
    if (!useRealModel || !modelPath) {
        return <>{fallback}</>;
    }

    return (
        <ModelErrorBoundary fallback={fallback} resetKey={modelPath}>
            <Suspense fallback={fallback}>
                <LoadedFurnitureModel modelPath={modelPath} size={size} />
            </Suspense>
        </ModelErrorBoundary>
    );
}
