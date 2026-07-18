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
  label: string;   // "A" / "B" / "C" / "D"
  content: string; // 选项文字
}

export type QuestionType = 'fill_blank' | 'choice' | 'mixed';

/** 每个填空的输入类型，与 blanks[] 下标一一对应 */
export type BlankInputType = 'number' | 'choice' | 'text';

export interface Question {
  id: string;
  kp_id: string;
  kp_name: string;
  grade: string;
  semester: string;
  difficulty: 'easy' | 'medium' | 'hard';
  type: QuestionType;            // 题型（存量题默认 fill_blank）
  question: string;
  blanks: string[];              // 填空答案（fill_blank、mixed 用）
  blank_types?: BlankInputType[]; // 兼容字段：每个空的输入类型，与 blanks[] 同索引
  choices?: Choice[];            // 选项列表（choice、mixed 用）
  correctChoice?: string;        // 正确选项 label（choice、mixed 用）
  solution: string;
  common_mistake: string;
  hint: string;
  enable?: boolean;              // false = 已被校验标记为异常，选题时排除
  checkMessage?: string;         // 标记为异常时的具体原因（来自 check/validate 脚本）
}

export type DifficultyLevel = 'basic' | 'random' | 'challenge';

export interface ExamConfig {
  gradeNum: number | null;
  semester: '上' | '下' | null;
  scope: 'full' | 'current';
  selectedUnitIds: Set<string>;
  difficulty: DifficultyLevel;
  questionCount: number;
  timeLimitMinutes: number;        // 0 = 不计时
  filterChineseInput: boolean;     // 过滤含中文填空的题目（1-3年级默认开启）
}

export interface ExamSession {
  sessionId: string;
  config: ExamConfig;
  questions: Question[];
  answers: Record<string, string[]>;
  choiceAnswers: Record<string, string>;  // 题目id → 选择答案 label
  issueReports: Record<string, string>;   // 题目id → 异常原因描述
  bookmarks: Set<string>;
  startedAt: number | null;
  submittedAt: number | null;
  lastQuestionIndex?: number;             // 上次退出时的题目序号，用于断点续做
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

// ─── 复习模式 ─────────────────────────────────────────────────────

export type ReviewSourceType = 'report' | 'bookmarks' | 'kps'

export interface ReviewSource {
  type: ReviewSourceType
  /** type='report' 时：来源的考试 sessionId 列表；空数组=全部历史 */
  sessionIds?: string[]
  /** type='kps' 时：选中的知识点 ID 列表 */
  kpIds?: string[]
}

export type ReviewResult = 'correct' | 'wrong'

export interface ReviewSession {
  sessionId: string
  sources: ReviewSource[]
  questions: Question[]
  answers: Record<string, string[]>
  choiceAnswers: Record<string, string>
  /** 提交后的判题结果，key 为题目 id */
  results: Record<string, ReviewResult>
  /** 收藏的题目 ID 列表（array 便于 JSON 序列化，持久化到 localStorage） */
  bookmarks: string[]
  /** 异常反馈，key=题目id, value=用户描述 */
  issueReports: Record<string, string>
  startedAt: number
  completedAt?: number
}

// ─── 预习模式 ────────────────────────────────────────────

export interface KnowledgeFAQ {
  question: string  // 常见困惑问题，如"为什么分母不变？"
  answer: string    // Markdown，预生成解释
}

export interface KnowledgeCard {
  kp_id: string
  explanation: string    // 详细讲解，Markdown（不含 LaTeX，用普通字符表达数学）
  faqs: KnowledgeFAQ[]  // 2-4 个常见困惑
  textbook_ref?: string  // "人教版五年级上册 P.34"，4-6年级显示

  meta: {
    generated_at: string
    model: string
    reviewed: boolean
  }

  // Phase 2 占位（语音）
  audio?: {
    url: string
    duration: number
    tts_engine: string
  }

  // Phase 3 占位（动画视频）
  animation?: {
    url: string
    duration: number
    segments: { start: number; end: number; label: string }[]
  }
}

export type PreviewPhase = 'card' | 'practice' | 'faq' | 'summary'

export interface PreviewSession {
  sessionId: string
  kpIds: string[]              // 选中的知识点（有序）
  currentKpIndex: number       // 当前第几个知识点（0-based）
  phase: PreviewPhase
  answers: Record<string, string[]>        // questionId → 填空答案
  choiceAnswers: Record<string, string>    // questionId → 选择答案 label
  results: Record<string, 'correct' | 'wrong'>  // questionId → 判题结果
  cardSkippedKps: string[]     // 跳过了知识卡的 kpId 列表
  faqSelectedIds: Record<string, number[]> // kpId → 已点开的 faqIndex 列表
  startedAt: number
  completedAt?: number
}
