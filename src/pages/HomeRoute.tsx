import React, { useCallback, useRef } from 'react';
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
import type { QuizSetType } from '../types';

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
        setHomeOnboardingState,
        showGlobalNotice
    } = useAppContext();
    const navigate = useNavigate();

    const formatQuizSetLabel = useCallback((name: string, type: QuizSetType) => {
        const kind = type === 'memorization' ? '暗記カード' : type === 'mixed' ? '混合セット' : '問題集';
        return `${kind}「${name}」`;
    }, []);

    // Helper: generate a guaranteed-unique temporary negative ID
    const tempIdRef = useRef(-1);
    const nextTempId = () => {
        tempIdRef.current -= 1;
        return tempIdRef.current;
    };

    const handleAddQuestionCsvSet = async (file: File, type: 'quiz' | 'mixed') => {
        let tempId: number | undefined;
        try {
            const parsed = await parseQuestions(file);
            const name = file.name.replace(/\.csv$/i, '');
            const questionsForDB = parsed.map(q => ({
                category: q.category,
                text: q.text,
                options: q.options,
                correctAnswers: q.correctAnswers,
                explanation: q.explanation,
                questionType: q.questionType,
            }));
            // Optimistic: show item immediately with temp id and question count
            tempId = nextTempId();
            const optimisticSet = {
                id: tempId, name, type,
                createdAt: new Date(), isDeleted: false, isArchived: false,
                questionCount: questionsForDB.length, categories: []
            };
            setQuizSets(prev => [optimisticSet, ...prev]);
            showGlobalNotice(`${formatQuizSetLabel(name, type)}を追加しました。`, 'success');
            // Background save + replace with real id
            const realId = await addQuizSetWithQuestions(name, questionsForDB, type);
            setQuizSets(prev => prev.map(qs => qs.id === tempId ? { ...qs, id: realId } : qs));
        } catch {
            if (tempId !== undefined) setQuizSets(prev => prev.filter(qs => qs.id !== tempId));
            showGlobalNotice(type === 'mixed' ? '混合セットの追加に失敗しました。' : '問題集の追加に失敗しました。', 'error');
        }
    };

    // Add quiz set from uploaded CSV (optimistic)
    const handleAddQuizSet = async (file: File) => {
        await handleAddQuestionCsvSet(file, 'quiz');
    };

    // Add mixed set from uploaded CSV (optimistic)
    const handleAddMixedSet = async (file: File) => {
        await handleAddQuestionCsvSet(file, 'mixed');
    };

    // Add memorization set from uploaded CSV (optimistic)
    const handleAddMemorizationSet = async (file: File) => {
        let tempId: number | undefined;
        try {
            const parsed = await parseMemorizationQuestions(file);
            const name = file.name.replace(/\.csv$/i, '');
            // Optimistic
            tempId = nextTempId();
            const optimisticSet = {
                id: tempId, name, type: 'memorization' as const,
                createdAt: new Date(), isDeleted: false, isArchived: false,
                questionCount: parsed.length, categories: []
            };
            setQuizSets(prev => [optimisticSet, ...prev]);
            showGlobalNotice(`${formatQuizSetLabel(name, 'memorization')}を追加しました。`, 'success');
            const realId = await addQuizSetWithQuestions(name, parsed, 'memorization');
            setQuizSets(prev => prev.map(qs => qs.id === tempId ? { ...qs, id: realId } : qs));
        } catch {
            if (tempId !== undefined) setQuizSets(prev => prev.filter(qs => qs.id !== tempId));
            showGlobalNotice('暗記カードの追加に失敗しました。', 'error');
        }
    };

    // Shared helper: add empty quiz set or memorization set or mixed set (optimistic)
    const handleAddEmptySet = async (type: 'quiz' | 'memorization' | 'mixed'): Promise<boolean> => {
        const label = type === 'quiz' ? '問題集' : type === 'memorization' ? '暗記カード' : '混合セット';
        const quizSetName = `新しい${label}`;
        const tempId = nextTempId();
        setQuizSets(prev => [{
            id: tempId, name: quizSetName, type,
            createdAt: new Date(), isDeleted: false, isArchived: false,
            questionCount: 0, categories: []
        }, ...prev]);
        showGlobalNotice(`${formatQuizSetLabel(quizSetName, type)}を追加しました。`, 'success');
        try {
            const realId = await addQuizSetWithQuestions(quizSetName, [], type);
            setQuizSets(prev => prev.map(qs => qs.id === tempId ? { ...qs, id: realId } : qs));
            return true;
        } catch {
            setQuizSets(prev => prev.filter(qs => qs.id !== tempId));
            showGlobalNotice(`${label}の追加に失敗しました。`, 'error');
            return false;
        }
    };

    const handleAddEmptyQuizSet = () => handleAddEmptySet('quiz');
    const handleAddEmptyMemorizationSet = () => handleAddEmptySet('memorization');
    const handleAddEmptyMixedSet = () => handleAddEmptySet('mixed');


    const handleCompleteHomeOnboarding = useCallback(async (): Promise<boolean> => {
        try {
            const state = await completeHomeOnboarding();
            setHomeOnboardingState(state);
            return true;
        } catch (error) {
            handleCloudError(error, 'オンボーディング状態の保存に失敗しました。');
            return false;
        }
    }, [handleCloudError, setHomeOnboardingState]);

    const handleAdvanceHomeOnboardingToManage = useCallback(async (quizSetId: number): Promise<boolean> => {
        try {
            const state = await advanceHomeOnboardingToManage(quizSetId);
            setHomeOnboardingState(state);
            return true;
        } catch (error) {
            handleCloudError(error, 'オンボーディング状態の更新に失敗しました。');
            return false;
        }
    }, [handleCloudError, setHomeOnboardingState]);

    const handleDeleteQuizSet = async (quizSetId: number) => {
        const targetSet = quizSets.find(qs => qs.id === quizSetId);
        if (targetSet) {
            setQuizSets(prev => prev.filter(qs => qs.id !== quizSetId));
            setDeletedQuizSets(prev => [...prev, targetSet]);
        }
        try {
            await softDeleteQuizSet(quizSetId);
            if (targetSet) {
                showGlobalNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}をゴミ箱に移動しました。`, 'success');
            } else {
                showGlobalNotice('問題集をゴミ箱に移動しました。', 'success');
            }
        } catch (error) {
            handleCloudError(error, '削除に失敗しました。');
            await loadQuizSets();
            if (targetSet) {
                showGlobalNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}をゴミ箱に移動できませんでした。`, 'error');
            } else {
                showGlobalNotice('問題集をゴミ箱に移動できませんでした。', 'error');
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
            if (targetSet) {
                showGlobalNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}を一覧に戻しました。`, 'success');
            } else {
                showGlobalNotice('問題集を一覧に戻しました。', 'success');
            }
        } catch (error) {
            handleCloudError(error, '復元に失敗しました。');
            await loadQuizSets();
            if (targetSet) {
                showGlobalNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}を一覧に戻せませんでした。`, 'error');
            } else {
                showGlobalNotice('問題集を一覧に戻せませんでした。', 'error');
            }
        }
    };

    const handlePermanentDeleteQuizSet = async (id: number) => {
        setDeletedQuizSets(prev => prev.filter(qs => qs.id !== id));
        try {
            await hardDeleteQuizSet(id);
        } catch (error) {
            handleCloudError(error, '完全削除に失敗しました。');
            await loadQuizSets();
        }
    };

    const handleArchiveQuizSet = async (quizSetId: number) => {
        const targetSet = quizSets.find(qs => qs.id === quizSetId);
        if (targetSet) {
            setQuizSets(prev => prev.filter(qs => qs.id !== quizSetId));
            setArchivedQuizSets(prev => [...prev, targetSet]);
        }
        try {
            await archiveQuizSet(quizSetId);
            if (targetSet) {
                showGlobalNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}をアーカイブしました。`, 'success');
            } else {
                showGlobalNotice('問題集をアーカイブしました。', 'success');
            }
        } catch (error) {
            handleCloudError(error, 'アーカイブに失敗しました。');
            await loadQuizSets();
            if (targetSet) {
                showGlobalNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}をアーカイブできませんでした。`, 'error');
            } else {
                showGlobalNotice('問題集をアーカイブできませんでした。', 'error');
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
            if (targetSet) {
                showGlobalNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}を一覧に戻しました。`, 'success');
            } else {
                showGlobalNotice('問題集を一覧に戻しました。', 'success');
            }
        } catch (error) {
            handleCloudError(error, 'アーカイブ解除に失敗しました。');
            await loadQuizSets();
            if (targetSet) {
                showGlobalNotice(`${formatQuizSetLabel(targetSet.name, targetSet.type ?? 'quiz')}を一覧に戻せませんでした。`, 'error');
            } else {
                showGlobalNotice('問題集を一覧に戻せませんでした。', 'error');
            }
        }
    };

    return (
        <HomePage
            quizSets={quizSets}
            onAddQuizSet={handleAddQuizSet}
            onAddMixedSet={handleAddMixedSet}
            onSelectQuizSet={(set) => navigate(`/quiz/${set.id}`)}
            onManageQuizSet={(set) => navigate(`/quiz/${set.id}/manage`)}
            onDeleteQuizSet={handleDeleteQuizSet}
            onRestoreQuizSet={handleRestoreQuizSet}
            onPermanentDeleteQuizSet={handlePermanentDeleteQuizSet}
            onAddMemorizationSet={handleAddMemorizationSet}
            onAddEmptyQuizSet={handleAddEmptyQuizSet}
            onAddEmptyMemorizationSet={handleAddEmptyMemorizationSet}
            onAddEmptyMixedSet={handleAddEmptyMixedSet}
            deletedQuizSets={deletedQuizSets}
            archivedQuizSets={archivedQuizSets}
            onArchiveQuizSet={handleArchiveQuizSet}
            onUnarchiveQuizSet={handleUnarchiveQuizSet}
            onOpenApp={(appId) => navigate(`/${appId}`)}
            onRefresh={() => loadQuizSets()}
            homeOnboardingState={homeOnboardingState}
            onCompleteHomeOnboarding={handleCompleteHomeOnboarding}
            onAdvanceHomeOnboardingToManage={handleAdvanceHomeOnboardingToManage}
        />
    );
};
