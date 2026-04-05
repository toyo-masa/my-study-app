export type Vector2 = {
    x: number;
    y: number;
};

export type Matrix2 = {
    a11: number;
    a12: number;
    a21: number;
    a22: number;
};

export type MatrixPreset = {
    id: string;
    label: string;
    matrix: Matrix2;
};

export const EPS = 1e-8;
const STRUCTURE_EPS = 0.05;
const DESCRIPTION_EPS = 0.15;

export const IDENTITY_MATRIX: Matrix2 = {
    a11: 1,
    a12: 0,
    a21: 0,
    a22: 1,
};

export const BASIS_E1: Vector2 = { x: 1, y: 0 };
export const BASIS_E2: Vector2 = { x: 0, y: 1 };

export const MATRIX_PRESETS: MatrixPreset[] = [
    { id: 'identity', label: '単位行列', matrix: { a11: 1, a12: 0, a21: 0, a22: 1 } },
    { id: 'scale-x', label: 'x方向拡大', matrix: { a11: 2, a12: 0, a21: 0, a22: 1 } },
    { id: 'scale-y', label: 'y方向拡大', matrix: { a11: 1, a12: 0, a21: 0, a22: 2 } },
    { id: 'scale-uniform', label: '一様拡大', matrix: { a11: 2, a12: 0, a21: 0, a22: 2 } },
    { id: 'reflect-x', label: '反転（x軸）', matrix: { a11: 1, a12: 0, a21: 0, a22: -1 } },
    { id: 'reflect-y', label: '反転（y軸）', matrix: { a11: -1, a12: 0, a21: 0, a22: 1 } },
    { id: 'shear-x', label: 'せん断 x', matrix: { a11: 1, a12: 1, a21: 0, a22: 1 } },
    { id: 'shear-y', label: 'せん断 y', matrix: { a11: 1, a12: 0, a21: 1, a22: 1 } },
    { id: 'project-x', label: '射影 x軸', matrix: { a11: 1, a12: 0, a21: 0, a22: 0 } },
    { id: 'project-y', label: '射影 y軸', matrix: { a11: 0, a12: 0, a21: 0, a22: 1 } },
    { id: 'rotate-90', label: '90度回転', matrix: { a11: 0, a12: -1, a21: 1, a22: 0 } },
    { id: 'rotate-45', label: '45度回転', matrix: { a11: 0.7071, a12: -0.7071, a21: 0.7071, a22: 0.7071 } },
];

export function clampValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function roundToStep(value: number, step: number): number {
    return Math.round(value / step) * step;
}

export function applyMatrix(matrix: Matrix2, vector: Vector2): Vector2 {
    return {
        x: matrix.a11 * vector.x + matrix.a12 * vector.y,
        y: matrix.a21 * vector.x + matrix.a22 * vector.y,
    };
}

export function multiplyMatrices(left: Matrix2, right: Matrix2): Matrix2 {
    return {
        a11: left.a11 * right.a11 + left.a12 * right.a21,
        a12: left.a11 * right.a12 + left.a12 * right.a22,
        a21: left.a21 * right.a11 + left.a22 * right.a21,
        a22: left.a21 * right.a12 + left.a22 * right.a22,
    };
}

export function determinant(matrix: Matrix2): number {
    return matrix.a11 * matrix.a22 - matrix.a12 * matrix.a21;
}

export function vectorNorm(vector: Vector2): number {
    return Math.hypot(vector.x, vector.y);
}

export function dotProduct(left: Vector2, right: Vector2): number {
    return left.x * right.x + left.y * right.y;
}

export function normalizeVector(vector: Vector2): Vector2 | null {
    const length = vectorNorm(vector);
    if (length <= EPS) {
        return null;
    }
    return {
        x: vector.x / length,
        y: vector.y / length,
    };
}

export function inverseMatrix(matrix: Matrix2): Matrix2 | null {
    const det = determinant(matrix);
    if (Math.abs(det) <= EPS) {
        return null;
    }

    return {
        a11: matrix.a22 / det,
        a12: -matrix.a12 / det,
        a21: -matrix.a21 / det,
        a22: matrix.a11 / det,
    };
}

export function maxAbsDiff(left: Matrix2, right: Matrix2): number {
    return Math.max(
        Math.abs(left.a11 - right.a11),
        Math.abs(left.a12 - right.a12),
        Math.abs(left.a21 - right.a21),
        Math.abs(left.a22 - right.a22),
    );
}

export function areMatricesCommutative(left: Matrix2, right: Matrix2): boolean {
    return maxAbsDiff(multiplyMatrices(left, right), multiplyMatrices(right, left)) <= EPS;
}

export function isZeroMatrix(matrix: Matrix2): boolean {
    return (
        Math.abs(matrix.a11) <= EPS &&
        Math.abs(matrix.a12) <= EPS &&
        Math.abs(matrix.a21) <= EPS &&
        Math.abs(matrix.a22) <= EPS
    );
}

export function rankOfMatrix(matrix: Matrix2): number {
    if (isZeroMatrix(matrix)) {
        return 0;
    }
    if (Math.abs(determinant(matrix)) > EPS) {
        return 2;
    }
    return 1;
}

export function nullityOfMatrix(matrix: Matrix2): number {
    return 2 - rankOfMatrix(matrix);
}

export function kernelDirection(matrix: Matrix2): Vector2 | null {
    const rank = rankOfMatrix(matrix);
    if (rank !== 1) {
        return null;
    }

    const row1 = { x: matrix.a11, y: matrix.a12 };
    const row2 = { x: matrix.a21, y: matrix.a22 };
    const baseRow = vectorNorm(row1) >= vectorNorm(row2) ? row1 : row2;
    const direction = normalizeVector({ x: baseRow.y, y: -baseRow.x });

    if (direction) {
        return direction;
    }

    return normalizeVector({ x: 1, y: 0 });
}

export function matrixColumns(matrix: Matrix2): [Vector2, Vector2] {
    return [
        { x: matrix.a11, y: matrix.a21 },
        { x: matrix.a12, y: matrix.a22 },
    ];
}

export function unitSquarePoints(): Vector2[] {
    return [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
    ];
}

export function unitCirclePoints(segments = 64): Vector2[] {
    const points: Vector2[] = [];
    for (let index = 0; index < segments; index += 1) {
        const theta = (index / segments) * Math.PI * 2;
        points.push({
            x: Math.cos(theta),
            y: Math.sin(theta),
        });
    }
    return points;
}

export function helperLinePoints(extent = 3.2): Vector2[] {
    return [
        { x: -extent, y: -extent * 0.5 },
        { x: extent, y: extent * 0.5 },
    ];
}

export function imageSamplePoints(): Vector2[] {
    const points: Vector2[] = [];
    for (let x = -2; x <= 2 + EPS; x += 0.5) {
        for (let y = -2; y <= 2 + EPS; y += 0.5) {
            points.push({
                x: Number(x.toFixed(4)),
                y: Number(y.toFixed(4)),
            });
        }
    }
    return points;
}

export function imageClassification(rank: number): string {
    if (rank === 2) return 'image: 2次元（平面）';
    if (rank === 1) return 'image: 1次元（直線）';
    return 'image: 0次元（原点）';
}

export function kernelClassification(rank: number): string {
    if (rank === 2) return 'kernel: 0次元（{0}）';
    if (rank === 1) return 'kernel: 1次元（直線）';
    return 'kernel: 2次元（平面全体）';
}

export function imageKernelExplanation(rank: number): string {
    if (rank === 2) {
        return 'この行列は平面全体を保つため、像は平面、核は 0 ベクトルのみです。';
    }
    if (rank === 1) {
        return 'この行列は 1 方向へ潰すため、像は直線、核も 1 本の直線になります。';
    }
    return 'この行列はすべてを 0 に送るため、像は原点のみで、核は平面全体です。';
}

export function formatScalar(value: number, digits = 2): string {
    const normalized = Math.abs(value) <= EPS ? 0 : value;
    const rounded = Number(normalized.toFixed(digits));
    return `${rounded}`;
}

export function formatVector(vector: Vector2, digits = 2): string {
    return `(${formatScalar(vector.x, digits)}, ${formatScalar(vector.y, digits)})^T`;
}

export function matrixToGrid(matrix: Matrix2): [[number, number], [number, number]] {
    return [
        [matrix.a11, matrix.a12],
        [matrix.a21, matrix.a22],
    ];
}

export function describeLinearTransformation(matrix: Matrix2): string {
    const rank = rankOfMatrix(matrix);
    const det = determinant(matrix);

    if (rank === 0) {
        return 'すべてを原点へ潰している';
    }

    if (rank === 1) {
        return '平面を1本の直線へ潰している';
    }

    const descriptions: string[] = [];
    const offDiagonalSmall = Math.abs(matrix.a12) <= STRUCTURE_EPS && Math.abs(matrix.a21) <= STRUCTURE_EPS;

    if (offDiagonalSmall) {
        if (matrix.a11 < -EPS) {
            descriptions.push('x軸方向を反転している');
        }
        if (matrix.a22 < -EPS) {
            descriptions.push('y軸方向を反転している');
        }

        const absX = Math.abs(matrix.a11);
        const absY = Math.abs(matrix.a22);
        if (Math.abs(absX - absY) <= DESCRIPTION_EPS) {
            if (Math.abs(absX - 1) > DESCRIPTION_EPS) {
                descriptions.push('一様に近い伸び縮みをしている');
            }
        } else if (absX > absY) {
            descriptions.push('x方向の伸び縮みが大きい');
        } else {
            descriptions.push('y方向の伸び縮みが大きい');
        }
    } else {
        const [column1, column2] = matrixColumns(matrix);
        const length1 = vectorNorm(column1);
        const length2 = vectorNorm(column2);
        const normalized1 = normalizeVector(column1);
        const normalized2 = normalizeVector(column2);
        const dot = normalized1 && normalized2 ? Math.abs(dotProduct(normalized1, normalized2)) : 1;

        if (dot <= DESCRIPTION_EPS && Math.abs(length1 - length2) <= DESCRIPTION_EPS) {
            descriptions.push('回転を含む');
        } else {
            descriptions.push('せん断や軸の混ざりを含む');
        }
    }

    if (det < -EPS) {
        descriptions.push('向きを反転している');
    }

    if (descriptions.length === 0) {
        if (det > EPS) {
            return '向きを保つ線形変換である';
        }
        return '線形変換である';
    }

    return descriptions.join('／');
}
