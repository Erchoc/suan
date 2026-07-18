import { motion, AnimatePresence } from 'framer-motion';

// ─── 类型 ──────────────────────────────────────────────────────────────────

export type KeyboardMode = 'number' | 'choice';

interface CustomKeyboardProps {
  /** 键盘是否可见 */
  visible: boolean;
  /** 键盘模式：数字九宫格 or ABCD选择 */
  mode: KeyboardMode;
  /** 当前聚焦的空的值（用于顶部回显） */
  currentValue: string;
  /** 当前是否是最后一个操作项（决定按钮文案） */
  isLast: boolean;
  /** 当前空的序号（0-based） */
  blankIndex: number;
  /** 总空数 */
  totalBlanks: number;
  /** 按下数字/字母键 */
  onInput: (char: string) => void;
  /** 退格 */
  onBackspace: () => void;
  /** 完成当前空 → 前进到下一空或关闭键盘 */
  onNext: () => void;
  /** 关闭键盘 */
  onClose: () => void;
}

// ─── 九宫格数字键盘（退格 + 完成 合并到右侧列）────────────────────────────

const NUM_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', '-'],
];

function NumPad({
  onInput,
  onBackspace,
  onNext,
  nextLabel,
}: {
  onInput: (c: string) => void;
  onBackspace: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <div className="flex gap-2">
      {/* 数字区 */}
      <div className="flex-1 grid grid-rows-4 gap-1.5">
        {NUM_ROWS.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-1.5">
            {row.map(key => (
              <button
                key={key}
                onPointerDown={e => { e.preventDefault(); onInput(key); }}
                className="
                  h-10 rounded-xl text-base font-mono font-semibold
                  bg-surface2 border border-border
                  text-text active:bg-border active:scale-95
                  transition-all select-none
                "
              >
                {key}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* 右侧功能列：退格（上）+ 完成（下，占 2 格高度） */}
      <div className="flex flex-col gap-1.5 w-14">
        <button
          onPointerDown={e => { e.preventDefault(); onBackspace(); }}
          className="
            flex-1 rounded-xl text-xl
            bg-surface2 border border-border
            text-text-dim active:bg-border active:scale-95
            transition-all select-none flex items-center justify-center
          "
        >
          ⌫
        </button>
        <button
          onPointerDown={e => { e.preventDefault(); onNext(); }}
          className="
            flex-[2] rounded-xl text-xs font-semibold leading-tight
            bg-accent text-white
            active:opacity-80 transition-opacity select-none
            flex items-center justify-center px-1 text-center
          "
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

// ─── ABCD 选择键盘 ──────────────────────────────────────────────────────────

function ChoicePad({ onInput }: { onInput: (c: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {['A', 'B', 'C', 'D'].map(label => (
        <button
          key={label}
          onPointerDown={e => { e.preventDefault(); onInput(label); }}
          className="
            h-14 rounded-2xl text-2xl font-bold
            bg-surface2 border-2 border-border
            text-text active:bg-accent/20 active:border-accent active:scale-95
            transition-all select-none
          "
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── 主组件 ────────────────────────────────────────────────────────────────

export default function CustomKeyboard({
  visible,
  mode,
  currentValue,
  isLast,
  blankIndex,
  totalBlanks,
  onInput,
  onBackspace,
  onNext,
  onClose,
}: CustomKeyboardProps) {
  // 显示 1-based 序号；多空时显示"第 X 空"，单空时隐藏
  const blankLabel = mode === 'number' && totalBlanks > 1
    ? `第 ${blankIndex + 1} 空`
    : null;

  const nextLabel = isLast ? '完\n成' : `下一空`;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed left-0 right-0 z-50 bg-surface border-t border-border rounded-t-2xl shadow-2xl"
          style={{ bottom: 'var(--tab-bar-h)' }}
          onPointerDown={e => e.stopPropagation()}
        >
          {/* 顶部拖拽条 */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          <div className="px-4 pb-4 pt-1.5 space-y-2">
            {/* 当前值回显 + 空位序号 + 收起 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-dim">
                {blankLabel ?? (mode === 'number' ? '填写答案' : '选择答案')}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base text-accent min-w-[56px] text-right">
                  {currentValue || <span className="text-text-dim/40">—</span>}
                </span>
                <button
                  onPointerDown={e => { e.preventDefault(); onClose(); }}
                  className="text-xs text-text-dim px-2 py-1 rounded-lg hover:bg-surface2 transition-colors"
                >
                  收起
                </button>
              </div>
            </div>

            {/* 键盘主体 */}
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {mode === 'number' ? (
                  <NumPad
                    onInput={onInput}
                    onBackspace={onBackspace}
                    onNext={onNext}
                    nextLabel={nextLabel}
                  />
                ) : (
                  <ChoicePad onInput={onInput} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
