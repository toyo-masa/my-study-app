export const buildLocalApiModelOptionList = (
    availableModelIds: string[],
    extraModelIds: string[] = []
) => {
    const orderedModelIds: string[] = [];
    const seen = new Set<string>();

    const appendModelId = (modelId: string) => {
        const trimmed = modelId.trim();
        if (trimmed.length === 0 || seen.has(trimmed)) {
            return;
        }

        seen.add(trimmed);
        orderedModelIds.push(trimmed);
    };

    availableModelIds.forEach(appendModelId);
    extraModelIds.forEach(appendModelId);

    return orderedModelIds;
};
