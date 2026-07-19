PRAGMA foreign_keys = ON;

CREATE TABLE question_bank_meta (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  draft_revision INTEGER NOT NULL DEFAULT 0 CHECK (draft_revision >= 0),
  published_revision INTEGER NOT NULL DEFAULT 0 CHECK (published_revision >= 0),
  source_sha256 TEXT,
  imported_at TEXT,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO question_bank_meta (singleton_id) VALUES (1);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  kp_id TEXT NOT NULL,
  kp_name TEXT NOT NULL,
  grade TEXT NOT NULL,
  semester TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  type TEXT NOT NULL CHECK (type IN ('fill_blank', 'choice', 'mixed')),
  question TEXT NOT NULL,
  blanks_json TEXT NOT NULL,
  blank_types_json TEXT,
  choices_json TEXT,
  correct_choice TEXT,
  solution TEXT NOT NULL,
  common_mistake TEXT NOT NULL,
  hint TEXT NOT NULL,
  enable INTEGER NOT NULL DEFAULT 1 CHECK (enable IN (0, 1)),
  check_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_questions_grade_semester ON questions (grade, semester);
CREATE INDEX idx_questions_kp_id ON questions (kp_id);
CREATE INDEX idx_questions_status_updated ON questions (enable, updated_at DESC);
CREATE INDEX idx_questions_difficulty_type ON questions (difficulty, type);

CREATE TABLE published_questions (
  id TEXT PRIMARY KEY,
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
  published_revision INTEGER NOT NULL,
  published_at TEXT NOT NULL
);

CREATE INDEX idx_published_questions_kp_id ON published_questions (kp_id);
CREATE INDEX idx_published_questions_enabled ON published_questions (enable, id);

CREATE TABLE question_bank_releases (
  revision INTEGER PRIMARY KEY,
  question_count INTEGER NOT NULL,
  enabled_count INTEGER NOT NULL,
  source_sha256 TEXT,
  published_at TEXT NOT NULL
);

CREATE TABLE question_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision INTEGER NOT NULL,
  question_id TEXT,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  actor TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_question_audit_created ON question_audit_logs (created_at DESC, id DESC);
CREATE INDEX idx_question_audit_question ON question_audit_logs (question_id, id DESC);
