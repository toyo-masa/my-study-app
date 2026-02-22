import React from 'react';

interface NotFoundViewProps {
    message?: string;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({
    message = '問題集が見つかりませんでした。',
}) => {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>{message}</div>;
};
