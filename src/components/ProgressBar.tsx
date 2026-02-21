import React from 'react';

interface ProgressBarProps {
    current: number;
    total: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
    const percentage = Math.round((current / total) * 100);

    return (
        <div className="progress-container">
            <div className="progress-info">
                <span>{current} / {total}</span>
            </div>
            <div className="progress-track">
                <div
                    className="progress-fill"
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};
