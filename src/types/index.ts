export interface KnowledgePoint {
  id: string;
  name: string;
  deps: string[];
}

export interface Unit {
  id: string;
  name: string;
  semester: '上' | '下';
  kps: KnowledgePoint[];
}

export interface Domain {
  id: string;
  name: string;
  icon: string;
  units: Unit[];
}

export interface Grade {
  id: string;
  name: string;
  color: string;
  domains: Domain[];
}

export interface BridgeGroup {
  id: string;
  label: string;
  name: string;
  desc: string;
  kpIds: string[];
}

export interface KnowledgeGraph {
  meta: {
    version: string;
    textbook: string;
    subject: string;
    gradeRange: string;
    totalKnowledgePoints: number;
    updatedAt: string;
    bridgePoints: {
      description: string;
      groups: BridgeGroup[];
    };
  };
  grades: Grade[];
}

export interface Choice {
  label: string; // "A" / "B" / "C" / "D"
  content: string; // Choice text
}

export type QuestionType = 'fill_blank' | 'choice' | 'mixed';

/** Input type for each blank, aligned by index with blanks[]. */
export type BlankInputType = 'number' | 'choice' | 'text';

export interface Question {
  id: string;
  kp_id: string;
  kp_name: string;
  grade: string;
  semester: string;
  difficulty: 'easy' | 'medium' | 'hard';
  type: QuestionType; // Question type; legacy questions default to fill_blank.
  question: string;
  blanks: string[]; // Answers for fill_blank and mixed questions.
  blank_types?: BlankInputType[]; // Compatibility field aligned by index with blanks[].
  choices?: Choice[]; // Choices for choice and mixed questions.
  correctChoice?: string; // Correct choice label for choice and mixed questions.
  solution: string;
  common_mistake: string;
  hint: string;
  enable?: boolean; // false excludes a question that validation marked invalid.
  checkMessage?: string; // Validation reason produced by the check or validate script.
}

export type DifficultyLevel = 'basic' | 'random' | 'challenge';

export interface ExamConfig {
  gradeNum: number | null;
  semester: '上' | '下' | null;
  scope: 'full' | 'current';
  selectedUnitIds: Set<string>;
  difficulty: DifficultyLevel;
  questionCount: number;
  timeLimitMinutes: number; // 0 disables the timer.
  filterChineseInput: boolean; // Filters text-input blanks for grades 1-3.
}

export interface ExamSession {
  sessionId: string;
  config: ExamConfig;
  questions: Question[];
  answers: Record<string, string[]>;
  choiceAnswers: Record<string, string>; // Question ID to selected choice label.
  issueReports: Record<string, string>; // Question ID to issue description.
  bookmarks: Set<string>;
  startedAt: number | null;
  submittedAt: number | null;
  lastQuestionIndex?: number; // Last visited question index for resuming a session.
}

export interface ReportData {
  sessionId: string;
  totalQuestions: number;
  correctCount: number;
  duration: number;
  kpStats: KPStat[];
}

export interface KPStat {
  kpId: string;
  kpName: string;
  grade: string;
  total: number;
  correct: number;
  errorRate: number;
}

// ─── Review mode ──────────────────────────────────────────────────

export type ReviewSourceType = 'report' | 'bookmarks' | 'kps';

export interface ReviewSource {
  type: ReviewSourceType;
  /** Source exam session IDs for type='report'; an empty array means all history. */
  sessionIds?: string[];
  /** Selected knowledge point IDs for type='kps'. */
  kpIds?: string[];
}

export type ReviewResult = 'correct' | 'wrong';

export interface ReviewSession {
  sessionId: string;
  sources: ReviewSource[];
  questions: Question[];
  answers: Record<string, string[]>;
  choiceAnswers: Record<string, string>;
  /** Submitted results keyed by question ID. */
  results: Record<string, ReviewResult>;
  /** Bookmarked question IDs stored as an array for JSON and localStorage persistence. */
  bookmarks: string[];
  /** Issue descriptions keyed by question ID. */
  issueReports: Record<string, string>;
  startedAt: number;
  completedAt?: number;
}

// ─── Preview mode ─────────────────────────────────────────────────

export interface KnowledgeFAQ {
  question: string; // A common student question.
  answer: string; // A pre-generated Markdown explanation.
}

export interface KnowledgeCard {
  kp_id: string;
  explanation: string; // Detailed Markdown explanation using plain-text math instead of LaTeX.
  faqs: KnowledgeFAQ[]; // Two to four common questions.
  textbook_ref?: string; // Textbook reference displayed for grades 4-6.

  meta: {
    generated_at: string;
    model: string;
    reviewed: boolean;
  };

  // Phase 2 placeholder for audio.
  audio?: {
    url: string;
    duration: number;
    tts_engine: string;
  };

  // Phase 3 placeholder for animated video.
  animation?: {
    url: string;
    duration: number;
    segments: { start: number; end: number; label: string }[];
  };
}

export type PreviewPhase = 'card' | 'practice' | 'faq' | 'summary';

export interface PreviewSession {
  sessionId: string;
  kpIds: string[]; // Ordered selected knowledge point IDs.
  currentKpIndex: number; // Zero-based current knowledge point index.
  phase: PreviewPhase;
  answers: Record<string, string[]>; // Question ID to blank answers.
  choiceAnswers: Record<string, string>; // Question ID to selected choice label.
  results: Record<string, 'correct' | 'wrong'>; // Question ID to result.
  cardSkippedKps: string[]; // Knowledge point IDs whose cards were skipped.
  faqSelectedIds: Record<string, number[]>; // Knowledge point ID to opened FAQ indexes.
  startedAt: number;
  completedAt?: number;
}
