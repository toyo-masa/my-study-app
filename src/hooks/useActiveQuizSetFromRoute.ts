import { useParams } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';

type AppQuizSet = ReturnType<typeof useAppContext>['quizSets'][number];

interface UseActiveQuizSetFromRouteResult {
    quizSetId: number | undefined;
    activeQuizSet: AppQuizSet | undefined;
    quizSetsCount: number;
}

export function useActiveQuizSetFromRoute(): UseActiveQuizSetFromRouteResult {
    const { id } = useParams<{ id: string }>();
    const { quizSets } = useAppContext();

    const parsedQuizSetId = id ? Number.parseInt(id, 10) : undefined;
    const quizSetId = Number.isInteger(parsedQuizSetId) ? parsedQuizSetId : undefined;
    const activeQuizSet = quizSets.find(quizSet => quizSet.id === quizSetId);

    return { quizSetId, activeQuizSet, quizSetsCount: quizSets.length };
}
