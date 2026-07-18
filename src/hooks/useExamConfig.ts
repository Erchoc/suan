import { getKPsUpTo, graphData } from '../data/kpIndex';
import { useExamStore } from '../stores/examStore';
import { useQuestions } from './useQuestions';

export function useExamConfig() {
  const store = useExamStore();
  const { config } = store;
  const { questions } = useQuestions();

  const availableKPs =
    config.gradeNum && config.semester ? getKPsUpTo(config.gradeNum, config.semester) : [];

  const availableQuestions =
    availableKPs.length > 0
      ? questions.filter(q => availableKPs.some(kp => kp.id === q.kp_id))
      : [];

  const currentGrade = config.gradeNum ? graphData.grades[config.gradeNum - 1] : null;

  const isConfigComplete = Boolean(config.gradeNum && config.semester);

  return {
    ...store,
    availableKPs,
    availableQuestions,
    currentGrade,
    isConfigComplete,
  };
}
