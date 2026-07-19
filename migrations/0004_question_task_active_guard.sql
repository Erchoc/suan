CREATE UNIQUE INDEX idx_question_tasks_single_active
  ON question_tasks ((1))
  WHERE status IN ('queued', 'running');
