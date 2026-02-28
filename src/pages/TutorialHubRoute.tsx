import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Clock, PlayCircle, Settings } from 'lucide-react';
import { updateHomeOnboardingState } from '../db';
import { useAppContext } from '../contexts/AppContext';
import type { HomeOnboardingState } from '../types';
import '../App.css';

function toCreatedAtMs(createdAt: unknown): number {
    if (createdAt instanceof Date) {
        const ms = createdAt.getTime();
        return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
    }
    if (typeof createdAt === 'string' || typeof createdAt === 'number') {
        const ms = new Date(createdAt).getTime();
        return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
    }
    return Number.NEGATIVE_INFINITY;
}

function formatCompletedAt(completedAt: string | null): string {
    if (!completedAt) return '未完了';
    const date = new Date(completedAt);
    if (Number.isNaN(date.getTime())) return '未完了';
    return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function resolveFlowStageLabel(state: HomeOnboardingState | null): string {
    if (!state) return '読み込み中';
    if (state.homeTutorialCompleted || state.flowStage === 'completed') return '完了';
    if (state.flowStage === 'manage') return '問題管理ステップ';
    return 'ホームステップ';
}

export const TutorialHubRoute: React.FC = () => {
    const navigate = useNavigate();
    const { quizSets, handleCloudError, homeOnboardingState: onboardingState, setHomeOnboardingState: setOnboardingState } = useAppContext();
    const [selectedQuizSetId, setSelectedQuizSetId] = useState<number | null>(null);
    const [isStartingHomeTutorial, setIsStartingHomeTutorial] = useState(false);
    const [isStartingManageTutorial, setIsStartingManageTutorial] = useState(false);

    const manageableQuizSets = useMemo(() => {
        return quizSets
            .filter((quizSet) => typeof quizSet.id === 'number' && quizSet.type !== 'memorization')
            .map((quizSet) => ({
                id: quizSet.id as number,
                name: quizSet.name,
                questionCount: quizSet.questionCount,
                createdAtMs: toCreatedAtMs(quizSet.createdAt),
            }))
            .sort((a, b) => {
                if (b.createdAtMs !== a.createdAtMs) {
                    return b.createdAtMs - a.createdAtMs;
                }
                return b.id - a.id;
            })
            .map(({ id, name, questionCount }) => ({
                id,
                name,
                questionCount,
            }));
    }, [quizSets]);

    useEffect(() => {
        if (manageableQuizSets.length === 0) {
            setSelectedQuizSetId(null);
            return;
        }
        setSelectedQuizSetId((current) => {
            if (current !== null && manageableQuizSets.some((quizSet) => quizSet.id === current)) {
                return current;
            }
            return manageableQuizSets[0].id;
        });
    }, [manageableQuizSets]);

    const handleStartHomeTutorial = useCallback(async () => {
        if (isStartingHomeTutorial) return;
        setIsStartingHomeTutorial(true);
        try {
            const state = await updateHomeOnboardingState({
                homeTutorialCompleted: false,
                flowStage: 'home',
                manageQuizSetId: null,
            });
            setOnboardingState(state);
            navigate('/');
        } catch (error) {
            handleCloudError(error, 'チュートリアルの開始に失敗しました。');
        } finally {
            setIsStartingHomeTutorial(false);
        }
    }, [handleCloudError, isStartingHomeTutorial, navigate, setOnboardingState]);

    const handleStartManageTutorial = useCallback(async () => {
        if (isStartingManageTutorial || selectedQuizSetId === null) return;
        setIsStartingManageTutorial(true);
        try {
            const state = await updateHomeOnboardingState({
                homeTutorialCompleted: false,
                flowStage: 'manage',
                manageQuizSetId: selectedQuizSetId,
            });
            setOnboardingState(state);
            navigate(`/quiz/${selectedQuizSetId}/manage`);
        } catch (error) {
            handleCloudError(error, 'チュートリアルの開始に失敗しました。');
        } finally {
            setIsStartingManageTutorial(false);
        }
    }, [handleCloudError, isStartingManageTutorial, navigate, selectedQuizSetId, setOnboardingState]);

    const hasManageTarget = manageableQuizSets.length > 0;

    return (
        <div className="tutorial-hub-page">
            <div className="detail-header tutorial-hub-header">
                <button className="nav-btn" onClick={() => navigate('/')}>
                    <ArrowLeft size={16} /> ホームへ戻る
                </button>
            </div>

            <section className="tutorial-hub-intro">
                <h1 className="tutorial-hub-title">チュートリアル</h1>
                <p className="tutorial-hub-description">
                    初回アクセス時の自動チュートリアルはそのまま維持しつつ、この画面からいつでも再実行できます。
                </p>
            </section>

            <section className="tutorial-hub-status">
                <h2 className="tutorial-hub-status-title">
                    <Clock size={16} /> 現在の進行状態
                </h2>
                <p className="tutorial-hub-status-text">ステータス: {resolveFlowStageLabel(onboardingState)}</p>
                <p className="tutorial-hub-status-text">最終完了日時: {formatCompletedAt(onboardingState?.completedAt ?? null)}</p>
            </section>

            <div className="tutorial-hub-grid">
                <article className="tutorial-hub-card">
                    <div className="tutorial-hub-card-head">
                        <BookOpen size={18} />
                        <h3>ホーム導線チュートリアル</h3>
                    </div>
                    <p className="tutorial-hub-card-text">
                        「問題集を追加」→「空の問題集を追加」→「問題管理へ移動」→「問題を追加して保存」までを順番に案内します。
                    </p>
                    <p className="tutorial-hub-note">
                        CSV取込も可能ですが、この導線では空の問題集に手入力で問題を登録する流れを案内します。
                    </p>
                    <button
                        className="nav-btn action-btn"
                        onClick={() => { void handleStartHomeTutorial(); }}
                        disabled={isStartingHomeTutorial}
                    >
                        <PlayCircle size={16} />
                        {isStartingHomeTutorial ? '開始中...' : 'ホームから開始'}
                    </button>
                </article>

                <article className="tutorial-hub-card">
                    <div className="tutorial-hub-card-head">
                        <Settings size={18} />
                        <h3>問題管理チュートリアル</h3>
                    </div>
                    <p className="tutorial-hub-card-text">
                        問題管理画面から直接開始し、「問題を追加」ボタンと入力フォームの保存手順を案内します。
                    </p>

                    <label htmlFor="tutorial-manage-target" className="tutorial-hub-select-label">
                        対象の問題集
                    </label>
                    <select
                        id="tutorial-manage-target"
                        className="tutorial-hub-select"
                        value={selectedQuizSetId ?? ''}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            setSelectedQuizSetId(nextValue ? Number(nextValue) : null);
                        }}
                        disabled={!hasManageTarget || isStartingManageTutorial}
                    >
                        {hasManageTarget ? (
                            manageableQuizSets.map((quizSet) => (
                                <option key={quizSet.id} value={quizSet.id}>
                                    {quizSet.name}（{quizSet.questionCount}問）
                                </option>
                            ))
                        ) : (
                            <option value="">利用できる問題集がありません</option>
                        )}
                    </select>

                    {!hasManageTarget && (
                        <p className="tutorial-hub-note">
                            管理画面チュートリアルには問題集が必要です。先にホーム導線チュートリアルで問題集を作成してください。
                        </p>
                    )}

                    <button
                        className="nav-btn"
                        onClick={() => { void handleStartManageTutorial(); }}
                        disabled={!hasManageTarget || isStartingManageTutorial || selectedQuizSetId === null}
                    >
                        <PlayCircle size={16} />
                        {isStartingManageTutorial ? '開始中...' : '問題管理から開始'}
                    </button>
                </article>
            </div>
        </div>
    );
};
