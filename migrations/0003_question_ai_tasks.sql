PRAGMA foreign_keys = ON;

CREATE TABLE question_tasks (
  id TEXT PRIMARY KEY,
  workflow_instance_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('generate', 'quality')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  params_json TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress_current INTEGER NOT NULL DEFAULT 0 CHECK (progress_current >= 0),
  progress_total INTEGER NOT NULL DEFAULT 0 CHECK (progress_total >= 0),
  stats_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_question_tasks_created
  ON question_tasks (created_at DESC, id DESC);

CREATE INDEX idx_question_tasks_status_updated
  ON question_tasks (status, updated_at DESC);

CREATE TABLE question_task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'success', 'warning', 'error')),
  message TEXT NOT NULL,
  progress_current INTEGER,
  progress_total INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES question_tasks(id) ON DELETE CASCADE
);

CREATE INDEX idx_question_task_events_task
  ON question_task_events (task_id, id DESC);

CREATE UNIQUE INDEX idx_question_task_events_key
  ON question_task_events (task_id, event_key);

CREATE TABLE question_task_batches (
  task_id TEXT NOT NULL,
  batch_key TEXT NOT NULL,
  result_json TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY (task_id, batch_key),
  FOREIGN KEY (task_id) REFERENCES question_tasks(id) ON DELETE CASCADE
);
