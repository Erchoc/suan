import { useEffect, useState } from 'react';
import { loadQuestions } from '../data/questions';
import type { Question } from '../types';

export function useQuestions() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadQuestions()
      .then(data => {
        if (!active) return;
        setQuestions(data);
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

  return { questions, loading, error };
}
