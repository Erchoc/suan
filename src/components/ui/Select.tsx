import { Check, ChevronDown, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { calculateSelectPlacement, type SelectMenuPlacement } from './selectPlacement';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const MAX_MENU_HEIGHT = 320;
const OPTION_HEIGHT = 40;
const MENU_PADDING = 12;
const SEARCH_HEIGHT = 52;

export default function Select({
  value,
  options,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  className = '',
  searchable = false,
  searchPlaceholder = '搜索选项',
  emptyText = '没有匹配选项',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuPlacement, setMenuPlacement] = useState<SelectMenuPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const listboxId = useId();
  const selectedOption = options.find(option => option.value === value) ?? options[0];
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const visibleOptions = useMemo(
    () =>
      normalizedQuery
        ? options.filter(option =>
            option.label.toLocaleLowerCase('zh-CN').includes(normalizedQuery),
          )
        : options,
    [normalizedQuery, options],
  );

  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportBottom = viewportTop + (visualViewport?.height ?? window.innerHeight);
    const viewportRight = viewportLeft + (visualViewport?.width ?? window.innerWidth);
    const boundary = rootRef.current?.closest<HTMLElement>('[data-select-boundary]');
    const boundaryRect = boundary?.getBoundingClientRect();
    const estimatedHeight = Math.min(
      MAX_MENU_HEIGHT,
      visibleOptions.length * OPTION_HEIGHT + MENU_PADDING + (searchable ? SEARCH_HEIGHT : 0),
    );
    setMenuPlacement(
      calculateSelectPlacement({
        trigger: rect,
        viewport: {
          top: viewportTop,
          bottom: viewportBottom,
          left: viewportLeft,
          right: viewportRight,
        },
        ...(boundaryRect
          ? { boundary: { top: boundaryRect.top, bottom: boundaryRect.bottom } }
          : {}),
        estimatedHeight,
      }),
    );
  }, [searchable, visibleOptions.length]);

  const focusOption = useCallback(
    (startIndex: number, direction: 1 | -1) => {
      for (let offset = 0; offset < visibleOptions.length; offset += 1) {
        const index =
          (startIndex + offset * direction + visibleOptions.length) % visibleOptions.length;
        const option = visibleOptions[index];
        if (!option.disabled) {
          const element = optionRefs.current.get(option.value);
          element?.focus({ preventScroll: true });
          element?.scrollIntoView({ block: 'nearest' });
          return;
        }
      }
    },
    [visibleOptions],
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      setMenuPlacement(null);
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const boundary = rootRef.current?.closest<HTMLElement>('[data-select-boundary]');
    const resizeObserver = new ResizeObserver(updatePlacement);
    if (triggerRef.current) resizeObserver.observe(triggerRef.current);
    if (boundary) resizeObserver.observe(boundary);

    updatePlacement();
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    window.visualViewport?.addEventListener('resize', updatePlacement);
    window.visualViewport?.addEventListener('scroll', updatePlacement);
    return () => {
      resizeObserver.disconnect();
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
      window.visualViewport?.removeEventListener('resize', updatePlacement);
      window.visualViewport?.removeEventListener('scroll', updatePlacement);
    };
  }, [open, updatePlacement]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = Math.max(
      0,
      visibleOptions.findIndex(option => option.value === value),
    );
    const frame = requestAnimationFrame(() => {
      if (searchable) searchRef.current?.focus({ preventScroll: true });
      else focusOption(selectedIndex, 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusOption, open, searchable, value, visibleOptions]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const closeAndMoveFocus = (backwards: boolean) => {
    const trigger = triggerRef.current;
    setOpen(false);
    requestAnimationFrame(() => {
      if (!trigger) return;
      const scope = trigger.closest('[role="dialog"]') ?? document;
      const focusable = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      const index = focusable.indexOf(trigger);
      const nextIndex = backwards ? index - 1 : index + 1;
      focusable[nextIndex]?.focus();
    });
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusOption(index + 1, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(index - 1, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusOption(0, 1);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusOption(visibleOptions.length - 1, -1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAndFocusTrigger();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      closeAndMoveFocus(event.shiftKey);
    }
  };

  const menu =
    open && menuPlacement
      ? createPortal(
          <div
            ref={menuRef}
            data-select-menu
            data-placement={menuPlacement.openUpwards ? 'top' : 'bottom'}
            className="fixed z-[120] flex overflow-hidden rounded-xl border border-border bg-surface shadow-xl shadow-black/15"
            style={{
              top: menuPlacement.top,
              left: menuPlacement.left,
              width: menuPlacement.width,
              maxHeight: menuPlacement.maxHeight,
            }}
          >
            <div className="flex min-h-0 w-full flex-col">
              {searchable && (
                <div className="shrink-0 border-b border-border p-2">
                  <label className="flex items-center gap-2 rounded-lg bg-surface2 px-2.5 py-2 text-text-dim focus-within:ring-2 focus-within:ring-accent/20">
                    <Search size={14} className="shrink-0" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'ArrowDown') {
                          event.preventDefault();
                          focusOption(0, 1);
                        } else if (event.key === 'ArrowUp') {
                          event.preventDefault();
                          focusOption(visibleOptions.length - 1, -1);
                        } else if (event.key === 'Enter' && visibleOptions.length > 0) {
                          event.preventDefault();
                          focusOption(0, 1);
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          event.stopPropagation();
                          closeAndFocusTrigger();
                        } else if (event.key === 'Tab') {
                          event.preventDefault();
                          closeAndMoveFocus(event.shiftKey);
                        }
                      }}
                      aria-label={searchPlaceholder}
                      placeholder={searchPlaceholder}
                      className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-dim/70"
                    />
                  </label>
                </div>
              )}
              <div
                id={listboxId}
                role="listbox"
                aria-label={ariaLabel ?? label}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5"
              >
                {visibleOptions.length > 0 ? (
                  visibleOptions.map((option, index) => {
                    const selected = option.value === value;
                    return (
                      <button
                        key={option.value}
                        ref={element => {
                          if (element) optionRefs.current.set(option.value, element);
                          else optionRefs.current.delete(option.value);
                        }}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={option.disabled}
                        onClick={() => {
                          onChange(option.value);
                          closeAndFocusTrigger();
                        }}
                        onKeyDown={event => handleMenuKeyDown(event, index)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-accent/10 focus-visible:text-accent disabled:opacity-40 ${
                          selected
                            ? 'bg-accent/10 font-medium text-accent'
                            : 'text-text hover:bg-surface2'
                        }`}
                      >
                        <span className="min-w-0 truncate" title={option.label}>
                          {option.label}
                        </span>
                        {selected && <Check size={14} className="shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  <p className="px-2.5 py-5 text-center text-sm text-text-dim">{emptyText}</p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && <span className="mb-1.5 block text-sm font-medium text-text">{label}</span>}
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => {
          if (!open) updatePlacement();
          setOpen(current => !current);
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            updatePlacement();
            setOpen(true);
          }
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface2 px-3 py-2 text-left text-sm text-text outline-none transition-colors hover:border-accent/60 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate">{selectedOption?.label}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-text-dim transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {menu}
    </div>
  );
}
