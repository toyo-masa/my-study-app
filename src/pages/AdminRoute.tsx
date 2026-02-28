import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Lock, LogIn, RefreshCw, ShieldCheck, KeyRound, Trash2, CircleCheck, X } from 'lucide-react';
import { ApiError, cloudApi, type AdminSummary, type AdminUser } from '../cloudApi';
import { useAppContext } from '../contexts/AppContext';
import { BackButton } from '../components/BackButton';
import { LoadingView } from '../components/LoadingView';
import '../App.css';

function formatDateTime(value: string | null): string {
    if (!value) {
        return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '取得時刻不明';
    }
    return date.toLocaleString('ja-JP', { hour12: false });
}

const DELETE_BUTTON_PRIMARY = '#dc2626';
const DELETE_BUTTON_SECONDARY = '#b91c1c';
const DELETE_BUTTON_BORDER = '#ef4444';

export const AdminRoute: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser, useCloudSync, setIsLoginModalOpen } = useAppContext();
    const [summary, setSummary] = useState<AdminSummary | null>(null);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [isForbidden, setIsForbidden] = useState(false);
    const [activeUserActionId, setActiveUserActionId] = useState<number | null>(null);
    const [passwordResetTarget, setPasswordResetTarget] = useState<AdminUser | null>(null);
    const [newPasswordInput, setNewPasswordInput] = useState('');
    const [passwordResetError, setPasswordResetError] = useState('');
    const [deleteUserTarget, setDeleteUserTarget] = useState<AdminUser | null>(null);
    const [deleteUserConfirmInput, setDeleteUserConfirmInput] = useState('');
    const [deleteUserError, setDeleteUserError] = useState('');
    const [deleteUserSuccessMessage, setDeleteUserSuccessMessage] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const loadAdminData = useCallback(async () => {
        if (!useCloudSync) {
            setSummary(null);
            setUsers([]);
            setIsForbidden(false);
            setErrorMessage('管理画面はクラウド同期モードでのみ利用できます。');
            setIsLoading(false);
            return;
        }

        if (!currentUser) {
            setSummary(null);
            setUsers([]);
            setIsForbidden(false);
            setErrorMessage('管理画面の表示にはログインが必要です。');
            setIsLoading(false);
            return;
        }

        if (!currentUser.isAdmin) {
            setSummary(null);
            setUsers([]);
            setIsForbidden(true);
            setErrorMessage('この画面を開く権限がありません。');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setErrorMessage('');
        setIsForbidden(false);

        try {
            const [nextSummary, nextUsers] = await Promise.all([
                cloudApi.getAdminSummary(),
                cloudApi.getAdminUsers(),
            ]);
            setSummary(nextSummary);
            setUsers(nextUsers);
        } catch (error) {
            setSummary(null);
            setUsers([]);
            if (error instanceof ApiError && error.status === 401) {
                setErrorMessage('ログイン状態の有効期限が切れました。再ログインしてください。');
                setIsLoginModalOpen(true);
                return;
            }
            if (error instanceof ApiError && error.status === 403) {
                setIsForbidden(true);
                setErrorMessage('この画面を開く権限がありません。');
                return;
            }
            setErrorMessage('管理情報の取得に失敗しました。時間をおいて再試行してください。');
        } finally {
            setIsLoading(false);
        }
    }, [currentUser, setIsLoginModalOpen, useCloudSync]);

    useEffect(() => {
        void loadAdminData();
    }, [loadAdminData]);

    const openResetPasswordModal = (target: AdminUser) => {
        setPasswordResetTarget(target);
        setNewPasswordInput('');
        setPasswordResetError('');
    };

    const closeResetPasswordModal = () => {
        if (activeUserActionId !== null) {
            return;
        }
        setPasswordResetTarget(null);
        setNewPasswordInput('');
        setPasswordResetError('');
    };

    const handleSubmitResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordResetTarget) {
            return;
        }

        const newPassword = newPasswordInput.trim();
        if (newPassword.length < 6) {
            setPasswordResetError('パスワードは6文字以上で入力してください。');
            return;
        }

        setPasswordResetError('');
        setActiveUserActionId(passwordResetTarget.id);
        try {
            await cloudApi.resetAdminUserPassword(passwordResetTarget.id, newPassword);
            window.alert(`ユーザー「${passwordResetTarget.username}」のパスワードを更新しました。既存セッションは無効化されています。`);
            setPasswordResetTarget(null);
            setNewPasswordInput('');
            await loadAdminData();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'パスワード更新に失敗しました。';
            setPasswordResetError(message);
        } finally {
            setActiveUserActionId(null);
        }
    };

    const openDeleteUserModal = (target: AdminUser) => {
        if (currentUser && currentUser.id === target.id) {
            window.alert('自分自身は削除できません。');
            return;
        }
        setDeleteUserTarget(target);
        setDeleteUserConfirmInput('');
        setDeleteUserError('');
    };

    const closeDeleteUserModal = () => {
        if (activeUserActionId !== null) {
            return;
        }
        setDeleteUserTarget(null);
        setDeleteUserConfirmInput('');
        setDeleteUserError('');
    };

    const handleConfirmDeleteUser = async () => {
        if (!deleteUserTarget) {
            return;
        }
        if (deleteUserConfirmInput !== deleteUserTarget.username) {
            setDeleteUserError('確認用のユーザー名が一致していません。');
            return;
        }

        setDeleteUserError('');
        setActiveUserActionId(deleteUserTarget.id);
        try {
            await cloudApi.deleteAdminUser(deleteUserTarget.id);
            setDeleteUserSuccessMessage(`ユーザー「${deleteUserTarget.username}」を削除しました。`);
            setDeleteUserTarget(null);
            setDeleteUserConfirmInput('');
            await loadAdminData();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'ユーザー削除に失敗しました。';
            setDeleteUserError(message);
        } finally {
            setActiveUserActionId(null);
        }
    };


    const USERS_PER_PAGE = 10;
    const totalPages = Math.max(1, Math.ceil(users.length / USERS_PER_PAGE));
    const paginatedUsers = useMemo(() => {
        const start = (currentPage - 1) * USERS_PER_PAGE;
        return users.slice(start, start + USERS_PER_PAGE);
    }, [currentPage, users]);

    useEffect(() => {
        setCurrentPage(prev => Math.min(prev, totalPages));
    }, [totalPages]);

    const cards = useMemo(() => {
        if (!summary) return [];
        return [
            { key: 'users', label: '登録ユーザー数', value: summary.summary.totalUsers, hint: '作成済みアカウントの合計' },
            { key: 'sessions', label: '有効セッション数', value: summary.summary.activeSessions, hint: '現在有効なログインセッション' },
            { key: 'sets', label: '問題集数', value: summary.summary.totalQuizSets, hint: '削除済みを除く問題集' },
            { key: 'questions', label: '問題数', value: summary.summary.totalQuestions, hint: '登録済みの全問題' },
            { key: 'histories', label: '履歴数', value: summary.summary.totalHistories, hint: '保存済みの学習履歴' },
            { key: 'schedules', label: '復習スケジュール数', value: summary.summary.totalReviewSchedules, hint: '全ユーザーの復習予定' },
            { key: 'logs', label: '復習ログ数', value: summary.summary.totalReviewLogs, hint: '記録済みの復習ログ' },
            { key: 'due', label: '期限到来レビュー数', value: summary.summary.dueReviewItems, hint: '今日以前が期限の復習項目' },
        ];
    }, [summary]);

    return (
        <div className="review-board-page">
            <div className="detail-header review-board-header">
                <BackButton className="nav-btn" onClick={() => navigate('/')} />
                <h1 className="review-board-title">
                    <ShieldCheck size={24} />
                    管理コンソール
                </h1>
            </div>

            <p className="review-board-subtitle">管理者のみが参照できる運用メトリクスを表示します。</p>

            {deleteUserSuccessMessage && (
                <div
                    style={{
                        marginBottom: '1rem',
                        border: '1px solid #14532d',
                        background: '#0f1f16',
                        color: '#bbf7d0',
                        borderRadius: 12,
                        padding: '0.65rem 0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.8rem',
                    }}
                >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem' }}>
                        <CircleCheck size={16} />
                        {deleteUserSuccessMessage}
                    </span>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setDeleteUserSuccessMessage('')}
                        style={{ color: '#86efac' }}
                        aria-label="通知を閉じる"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {isLoading ? (
                <LoadingView message="管理情報を読み込み中..." />
            ) : errorMessage ? (
                <div className="review-board-empty" style={{ gap: '0.8rem' }}>
                    <p style={{ marginBottom: 0 }}>{errorMessage}</p>
                    {isForbidden && (
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            サーバー側でも管理者権限を検証しているため、URLを直接開いてもアクセスできません。
                        </p>
                    )}
                    {!currentUser && useCloudSync && (
                        <button className="nav-btn action-btn" onClick={() => setIsLoginModalOpen(true)}>
                            <LogIn size={16} /> ログイン
                        </button>
                    )}
                    <button className="nav-btn" onClick={() => void loadAdminData()}>
                        <RefreshCw size={16} /> 再読み込み
                    </button>
                </div>
            ) : (
                <>
                    <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '1rem' }}>
                        {cards.map(card => (
                            <div key={card.key} className="review-board-stat-card" style={{ alignItems: 'flex-start' }}>
                                <span className="review-board-stat-label">{card.label}</span>
                                <strong className="review-board-stat-value">{card.value.toLocaleString('ja-JP')}</strong>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{card.hint}</span>
                            </div>
                        ))}
                    </div>

                    <div className="review-board-empty" style={{ alignItems: 'flex-start', gap: '0.6rem' }}>
                        <p style={{ marginBottom: 0 }}>
                            最終更新: <strong>{summary ? formatDateTime(summary.generatedAt) : '-'}</strong>
                        </p>
                        <p style={{ marginBottom: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <Lock size={15} style={{ verticalAlign: 'text-bottom', marginRight: '0.35rem' }} />
                            この画面のデータは管理者権限を持つユーザーのみ取得できます。
                        </p>
                        <button className="nav-btn" onClick={() => void loadAdminData()}>
                            <RefreshCw size={16} /> 更新
                        </button>
                    </div>

                    <section style={{ marginTop: '1.2rem' }}>
                        <h2 className="review-board-column-title" style={{ marginBottom: '0.75rem' }}>
                            登録ユーザー一覧
                        </h2>
                        <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 12 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-secondary)' }}>
                                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>ID</th>
                                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>ユーザー名</th>
                                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>権限</th>
                                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>作成日時</th>
                                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>最終ログイン</th>
                                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>問題集数</th>
                                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>暗記カード数</th>
                                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>有効セッション</th>
                                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedUsers.map(user => {
                                        const isProcessing = activeUserActionId === user.id;
                                        return (
                                            <tr key={user.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '0.7rem 0.75rem' }}>{user.id}</td>
                                                <td style={{ padding: '0.7rem 0.75rem', fontWeight: 600 }}>{user.username}</td>
                                                <td style={{ padding: '0.7rem 0.75rem' }}>{user.isAdmin ? '管理者' : '一般ユーザー'}</td>
                                                <td style={{ padding: '0.7rem 0.75rem' }}>{formatDateTime(user.createdAt)}</td>
                                                <td style={{ padding: '0.7rem 0.75rem' }}>{formatDateTime(user.lastLoginAt)}</td>
                                                <td style={{ padding: '0.7rem 0.75rem' }}>{user.quizSetCount.toLocaleString('ja-JP')}</td>
                                                <td style={{ padding: '0.7rem 0.75rem' }}>{user.memorizationCardCount.toLocaleString('ja-JP')}</td>
                                                <td style={{ padding: '0.7rem 0.75rem' }}>{user.activeSessionCount}</td>
                                                <td style={{ padding: '0.7rem 0.75rem' }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        <button
                                                            className="nav-btn"
                                                            disabled={isProcessing}
                                                            onClick={() => openResetPasswordModal(user)}
                                                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.82rem' }}
                                                        >
                                                            <KeyRound size={14} /> パスワード再設定
                                                        </button>
                                                        <button
                                                            className="nav-btn"
                                                            disabled={isProcessing || (currentUser?.id === user.id)}
                                                            onClick={() => openDeleteUserModal(user)}
                                                            style={{
                                                                padding: '0.35rem 0.6rem',
                                                                fontSize: '0.82rem',
                                                                color: '#fff',
                                                                borderColor: DELETE_BUTTON_BORDER,
                                                                background: `linear-gradient(180deg, ${DELETE_BUTTON_PRIMARY} 0%, ${DELETE_BUTTON_SECONDARY} 100%)`,
                                                                fontWeight: 700,
                                                                boxShadow: '0 6px 14px rgba(185, 28, 28, 0.35)',
                                                            }}
                                                        >
                                                            <Trash2 size={14} /> ユーザー削除
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {paginatedUsers.length === 0 && (
                                        <tr>
                                            <td colSpan={9} style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
                                                登録ユーザーがありません。
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {users.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem', gap: '0.6rem', flexWrap: 'wrap' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                                    {users.length}件中 {(currentPage - 1) * USERS_PER_PAGE + 1}〜{Math.min(currentPage * USERS_PER_PAGE, users.length)}件を表示
                                </span>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <button
                                        className="nav-btn"
                                        type="button"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        style={{ padding: '0.35rem 0.55rem' }}
                                    >
                                        <ChevronLeft size={15} /> 前へ
                                    </button>
                                    <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                                        {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        className="nav-btn"
                                        type="button"
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        style={{ padding: '0.35rem 0.55rem' }}
                                    >
                                        次へ <ChevronRight size={15} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                </>
            )}

            {passwordResetTarget && (
                <div className="modal-overlay">
                    <div className="modal-content login-modal" style={{ maxWidth: 420 }}>
                        <div className="modal-header">
                            <h3>パスワード再設定</h3>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginTop: 0, marginBottom: '0.8rem' }}>
                                ユーザー「<strong>{passwordResetTarget.username}</strong>」の新しいパスワードを設定します。
                            </p>
                            <form onSubmit={handleSubmitResetPassword}>
                                <input
                                    type="password"
                                    className="field-input"
                                    placeholder="新しいパスワード（6文字以上）"
                                    value={newPasswordInput}
                                    onChange={(event) => setNewPasswordInput(event.target.value)}
                                    autoFocus
                                />
                                {passwordResetError && (
                                    <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginTop: '0.6rem', marginBottom: 0 }}>
                                        {passwordResetError}
                                    </p>
                                )}
                                <div className="modal-footer" style={{ marginTop: '1.2rem' }}>
                                    <button
                                        type="button"
                                        className="nav-btn"
                                        onClick={closeResetPasswordModal}
                                        disabled={activeUserActionId !== null}
                                    >
                                        キャンセル
                                    </button>
                                    <button
                                        type="submit"
                                        className="nav-btn action-btn"
                                        disabled={activeUserActionId !== null}
                                    >
                                        更新する
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {deleteUserTarget && (
                <div className="modal-overlay">
                    <div
                        className="modal-content login-modal"
                        style={{
                            maxWidth: 460,
                            borderRadius: 16,
                            overflow: 'hidden',
                            boxShadow: `0 0 0 2px ${DELETE_BUTTON_PRIMARY}, 0 24px 60px rgba(0, 0, 0, 0.45)`,
                        }}
                    >
                        <div
                            className="modal-header"
                            style={{
                                background: `linear-gradient(180deg, ${DELETE_BUTTON_PRIMARY} 0%, ${DELETE_BUTTON_SECONDARY} 100%)`,
                                color: '#fff',
                                borderBottom: `1px solid ${DELETE_BUTTON_SECONDARY}`,
                            }}
                        >
                            <h3>ユーザー削除</h3>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginTop: 0, marginBottom: '0.7rem', color: '#fca5a5', fontWeight: 700 }}>
                                ユーザー「<strong>{deleteUserTarget.username}</strong>」を削除します。
                            </p>
                            <p style={{
                                marginTop: 0,
                                marginBottom: '0.9rem',
                                color: '#fecaca',
                                fontSize: '0.9rem',
                                background: '#2a0d10',
                                border: '1px solid #7f1d1d',
                                borderRadius: 8,
                                padding: '0.65rem 0.75rem',
                                lineHeight: 1.5,
                                fontWeight: 600,
                            }}>
                                この操作は取り消せません。関連する問題集・履歴・復習データも削除されます。
                            </p>
                            <label style={{ display: 'block', marginBottom: '0.45rem', color: '#fca5a5', fontSize: '0.88rem', fontWeight: 600 }}>
                                確認のため、ユーザー名を入力してください: <code>{deleteUserTarget.username}</code>
                            </label>
                            <input
                                type="text"
                                className="field-input"
                                placeholder="ユーザー名をそのまま入力"
                                value={deleteUserConfirmInput}
                                onChange={(event) => setDeleteUserConfirmInput(event.target.value)}
                                autoFocus
                            />
                            {deleteUserError && (
                                <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginTop: '0.6rem', marginBottom: 0 }}>
                                    {deleteUserError}
                                </p>
                            )}
                            <div className="modal-footer" style={{ marginTop: '1.2rem' }}>
                                <button
                                    type="button"
                                    className="nav-btn"
                                    onClick={closeDeleteUserModal}
                                    disabled={activeUserActionId !== null}
                                >
                                    キャンセル
                                </button>
                                <button
                                    type="button"
                                    className="nav-btn"
                                    onClick={() => void handleConfirmDeleteUser()}
                                    disabled={activeUserActionId !== null || deleteUserConfirmInput !== deleteUserTarget.username}
                                    style={{
                                        background: `linear-gradient(180deg, ${DELETE_BUTTON_PRIMARY} 0%, ${DELETE_BUTTON_SECONDARY} 100%)`,
                                        color: '#fff',
                                        borderColor: DELETE_BUTTON_BORDER,
                                        fontWeight: 700,
                                        boxShadow: '0 6px 14px rgba(185, 28, 28, 0.35)',
                                    }}
                                >
                                    削除する
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
