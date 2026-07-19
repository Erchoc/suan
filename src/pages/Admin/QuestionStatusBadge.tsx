import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Badge from '../../components/ui/Badge';

interface QuestionStatusBadgeProps {
  enabled: boolean;
  reason?: string | null;
}

interface PopoverPosition {
  top: number;
  left: number;
  width: number;
}

const VIEWPORT_GUTTER = 12;
const POPOVER_GAP = 8;
const MAX_POPOVER_WIDTH = 320;

export default function QuestionStatusBadge({ enabled, reason }: QuestionStatusBadgeProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const open = !enabled && (hovered || focused || pinned);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const width = Math.min(MAX_POPOVER_WIDTH, viewportWidth - VIEWPORT_GUTTER * 2);
    const height = popoverRef.current?.getBoundingClientRect().height ?? 88;
    const preferredLeft = triggerRect.left + triggerRect.width / 2 - width / 2;
    const left = Math.min(
      Math.max(preferredLeft, viewportLeft + VIEWPORT_GUTTER),
      viewportRight - width - VIEWPORT_GUTTER,
    );
    const fitsBelow = triggerRect.bottom + POPOVER_GAP + height <= viewportBottom - VIEWPORT_GUTTER;
    const top = fitsBelow
      ? triggerRect.bottom + POPOVER_GAP
      : Math.max(viewportTop + VIEWPORT_GUTTER, triggerRect.top - POPOVER_GAP - height);

    setPosition({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setPinned(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
        setHovered(false);
        setFocused(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [open, updatePosition]);

  if (enabled) return <Badge color="#2a9d8f">已启用</Badge>;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={open ? popoverId : undefined}
        aria-expanded={open}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={() => setPinned(current => !current)}
        className="rounded-md outline-none ring-accent/30 focus-visible:ring-2"
      >
        <Badge color="#f25f4c">已停用</Badge>
      </button>
      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="tooltip"
              className="fixed z-[130] rounded-xl border border-border bg-surface px-3 py-2.5 text-left shadow-xl shadow-black/15"
              style={position}
            >
              <p className="text-xs font-semibold text-red-500">停用原因</p>
              <p className="mt-1 text-xs leading-relaxed text-text">
                {reason?.trim() || '暂未记录停用原因'}
              </p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
