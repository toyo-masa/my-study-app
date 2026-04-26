import { Box, Palette } from 'lucide-react';
import { findCatalogItem } from './furnitureCatalog';
import { furnitureMaterialOptions, furnitureStylePresets } from './furnitureMaterials';
import type { FurnitureDefinition, FurnitureRenderMode, FurnitureStyle, MaterialKey } from './types';

type FurnitureStyleControlsProps = {
    globalStyle: FurnitureStyle;
    selectedFurniture: FurnitureDefinition | null;
    onGlobalStyleChange: (style: FurnitureStyle) => void;
    onUpdateFurnitureDesign: (id: string, variant: string, material: MaterialKey, color: string) => void;
    onUpdateFurnitureRenderMode: (id: string, renderMode: FurnitureRenderMode) => void;
};

const styleOrder: FurnitureStyle[] = ['natural', 'modern', 'hotelLike', 'scandinavian'];

export function FurnitureStyleControls({
    globalStyle,
    selectedFurniture,
    onGlobalStyleChange,
    onUpdateFurnitureDesign,
    onUpdateFurnitureRenderMode,
}: FurnitureStyleControlsProps) {
    const catalogItem = selectedFurniture ? findCatalogItem(selectedFurniture.category) : null;

    return (
        <section className="room-sim-panel-section">
            <div className="room-sim-panel-heading">
                <Palette size={16} />
                <h2>家具デザイン</h2>
            </div>

            <div className="room-sim-style-grid" aria-label="全体スタイル">
                {styleOrder.map((style) => (
                    <button
                        key={style}
                        type="button"
                        className={globalStyle === style ? 'is-active' : ''}
                        onClick={() => onGlobalStyleChange(style)}
                    >
                        <span>{furnitureStylePresets[style].label}</span>
                    </button>
                ))}
            </div>

            {selectedFurniture && catalogItem ? (
                <div className="room-sim-selected-card">
                    <div className="room-sim-control-group">
                        <label className="room-sim-field-label" htmlFor="room-sim-design-variant">
                            デザインタイプ
                        </label>
                        <select
                            id="room-sim-design-variant"
                            className="room-sim-select"
                            value={selectedFurniture.variant}
                            onChange={(event) => {
                                const design = catalogItem.designOptions.find((item) => item.id === event.target.value);
                                if (design) {
                                    onUpdateFurnitureDesign(selectedFurniture.id, design.id, design.material, design.color);
                                }
                            }}
                        >
                            {catalogItem.designOptions.map((design) => (
                                <option key={design.id} value={design.id}>
                                    {design.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="room-sim-control-group">
                        <label className="room-sim-field-label" htmlFor="room-sim-material">
                            素材
                        </label>
                        <select
                            id="room-sim-material"
                            className="room-sim-select"
                            value={selectedFurniture.material}
                            onChange={(event) => {
                                const materialKey = event.target.value as MaterialKey;
                                const material = furnitureMaterialOptions.find((item) => item.key === materialKey);
                                onUpdateFurnitureDesign(
                                    selectedFurniture.id,
                                    selectedFurniture.variant,
                                    materialKey,
                                    material?.color ?? selectedFurniture.color,
                                );
                            }}
                        >
                            {furnitureMaterialOptions.map((material) => (
                                <option key={material.key} value={material.key}>
                                    {material.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <label className="room-sim-color-field">
                        色
                        <input
                            type="color"
                            value={selectedFurniture.color}
                            onChange={(event) => onUpdateFurnitureDesign(
                                selectedFurniture.id,
                                selectedFurniture.variant,
                                selectedFurniture.material,
                                event.target.value,
                            )}
                        />
                        <span>{selectedFurniture.color}</span>
                    </label>

                    <div className="room-sim-segmented" aria-label="家具表示モード">
                        <button
                            type="button"
                            className={selectedFurniture.renderMode === 'simple' ? 'is-active' : ''}
                            onClick={() => onUpdateFurnitureRenderMode(selectedFurniture.id, 'simple')}
                        >
                            <Box size={14} />
                            簡易表示
                        </button>
                        <button
                            type="button"
                            className={selectedFurniture.renderMode === 'real' ? 'is-active' : ''}
                            onClick={() => onUpdateFurnitureRenderMode(selectedFurniture.id, 'real')}
                        >
                            <Box size={14} />
                            リアル表示
                        </button>
                    </div>
                </div>
            ) : (
                <p className="room-sim-muted-text">家具を選択すると、色・素材・表示方式を変更できます。</p>
            )}
        </section>
    );
}
