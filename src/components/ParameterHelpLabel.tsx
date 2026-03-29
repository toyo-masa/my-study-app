import React from 'react';

type ParameterHelpLabelProps = {
    label: string;
    tooltip: string;
    className?: string;
    helpClassName?: string;
};

export const ParameterHelpLabel: React.FC<ParameterHelpLabelProps> = ({
    label,
    tooltip,
    className = 'parameter-help-label',
    helpClassName = 'parameter-help-label-mark',
}) => (
    <span className={className}>
        <span>{label}</span>
        <span className={`${helpClassName} local-llm-tooltip-target`} data-tooltip={tooltip}>
            ?
        </span>
    </span>
);
