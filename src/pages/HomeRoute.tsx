import React, { useCallback } from 'react';
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
        } catch (err) {
            alert('CSVの解析エラー: ' + (err as Error).message);
        }
    };

    // Add memorization set from uploaded CSV
    const handleAddMemorizationSet = async (file: File) => {
        try {
            const parsed = await parseMemorizationQuestions(file);
            const name = file.name.replace(/\.csv$/i, '');
            await addQuizSetWithQuestions(name, parsed, 'memorization');
            await loadQuizSets();
        } catch (err) {
            alert('暗記用CSVの解析エラー: ' + (err as Error).message);
        }
    };

    // Add empty quiz set
    const handleAddEmptyQuizSet = async (): Promise<boolean> => {
        try {
            await addQuizSetWithQuestions('新しい問題集', []);
            await loadQuizSets();
            return true;
        } catch (err) {
            alert('問題集の作成エラー: ' + (err as Error).message);
            return false;
        }
    };

    // Add empty memorization set
    const handleAddEmptyMemorizationSet = async (): Promise<boolean> => {
        try {
            await addQuizSetWithQuestions('新しい暗記カード', [], 'memorization');
            await loadQuizSets();
            return true;
        } catch (err) {
            alert('暗記カードの作成エラー: ' + (err as Error).message);
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
        } catch (error) {
            handleCloudError(error, '削除に失敗しました。');
            await loadQuizSets();
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
        } catch (error) {
            handleCloudError(error, '復元に失敗しました。');
            await loadQuizSets();
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
        } catch (err) {
            handleCloudError(err, 'アーカイブに失敗しました。');
            await loadQuizSets();
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
        } catch (err) {
            handleCloudError(err, 'アーカイブ解除に失敗しました。');
            await loadQuizSets();
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
            homeOnboardingState={homeOnboardingState}
            onCompleteHomeOnboarding={handleCompleteHomeOnboarding}
            onAdvanceHomeOnboardingToManage={handleAdvanceHomeOnboardingToManage}
        />
    );
};
