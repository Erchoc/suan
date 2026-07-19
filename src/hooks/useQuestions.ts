import { useEffect, useState } from 'react';
import { getLoadedQuestionBankVersion, loadQuestions } from '../data/questions';
import type { Question } from '../types';

export function useQuestions() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<number | undefined>();

  useEffect(() => {
    let active = true;
    loadQuestions()
      .then(data => {
        if (!active) return;
        setQuestions(data);
        setVersion(getLoadedQuestionBankVersion());
        setError(null);
      })
      .catch(cause => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : '题库加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { questions, loading, error, version };
}
