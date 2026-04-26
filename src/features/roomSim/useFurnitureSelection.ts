import { useMemo, useState } from 'react';
import type { FurnitureDefinition } from './types';

export function useFurnitureSelection(furniture: FurnitureDefinition[]) {
    const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);

    const selectedFurniture = useMemo(
        () => furniture.find((item) => item.id === selectedFurnitureId) ?? null,
        [furniture, selectedFurnitureId],
    );

    const clearSelection = () => {
        setSelectedFurnitureId(null);
    };

    return {
        selectedFurnitureId,
        selectedFurniture,
        setSelectedFurnitureId,
        clearSelection,
    };
}
