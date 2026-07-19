import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

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
}

export default function Select({
  value,
  options,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  className = '',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const listboxId = useId();
  const selectedOption = options.find(option => option.value === value) ?? options[0];

  const updatePlacement = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = Math.min(options.length * 40 + 14, 256);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    setOpenUpwards(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
  }, [options.length]);

  const focusOption = useCallback(
    (startIndex: number, direction: 1 | -1) => {
      for (let offset = 0; offset < options.length; offset += 1) {
        const index = (startIndex + offset * direction + options.length) % options.length;
        const option = options[index];
        if (!option.disabled) {
          optionRefs.current.get(option.value)?.focus();
          return;
        }
      }
    },
    [options],
  );

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    updatePlacement();
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [open, updatePlacement]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = Math.max(
      0,
      options.findIndex(option => option.value === value),
    );
    const frame = requestAnimationFrame(() => focusOption(selectedIndex, 1));
    return () => cancelAnimationFrame(frame);
  }, [focusOption, open, options, value]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent, index: number) => {
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
      focusOption(options.length - 1, -1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeAndFocusTrigger();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

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

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel ?? label}
          className={`absolute left-0 right-0 z-40 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-xl shadow-bg/20 ${
            openUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {options.map((option, index) => {
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
                onKeyDown={event => handleOptionKeyDown(event, index)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-accent/10 focus-visible:text-accent disabled:opacity-40 ${
                  selected ? 'bg-accent/10 font-medium text-accent' : 'text-text hover:bg-surface2'
                }`}
              >
                <span>{option.label}</span>
                {selected && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
