import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, LogIn, RefreshCw, ShieldCheck } from 'lucide-react';
import { cloudApi, type AdminSummary } from '../cloudApi';
import { useAppContext } from '../contexts/AppContext';
import { LoadingView } from '../components/LoadingView';
import '../App.css';

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '取得時刻不明';
    }
    return date.toLocaleString('ja-JP', { hour12: false });
}

export const AdminRoute: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser, useCloudSync, setIsLoginModalOpen } = useAppContext();
    const [summary, setSummary] = useState<AdminSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [isForbidden, setIsForbidden] = useState(false);

    const loadSummary = useCallback(async () => {
        if (!useCloudSync) {
            setSummary(null);
            setIsForbidden(false);
            setErrorMessage('管理画面はクラウド同期モードでのみ利用できます。');
            setIsLoading(false);
            return;
        }

        if (!currentUser) {
            setSummary(null);
            setIsForbidden(false);
            setErrorMessage('管理画面の表示にはログインが必要です。');
            setIsLoading(false);
            return;
        }

        if (!currentUser.isAdmin) {
            setSummary(null);
            setIsForbidden(true);
            setErrorMessage('この画面を開く権限がありません。');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setErrorMessage('');
        setIsForbidden(false);

        try {
            const nextSummary = await cloudApi.getAdminSummary();
            setSummary(nextSummary);
        } catch (error) {
            setSummary(null);
            const message = error instanceof Error ? error.message : '';
            if (message === 'UNAUTHORIZED') {
                setErrorMessage('ログイン状態の有効期限が切れました。再ログインしてください。');
                setIsLoginModalOpen(true);
                return;
            }
            if (message === 'Forbidden') {
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
        void loadSummary();
    }, [loadSummary]);

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
                <button className="nav-btn" onClick={() => navigate('/')}>
                    <ArrowLeft size={16} /> 戻る
                </button>
                <h1 className="review-board-title">
                    <ShieldCheck size={24} />
                    管理コンソール
                </h1>
            </div>

            <p className="review-board-subtitle">管理者のみが参照できる運用メトリクスを表示します。</p>

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
                    <button className="nav-btn" onClick={() => void loadSummary()}>
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
                        <button className="nav-btn" onClick={() => void loadSummary()}>
                            <RefreshCw size={16} /> 更新
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
