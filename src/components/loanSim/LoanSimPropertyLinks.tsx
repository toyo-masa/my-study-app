import type { LoanSimSavedPropertyLink } from '../../features/loanSim/types';

type LoanSimPropertyLinksProps = {
    linkTitle: string;
    linkUrl: string;
    linkStatus: string | null;
    savedLinks: LoanSimSavedPropertyLink[];
    onLinkTitleChange: (value: string) => void;
    onLinkUrlChange: (value: string) => void;
    onSaveLink: () => void;
    onDeleteLink: (id: string) => void;
};

function formatUpdatedAt(value: number): string {
    if (!Number.isFinite(value) || value <= 0) {
        return '更新時刻不明';
    }
    return new Date(value).toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function LoanSimPropertyLinks({
    linkTitle,
    linkUrl,
    linkStatus,
    savedLinks,
    onLinkTitleChange,
    onLinkUrlChange,
    onSaveLink,
    onDeleteLink,
}: LoanSimPropertyLinksProps) {
    return (
        <section className="loan-sim-card loan-sim-property-links-card">
            <div className="loan-sim-card-head">
                <div>
                    <h2>物件リンク置き場</h2>
                    <p>検討中の物件ページを下にまとめて保存しておけます。</p>
                </div>
                <span className="loan-sim-badge">{savedLinks.length}件</span>
            </div>

            <div className="loan-sim-link-form">
                <input
                    className="loan-sim-text-input"
                    type="text"
                    value={linkTitle}
                    placeholder="物件名やメモ"
                    aria-label="保存する物件名"
                    onChange={(event) => onLinkTitleChange(event.target.value)}
                />
                <input
                    className="loan-sim-text-input"
                    type="url"
                    value={linkUrl}
                    placeholder="https://..."
                    aria-label="保存する物件リンク"
                    onChange={(event) => onLinkUrlChange(event.target.value)}
                />
                <button type="button" className="nav-btn" onClick={onSaveLink}>
                    リンクを保存
                </button>
            </div>

            <p className="loan-sim-inline-note">
                {linkStatus ?? '物件名と URL を保存できます。URL は http / https のみ対応です。'}
            </p>

            {savedLinks.length > 0 ? (
                <div className="loan-sim-link-list">
                    {savedLinks.map((link) => (
                        <div key={link.id} className="loan-sim-link-item">
                            <div className="loan-sim-link-meta">
                                <strong>{link.title}</strong>
                                <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="loan-sim-link-url"
                                >
                                    {link.url}
                                </a>
                                <span>{formatUpdatedAt(link.updatedAt)} 保存</span>
                            </div>
                            <div className="loan-sim-link-actions">
                                <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="nav-btn"
                                >
                                    開く
                                </a>
                                <button
                                    type="button"
                                    className="nav-btn loan-sim-preset-delete-btn"
                                    onClick={() => onDeleteLink(link.id)}
                                >
                                    削除
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="loan-sim-inline-note">まだ保存した物件リンクはありません。</p>
            )}
        </section>
    );
}
