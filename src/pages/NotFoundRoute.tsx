import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const NotFoundRoute: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="review-board-page">
            <div className="detail-header review-board-header">
                <button className="nav-btn" onClick={() => navigate('/')}>
                    <ArrowLeft size={16} /> ホームへ戻る
                </button>
            </div>
            <div
                style={{
                    padding: '2rem 1rem',
                    textAlign: 'center',
                    border: '1px solid var(--border-color)',
                    borderRadius: 14,
                    background: 'var(--bg-secondary)',
                }}
            >
                <pre
                    style={{
                        margin: 0,
                        marginBottom: '1rem',
                        display: 'inline-block',
                        textAlign: 'left',
                        fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
                        fontSize: 'clamp(0.66rem, 1.55vw, 0.96rem)',
                        lineHeight: 1.42,
                        color: 'var(--text-primary)',
                        whiteSpace: 'pre',
                        overflowX: 'auto',
                    }}
                    aria-label="ASCII 404 NOT FOUND"
                >
{` _  _    ___   _  _
| || |  / _ \\ | || |
| || |_| | | || || |_
|__   _| | | ||__   _|
   | |  | |_| |   | |
   |_|   \\___/    |_|

 _   _  ___ _____   ___   ___  _   _ _  _ ___
| \\ | |/ _ \\_   _| | __| / _ \\| | | | \\| |   \\
|  \\| | (_) || |   | _| | (_) | |_| | .\` | |) |
|_| \\_|\\___/ |_|   |_|   \\___/ \\___/|_|\\_|___/

 /\\_/\\
( o.o )
 > ^ <`}
                </pre>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>404 - ページが見つかりませんでした。</p>
            </div>
        </div>
    );
};
