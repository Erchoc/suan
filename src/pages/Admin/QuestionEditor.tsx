import { Save, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import Button from '../../components/ui/Button';
import Select, { type SelectOption } from '../../components/ui/Select';
import type { QuestionPatch } from '../../data/adminQuestionBank';
import type { BlankInputType, Question, QuestionType } from '../../types';

interface QuestionEditorProps {
  question: Question;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: QuestionPatch) => Promise<void>;
}

interface EditorState {
  kpId: string;
  kpName: string;
  grade: string;
  semester: string;
  difficulty: Question['difficulty'];
  type: QuestionType;
  question: string;
  blanks: string;
  blankTypes: string;
  choices: string;
  correctChoice: string;
  solution: string;
  commonMistake: string;
  hint: string;
  enable: boolean;
  checkMessage: string;
}

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '简单' },
  { value: 'medium', label: '中等' },
  { value: 'hard', label: '困难' },
] satisfies SelectOption[];
const TYPE_OPTIONS = [
  { value: 'fill_blank', label: '填空题' },
  { value: 'choice', label: '选择题' },
  { value: 'mixed', label: '综合题' },
] satisfies SelectOption[];

function toEditorState(question: Question): EditorState {
  return {
    kpId: question.kp_id,
    kpName: question.kp_name,
    grade: question.grade,
    semester: question.semester,
    difficulty: question.difficulty,
    type: question.type || 'fill_blank',
    question: question.question,
    blanks: question.blanks.join('\n'),
    blankTypes: question.blank_types?.join('\n') ?? '',
    choices: question.choices?.map(choice => `${choice.label}|${choice.content}`).join('\n') ?? '',
    correctChoice: question.correctChoice ?? '',
    solution: question.solution,
    commonMistake: question.common_mistake,
    hint: question.hint,
    enable: question.enable !== false,
    checkMessage: question.checkMessage ?? '',
  };
}

function TextField({
  label,
  value,
  onChange,
  multiline = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  hint?: string;
}) {
  const fieldId = useId();
  const classes =
    'w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent';
  return (
    <div className="flex flex-col gap-1.5 text-sm text-text-dim">
      <label htmlFor={fieldId} className="font-medium text-text">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={fieldId}
          value={value}
          onChange={event => onChange(event.target.value)}
          rows={4}
          className={`${classes} resize-y`}
        />
      ) : (
        <input
          id={fieldId}
          value={value}
          onChange={event => onChange(event.target.value)}
          className={classes}
        />
      )}
      {hint && <span className="text-xs text-text-dim/70">{hint}</span>}
    </div>
  );
}

export default function QuestionEditor({ question, saving, onClose, onSave }: QuestionEditorProps) {
  const [state, setState] = useState(() => toEditorState(question));
  const [error, setError] = useState<string | null>(null);
  const showChoices = state.type === 'choice' || state.type === 'mixed';
  const showBlanks = state.type === 'fill_blank' || state.type === 'mixed';
  const title = useMemo(() => `编辑 ${question.id}`, [question.id]);

  const update = <Key extends keyof EditorState>(key: Key, value: EditorState[Key]) => {
    setState(current => ({ ...current, [key]: value }));
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      const blanks = state.blanks
        .split('\n')
        .map(value => value.trim())
        .filter(Boolean);
      const blankTypes = state.blankTypes
        .split('\n')
        .map(value => value.trim())
        .filter(Boolean) as BlankInputType[];
      const choices = state.choices
        .split('\n')
        .map(value => value.trim())
        .filter(Boolean)
        .map((line, index) => {
          const separator = line.indexOf('|');
          if (separator <= 0 || separator === line.length - 1) {
            throw new Error(`选项第 ${index + 1} 行应使用“标签|内容”格式`);
          }
          return {
            label: line.slice(0, separator).trim(),
            content: line.slice(separator + 1).trim(),
          };
        });
      if (!state.enable && !state.checkMessage.trim()) {
        throw new Error('禁用题目时必须填写质量原因');
      }
      await onSave({
        kp_id: state.kpId,
        kp_name: state.kpName,
        grade: state.grade,
        semester: state.semester,
        difficulty: state.difficulty,
        type: state.type,
        question: state.question,
        blanks: showBlanks ? blanks : [],
        blank_types: showBlanks && blankTypes.length ? blankTypes : null,
        choices: showChoices ? choices : null,
        correctChoice:
          showChoices && state.correctChoice.trim() ? state.correctChoice.trim() : null,
        solution: state.solution,
        common_mistake: state.commonMistake,
        hint: state.hint,
        enable: state.enable,
        checkMessage: state.checkMessage.trim() || null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/50 backdrop-blur-sm"
      role="dialog"
    >
      <button type="button" aria-label="关闭编辑器" className="flex-1" onClick={onClose} />
      <section className="h-full w-full max-w-2xl overflow-y-auto border-l border-border bg-bg shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-accent">Question asset</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-text">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-text-dim hover:bg-surface2 hover:text-text"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <TextField
            label="知识点 ID"
            value={state.kpId}
            onChange={value => update('kpId', value)}
          />
          <TextField
            label="知识点名称"
            value={state.kpName}
            onChange={value => update('kpName', value)}
          />
          <TextField label="年级" value={state.grade} onChange={value => update('grade', value)} />
          <TextField
            label="学期"
            value={state.semester}
            onChange={value => update('semester', value)}
          />

          <Select
            label="难度"
            value={state.difficulty}
            options={DIFFICULTY_OPTIONS}
            onChange={value => update('difficulty', value as Question['difficulty'])}
          />
          <Select
            label="题型"
            value={state.type}
            options={TYPE_OPTIONS}
            onChange={value => update('type', value as QuestionType)}
          />

          <div className="sm:col-span-2">
            <TextField
              label="题干"
              value={state.question}
              onChange={value => update('question', value)}
              multiline
              hint="填空位置使用 ____；保存前可在后台预览当前版本。"
            />
          </div>
          {showBlanks && (
            <>
              <TextField
                label="答案"
                value={state.blanks}
                onChange={value => update('blanks', value)}
                multiline
                hint="每行一个答案，顺序与填空位置一致。"
              />
              <TextField
                label="输入类型"
                value={state.blankTypes}
                onChange={value => update('blankTypes', value)}
                multiline
                hint="每行填写 number、choice 或 text；可留空。"
              />
            </>
          )}
          {showChoices && (
            <>
              <TextField
                label="选项"
                value={state.choices}
                onChange={value => update('choices', value)}
                multiline
                hint="每行使用 A|选项内容 格式。"
              />
              <TextField
                label="正确选项"
                value={state.correctChoice}
                onChange={value => update('correctChoice', value)}
              />
            </>
          )}
          <div className="sm:col-span-2">
            <TextField
              label="解析"
              value={state.solution}
              onChange={value => update('solution', value)}
              multiline
            />
          </div>
          <TextField
            label="常见错误"
            value={state.commonMistake}
            onChange={value => update('commonMistake', value)}
            multiline
          />
          <TextField
            label="提示"
            value={state.hint}
            onChange={value => update('hint', value)}
            multiline
          />

          <div className="sm:col-span-2 rounded-2xl border border-border bg-surface p-4">
            <label className="flex items-center gap-3 text-sm font-medium text-text">
              <input
                type="checkbox"
                checked={state.enable}
                onChange={event => update('enable', event.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              保存后允许学生在新建作答中使用
            </label>
            <div className="mt-3">
              <TextField
                label="质量原因"
                value={state.checkMessage}
                onChange={value => update('checkMessage', value)}
                multiline
                hint="禁用时必填；启用后可清空。"
              />
            </div>
          </div>
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-bg/95 px-5 py-4 backdrop-blur">
          <p className="text-sm text-red-500">{error}</p>
          <div className="ml-auto flex gap-2">
            <Button onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={saving}>
              <Save size={15} />
              {saving ? '保存中…' : '保存并同步'}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
