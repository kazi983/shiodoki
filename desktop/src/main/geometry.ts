export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Center a window of the requested size in the work area, shrinking it to fit (95% max). */
export function centeredBounds(display: { workArea: Rect }, width: number, height: number): Rect {
  const { workArea } = display;
  const w = Math.min(width, Math.floor(workArea.width * 0.95));
  const h = Math.min(height, Math.floor(workArea.height * 0.95));
  return {
    x: workArea.x + Math.round((workArea.width - w) / 2),
    y: workArea.y + Math.round((workArea.height - h) / 2),
    width: w,
    height: h,
  };
}

/**
 * Overlay offset from the top of the work area, kept so a window of `height` (the expanded
 * panel) still fits below it. `offset` is null until the user drags the tab: then it sits at 20%.
 */
export function clampOverlayOffset(workArea: Rect, offset: number | null, height: number): number {
  const y = offset ?? Math.round(workArea.height * 0.2);
  return Math.min(Math.max(y, 0), workArea.height - height);
}
