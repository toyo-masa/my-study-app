import { Eye, EyeOff, MousePointer2, PackagePlus, RotateCw, Save, Trash2 } from 'lucide-react';
import { furnitureCatalog } from './furnitureCatalog';
import type { FurnitureCategory, FurnitureDefinition, FurnitureStyle, Vector3Meters } from './types';

type FurnitureControlsProps = {
    furniture: FurnitureDefinition[];
    selectedFurniture: FurnitureDefinition | null;
    layoutSaveStatus: string;
    globalStyle: FurnitureStyle;
    onAddFurniture: (category: FurnitureCategory, style: FurnitureStyle) => void;
    onDeleteFurniture: (id: string) => void;
    onMoveFurniture: (id: string, position: Vector3Meters) => void;
    onRotateFurniture: (id: string, deltaDegrees?: number) => void;
    onSetFurnitureRotation: (id: string, rotation: number) => void;
    onToggleFurnitureVisibility: (id: string) => void;
    onResetFurniture: () => void;
};

function formatMeters(value: number): string {
    return `${value.toFixed(2)}m`;
}

export function FurnitureControls({
    furniture,
    selectedFurniture,
    layoutSaveStatus,
    globalStyle,
    onAddFurniture,
    onDeleteFurniture,
    onMoveFurniture,
    onRotateFurniture,
    onSetFurnitureRotation,
    onToggleFurnitureVisibility,
    onResetFurniture,
}: FurnitureControlsProps) {
    const handleDelete = () => {
        if (!selectedFurniture) {
            return;
        }

        const confirmed = window.confirm(`「${selectedFurniture.name}」を削除しますか？`);
        if (confirmed) {
            onDeleteFurniture(selectedFurniture.id);
        }
    };

    const handlePositionChange = (axis: 'x' | 'z', value: number) => {
        if (!selectedFurniture || Number.isNaN(value)) {
            return;
        }

        onMoveFurniture(selectedFurniture.id, {
            ...selectedFurniture.position,
            [axis]: value,
        });
    };

    return (
        <section className="room-sim-panel-section">
            <div className="room-sim-panel-heading">
                <MousePointer2 size={16} />
                <h2>家具操作</h2>
            </div>

            {selectedFurniture ? (
                <div className="room-sim-selected-card">
                    <div className="room-sim-selected-head">
                        <strong>{selectedFurniture.name}</strong>
                        <span>{selectedFurniture.category}</span>
                    </div>
                    <dl className="room-sim-data-grid">
                        <div>
                            <dt>幅</dt>
                            <dd>{formatMeters(selectedFurniture.size.width)}</dd>
                        </div>
                        <div>
                            <dt>奥行</dt>
                            <dd>{formatMeters(selectedFurniture.size.depth)}</dd>
                        </div>
                        <div>
                            <dt>高さ</dt>
                            <dd>{formatMeters(selectedFurniture.size.height)}</dd>
                        </div>
                    </dl>
                    <div className="room-sim-inline-fields">
                        <label>
                            X
                            <input
                                type="number"
                                step="0.05"
                                value={selectedFurniture.position.x.toFixed(2)}
                                onChange={(event) => handlePositionChange('x', Number(event.target.value))}
                            />
                        </label>
                        <label>
                            Z
                            <input
                                type="number"
                                step="0.05"
                                value={selectedFurniture.position.z.toFixed(2)}
                                onChange={(event) => handlePositionChange('z', Number(event.target.value))}
                            />
                        </label>
                    </div>
                    <div className="room-sim-control-group">
                        <label className="room-sim-field-label" htmlFor="room-sim-furniture-rotation">
                            回転 {Math.round(selectedFurniture.rotation)}度
                        </label>
                        <input
                            id="room-sim-furniture-rotation"
                            type="range"
                            min="0"
                            max="345"
                            step="15"
                            value={selectedFurniture.rotation}
                            onChange={(event) => onSetFurnitureRotation(selectedFurniture.id, Number(event.target.value))}
                        />
                    </div>
                    <div className="room-sim-action-grid">
                        <button type="button" className="room-sim-secondary-btn" onClick={() => onRotateFurniture(selectedFurniture.id, 90)}>
                            <RotateCw size={15} />
                            90度回転
                        </button>
                        <button type="button" className="room-sim-danger-btn" onClick={handleDelete}>
                            <Trash2 size={15} />
                            削除
                        </button>
                    </div>
                </div>
            ) : (
                <p className="room-sim-muted-text">家具をクリックすると、サイズ・位置・回転を確認できます。</p>
            )}

            <div className="room-sim-control-group">
                <div className="room-sim-subheading">
                    <PackagePlus size={15} />
                    家具追加
                </div>
                <div className="room-sim-catalog-grid">
                    {furnitureCatalog.map((item) => (
                        <button
                            key={item.furnitureId}
                            type="button"
                            onClick={() => onAddFurniture(item.category, globalStyle)}
                        >
                            {item.displayName}
                        </button>
                    ))}
                </div>
            </div>

            <div className="room-sim-control-group">
                <div className="room-sim-subheading">家具ごとの表示</div>
                <div className="room-sim-furniture-list">
                    {furniture.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={item.visible ? 'is-visible' : ''}
                            onClick={() => onToggleFurnitureVisibility(item.id)}
                        >
                            {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            {item.name}
                        </button>
                    ))}
                </div>
            </div>

            <button type="button" className="room-sim-secondary-btn room-sim-full-width-btn" onClick={onResetFurniture}>
                初期配置に戻す
            </button>

            <p className="room-sim-save-status">
                <Save size={14} />
                {layoutSaveStatus}
            </p>
        </section>
    );
}
