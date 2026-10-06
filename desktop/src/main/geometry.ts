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
