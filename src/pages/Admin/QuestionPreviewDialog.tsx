import { AlertTriangle, BookOpen, CheckCircle2, Lightbulb } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import type { AdminQuestion } from '../../data/adminQuestionBank';
import type { QuestionType } from '../../types';
import { stripLatex } from '../../utils/latex';

const TYPE_LABELS: Record<QuestionType, string> = {
  fill_blank: '填空题',
  choice: '选择题',
  mixed: '综合题',
};
const DIFFICULTY_LABELS = { easy: '简单', medium: '中等', hard: '困难' };

function InfoSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface px-4 py-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
        {icon}
        {title}
      </h3>
      <div className="mt-2 text-sm leading-relaxed text-text-dim">{children}</div>
    </section>
  );
}

export default function QuestionPreviewDialog({
  question,
  onClose,
}: {
  question: AdminQuestion | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={question !== null}
      title={question ? `题目预览 · ${question.id}` : '题目预览'}
      description="这里展示后台当前版本，包括尚未启用或刚刚修改的内容。"
      panelClassName="max-w-3xl"
      onClose={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      {question && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge>
              {question.grade} · {question.semester}
            </Badge>
            <Badge>{TYPE_LABELS[question.type || 'fill_blank']}</Badge>
            <Badge>{DIFFICULTY_LABELS[question.difficulty]}</Badge>
            <Badge color={question.enable === false ? '#f25f4c' : '#2a9d8f'}>
              {question.enable === false ? '已停用' : '已启用'}
            </Badge>
          </div>

          <div className="rounded-2xl bg-surface2 px-5 py-5">
            <p className="text-xs text-text-dim">
              {question.kp_id} · {question.kp_name}
            </p>
            <p className="mt-3 font-serif text-lg leading-loose text-text">
              {stripLatex(question.question)}
            </p>
          </div>

          {question.choices?.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {question.choices.map(choice => (
                <div
                  key={choice.label}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${choice.label === question.correctChoice ? 'border-green bg-green/5' : 'border-border bg-surface'}`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${choice.label === question.correctChoice ? 'bg-green text-white' : 'bg-surface2 text-text-dim'}`}
                  >
                    {choice.label}
                  </span>
                  <span className="text-sm leading-relaxed text-text">
                    {stripLatex(choice.content)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoSection icon={<CheckCircle2 size={15} className="text-green" />} title="标准答案">
              {question.correctChoice && <p>正确选项：{question.correctChoice}</p>}
              {question.blanks.length > 0 && <p>{question.blanks.join('；')}</p>}
            </InfoSection>
            <InfoSection icon={<BookOpen size={15} className="text-accent" />} title="解题过程">
              {question.solution}
            </InfoSection>
            <InfoSection
              icon={<AlertTriangle size={15} className="text-amber-500" />}
              title="常见错误"
            >
              {question.common_mistake}
            </InfoSection>
            <InfoSection icon={<Lightbulb size={15} className="text-accent" />} title="提示">
              {question.hint}
            </InfoSection>
          </div>

          {question.checkMessage && (
            <InfoSection
              icon={<AlertTriangle size={15} className="text-red-500" />}
              title="停用 / 质检原因"
            >
              {question.checkMessage}
            </InfoSection>
          )}
        </div>
      )}
    </Dialog>
  );
}
