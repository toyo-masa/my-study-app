import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HomePage } from '../components/HomePage';
import { useAppContext } from '../contexts/AppContext';
import { useNavigate } from 'react-router-dom';
import {
    softDeleteQuizSet,
    restoreQuizSet,
    hardDeleteQuizSet,
    archiveQuizSet,
    unarchiveQuizSet,
    addQuizSetWithQuestions,
    completeHomeOnboarding,
    advanceHomeOnboardingToManage
} from '../db';
import { parseQuestions, parseMemorizationQuestions } from '../utils/csvParser';

export const HomeRoute: React.FC = () => {
    const {
        quizSets,
        deletedQuizSets,
        archivedQuizSets,
        setQuizSets,
        setDeletedQuizSets,
        setArchivedQuizSets,
        loadQuizSets,
        handleCloudError,
        homeOnboardingState,
        setHomeOnboardingState
    } = useAppContext();
    const navigate = useNavigate();
    const [homeNotice, setHomeNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const homeNoticeTimeoutRef = useRef<number | null>(null);

    const formatQuizSetLabel = useCallback((name: string, type: 'quiz' | 'memorization') => {
        const kind = type === 'memorization' ? '暗記カード' : '問題集';
        return `${kind}「${name}」`;
    }, []);

    useEffect(() => {
        return () => {
            if (homeNoticeTimeoutRef.current !== null) {
                window.clearTimeout(homeNoticeTimeoutRef.current);
                homeNoticeTimeoutRef.current = null;
            }
        };
    }, []);

    const showHomeNotice = useCallback((text: string, type: 'success' | 'error') => {
        if (homeNoticeTimeoutRef.current !== null) {
            window.clearTimeout(homeNoticeTimeoutRef.current);
            homeNoticeTimeoutRef.current = null;
        }
        setHomeNotice({ text, type });
        homeNoticeTimeoutRef.current = window.setTimeout(() => {
            setHomeNotice(null);
            homeNoticeTimeoutRef.current = null;
        }, 3000);
    }, []);

    // Add quiz set from uploaded CSV
    const handleAddQuizSet = async (file: File) => {
        try {
            const parsed = await parseQuestions(file);
            const name = file.name.replace(/\.csv$/i, '');
            const questionsForDB = parsed.map(q => ({
                category: q.category,
                text: q.text,
                options: q.options,
                correctAnswers: q.correctAnswers,
                explanation: q.explanation,
            }));
            await addQuizSetWithQuestions(name, questionsForDB);
            await loadQuizSets();
            showHomeNotice(`${formatQuizSetLabel(name, 'quiz')}を追加しました。`, 'success');
        } catch {
            showHomeNotice('問題集の追加に失敗しました。', 'error');
        }
    };

    // Add memorization set from uploaded CSV
    const handleAddMemorizationSet = async (file: File) => {
        try {
            const parsed = await parseMemorizationQuestions(file);
            const name = file.name.replace(/\.csv$/i, '');
            await addQuizSetWithQuestions(name, parsed, 'memorization');
            await loadQuizSets();
            showHomeNotice(`${formatQuizSetLabel(name, 'memorization')}を追加しました。`, 'success');
        } catch {
            showHomeNotice('暗記カードの追加に失敗しました。', 'error');
        }
    };

    // Add empty quiz set
    const handleAddEmptyQuizSet = async (): Promise<boolean> => {
        const quizSetName = '新しい問題集';
        try {
            await addQuizSetWithQuestions(quizSetName, []);
            await loadQuizSets();
            showHomeNotice(`${formatQuizSetLabel(quizSetName, 'quiz')}を追加しました。`, 'success');
            return true;
        } catch (err) {
            showHomeNotice('問題集の追加に失敗しました。', 'error');
            return false;
        }
    };

    // Add empty memorization set
    const handleAddEmptyMemorizationSet = async (): Promise<boolean> => {
        const quizSetName = '新しい暗記カード';
        try {
            await addQuizSetWithQuestions(quizSetName, [], 'memorization');
            await loadQuizSets();
            showHomeNotice(`${formatQuizSetLabel(quizSetName, 'memorization')}を追加しました。`, 'success');
            return true;
        } catch (err) {
            showHomeNotice('暗記カードの追加に失敗しました。', 'error');
            return false;
        }
    };

    const handleCompleteHomeOnboarding = useCallback(async (): Promise<boolean> => {
        try {
            const state = await completeHomeOnboarding();
            setHomeOnboardingState(state);
            return true;
        } catch (error) {
            handleCloudError(error, 'オンボーディング状態の保存に失敗しました。');
            return false;
        }
    }, [handleCloudError]);

    const handleAdvanceHomeOnboardingToManage = useCallback(async (quizSetId: number): Promise<boolean> => {
        try {
            const state = await advanceHomeOnboardingToManage(quizSetId);
            setHomeOnboardingState(state);
            return true;
        } catch (error) {
            handleCloudError(error, 'オンボーディング状態の更新に失敗しました。');
            return false;
        }
    }, [handleCloudError]);

    const handleDeleteQuizSet = async (quizSetId: number) => {
        const targetSet = quizSets.find(qs => qs.id === quizSetId);
        if (targetSet) {
            setQuizSets(prev => prev.filter(qs => qs.id !== quizSetId));
            setDeletedQuizSets(prev => [...prev, targetSet]);
        }
        try {
            await softDeleteQuizSet(quizSetId);
            await loadQuizSets();
            if (targetSet) {
                showHomeNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}をゴミ箱に移動しました。`, 'success');
            } else {
                showHomeNotice('問題集をゴミ箱に移動しました。', 'success');
            }
        } catch (error) {
            handleCloudError(error, '削除に失敗しました。');
            await loadQuizSets();
            if (targetSet) {
                showHomeNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}をゴミ箱に移動できませんでした。`, 'error');
            } else {
                showHomeNotice('問題集をゴミ箱に移動できませんでした。', 'error');
            }
        }
    };

    const handleRestoreQuizSet = async (id: number) => {
        const targetSet = deletedQuizSets.find(qs => qs.id === id);
        if (targetSet) {
            setDeletedQuizSets(prev => prev.filter(qs => qs.id !== id));
            setQuizSets(prev => [...prev, targetSet]);
        }
        try {
            await restoreQuizSet(id);
            await loadQuizSets();
            if (targetSet) {
                showHomeNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}を一覧に戻しました。`, 'success');
            } else {
                showHomeNotice('問題集を一覧に戻しました。', 'success');
            }
        } catch (error) {
            handleCloudError(error, '復元に失敗しました。');
            await loadQuizSets();
            if (targetSet) {
                showHomeNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}を一覧に戻せませんでした。`, 'error');
            } else {
                showHomeNotice('問題集を一覧に戻せませんでした。', 'error');
            }
        }
    };

    const handlePermanentDeleteQuizSet = async (id: number) => {
        await hardDeleteQuizSet(id);
        await loadQuizSets();
    };

    const handleArchiveQuizSet = async (quizSetId: number) => {
        const targetSet = quizSets.find(qs => qs.id === quizSetId);
        if (targetSet) {
            setQuizSets(prev => prev.filter(qs => qs.id !== quizSetId));
            setArchivedQuizSets(prev => [...prev, targetSet]);
        }
        try {
            await archiveQuizSet(quizSetId);
            await loadQuizSets();
            if (targetSet) {
                showHomeNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}をアーカイブしました。`, 'success');
            } else {
                showHomeNotice('問題集をアーカイブしました。', 'success');
            }
        } catch (error) {
            handleCloudError(error, 'アーカイブに失敗しました。');
            await loadQuizSets();
            if (targetSet) {
                showHomeNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}をアーカイブできませんでした。`, 'error');
            } else {
                showHomeNotice('問題集をアーカイブできませんでした。', 'error');
            }
        }
    };

    const handleUnarchiveQuizSet = async (quizSetId: number) => {
        const targetSet = archivedQuizSets.find(qs => qs.id === quizSetId);
        if (targetSet) {
            setArchivedQuizSets(prev => prev.filter(qs => qs.id !== quizSetId));
            setQuizSets(prev => [...prev, targetSet]);
        }
        try {
            await unarchiveQuizSet(quizSetId);
            await loadQuizSets();
            if (targetSet) {
                showHomeNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}を一覧に戻しました。`, 'success');
            } else {
                showHomeNotice('問題集を一覧に戻しました。', 'success');
            }
        } catch (error) {
            handleCloudError(error, 'アーカイブ解除に失敗しました。');
            await loadQuizSets();
            if (targetSet) {
                showHomeNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}を一覧に戻せませんでした。`, 'error');
            } else {
                showHomeNotice('問題集を一覧に戻せませんでした。', 'error');
            }
        }
    };

    return (
        <HomePage
            quizSets={quizSets}
            onAddQuizSet={handleAddQuizSet}
            onSelectQuizSet={(set) => navigate(`/quiz/${set.id}`)}
            onManageQuizSet={(set) => navigate(`/quiz/${set.id}/manage`)}
            onDeleteQuizSet={handleDeleteQuizSet}
            onRestoreQuizSet={handleRestoreQuizSet}
            onPermanentDeleteQuizSet={handlePermanentDeleteQuizSet}
            onAddMemorizationSet={handleAddMemorizationSet}
            onAddEmptyQuizSet={handleAddEmptyQuizSet}
            onAddEmptyMemorizationSet={handleAddEmptyMemorizationSet}
            deletedQuizSets={deletedQuizSets}
            archivedQuizSets={archivedQuizSets}
            onArchiveQuizSet={handleArchiveQuizSet}
            onUnarchiveQuizSet={handleUnarchiveQuizSet}
            onOpenApp={(appId) => navigate(`/${appId}`)}
            onRefresh={() => loadQuizSets()}
            homeNotice={homeNotice}
            homeOnboardingState={homeOnboardingState}
            onCompleteHomeOnboarding={handleCompleteHomeOnboarding}
            onAdvanceHomeOnboardingToManage={handleAdvanceHomeOnboardingToManage}
        />
    );
};
