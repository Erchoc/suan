export interface SelectTriggerRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface SelectViewportBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface SelectVerticalBoundary {
  top: number;
  bottom: number;
}

export interface SelectMenuPlacement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUpwards: boolean;
}

interface CalculateSelectPlacementInput {
  trigger: SelectTriggerRect;
  viewport: SelectViewportBounds;
  boundary?: SelectVerticalBoundary;
  estimatedHeight: number;
}

const VIEWPORT_GUTTER = 12;
const BOUNDARY_GUTTER = 8;
const MENU_GAP = 6;
const MAX_MENU_HEIGHT = 320;
const MIN_MENU_HEIGHT = 48;

export function calculateSelectPlacement({
  trigger,
  viewport,
  boundary,
  estimatedHeight,
}: CalculateSelectPlacementInput): SelectMenuPlacement {
  const safeTop = Math.max(
    viewport.top + VIEWPORT_GUTTER,
    (boundary?.top ?? viewport.top) + BOUNDARY_GUTTER,
  );
  const safeBottom = Math.min(
    viewport.bottom - VIEWPORT_GUTTER,
    (boundary?.bottom ?? viewport.bottom) - BOUNDARY_GUTTER,
  );
  const spaceBelow = Math.max(0, safeBottom - trigger.bottom - MENU_GAP);
  const spaceAbove = Math.max(0, trigger.top - MENU_GAP - safeTop);
  const openUpwards = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
  const availableHeight = openUpwards ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(
    MIN_MENU_HEIGHT,
    Math.min(MAX_MENU_HEIGHT, availableHeight || MIN_MENU_HEIGHT),
  );
  const renderedHeight = Math.min(estimatedHeight || MIN_MENU_HEIGHT, maxHeight);
  const desiredTop = openUpwards
    ? trigger.top - MENU_GAP - renderedHeight
    : trigger.bottom + MENU_GAP;
  const latestTop = Math.max(safeTop, safeBottom - renderedHeight);
  const top = Math.min(Math.max(desiredTop, safeTop), latestTop);
  const availableWidth = Math.max(0, viewport.right - viewport.left - VIEWPORT_GUTTER * 2);
  const width = Math.min(trigger.width, availableWidth);
  const left = Math.min(
    Math.max(trigger.left, viewport.left + VIEWPORT_GUTTER),
    viewport.right - VIEWPORT_GUTTER - width,
  );

  return { top, left, width, maxHeight, openUpwards };
}
