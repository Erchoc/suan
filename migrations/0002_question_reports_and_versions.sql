PRAGMA foreign_keys = ON;

CREATE TABLE published_question_versions (
  revision INTEGER NOT NULL CHECK (revision > 0),
  id TEXT NOT NULL,
  kp_id TEXT NOT NULL,
  kp_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  semester TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  type TEXT NOT NULL,
  question TEXT NOT NULL,
  blanks_json TEXT NOT NULL,
  blank_types_json TEXT,
  choices_json TEXT,
  correct_choice TEXT,
  solution TEXT NOT NULL,
  common_mistake TEXT NOT NULL,
  hint TEXT NOT NULL,
  enable INTEGER NOT NULL,
  check_message TEXT,
  published_at TEXT NOT NULL,
  PRIMARY KEY (revision, id)
);

CREATE INDEX idx_published_question_versions_id
  ON published_question_versions (id, revision DESC);

INSERT OR IGNORE INTO published_question_versions (
  revision, id, kp_id, kp_name, grade, semester, difficulty, type, question,
  blanks_json, blank_types_json, choices_json, correct_choice, solution,
  common_mistake, hint, enable, check_message, published_at
)
SELECT
  published_revision, id, kp_id, kp_name, grade, semester, difficulty, type, question,
  blanks_json, blank_types_json, choices_json, correct_choice, solution,
  common_mistake, hint, enable, check_message, published_at
FROM published_questions
WHERE published_revision > 0;

CREATE TABLE question_reports (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  question_id TEXT NOT NULL,
  published_revision INTEGER NOT NULL CHECK (published_revision > 0),
  question_snapshot_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('exam', 'review')),
  session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX idx_question_reports_status_created
  ON question_reports (status, created_at DESC);

CREATE INDEX idx_question_reports_question_status
  ON question_reports (question_id, status, created_at DESC);
