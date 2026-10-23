import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { t } from "@shared/i18n";
import type { RunningInfo } from "@shared/ipc";
import { formatHHMM } from "@shared/leave";
import { CheckIcon, Ring } from "../icons";
import { formatCountdown, useNow } from "../useNow";

/** The ring turns orange in the last 5 minutes. */
const WARN_MS = 5 * 60_000;
/** Movement below this is a click (complete), above it a drag. */
const DRAG_THRESHOLD_PX = 4;

/**
 * Always-on-top tab on the right edge while a session runs: a ring with the
 * minutes left. On hover it expands to show the task and a complete button.
 * Dragging moves it up or down; it stays on the right edge.
 */
export function OverlayPage() {
  const [expanded, setExpanded] = useState(false);
  const [info, setInfo] = useState<RunningInfo | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; moving: boolean } | null>(null);
  /** The click that follows a drag must not complete the session. */
  const suppressClick = useRef(false);
  const now = useNow(1000);

  const load = useCallback(() => void window.api.overlay.getState().then(setInfo), []);

  useEffect(() => {
    document.title = "Shiodoki";
    load();
    return window.api.overlay.onRefresh(() => {
      setExpanded(false);
      load();
    });
  }, [load]);

  function setHover(next: boolean) {
    // The window follows the cursor while dragging, so ignore enter/leave until it ends.
    if (drag.current?.moving) return;
    setExpanded(next);
    void window.api.overlay.setExpanded(next);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    suppressClick.current = false;
    drag.current = { startY: e.screenY, moving: false };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    if (!d.moving) {
      if (Math.abs(e.screenY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.moving = true;
      // Keep receiving moves even if the cursor gets ahead of the window. Only once dragging:
      // a captured pointer sends the click to this div instead of the button under it.
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      void window.api.overlay.dragStart();
    }
    void window.api.overlay.dragMove();
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d?.moving) return;
    setDragging(false);
    void window.api.overlay.dragEnd();
    suppressClick.current = true;
    const inside = e.clientX >= 0 && e.clientY >= 0 && e.clientX < window.innerWidth && e.clientY < window.innerHeight;
    if (!inside) setHover(false);
  }

  function complete() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    void window.api.overlay.complete();
  }

  const endsAt = info ? new Date(info.endsAt).getTime() : 0;
  const total = info ? endsAt - new Date(info.startedAt).getTime() : 1;
  const remaining = Math.max(0, endsAt - now.getTime());
  const warn = remaining <= Math.min(WARN_MS, total / 6);
  const color = warn ? "var(--warn)" : "var(--accent)";
  const minutesLeft = Math.ceil(remaining / 60_000);
  const text = t().overlay;

  const ring = (
    <Ring size={44} width={4} fraction={total > 0 ? remaining / total : 0} color={color}>
      <text
        x="22"
        y="27"
        textAnchor="middle"
        fontFamily="IBM Plex Mono, monospace"
        fontSize="14"
        fontWeight="600"
        fill={warn ? "var(--warn-text)" : "var(--text-strong)"}
      >
        {minutesLeft}
      </text>
    </Ring>
  );

  return (
    <div
      className={dragging ? "overlay-root dragging" : "overlay-root"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {expanded ? (
        <div className="overlay-panel">
          <div className="overlay-info">
            {ring}
            <div className="overlay-text">
              <span className="overlay-task ellipsis" title={info?.taskName}>
                {info?.taskName ?? ""}
              </span>
              <span className="overlay-sub">
                {text.remaining(
                  <span key="countdown" className="mono">
                    {formatCountdown(remaining)}
                  </span>,
                  info?.stopAt ? formatHHMM(new Date(info.stopAt)) : null,
                )}
              </span>
            </div>
          </div>
          <button type="button" className="btn btn-primary overlay-complete" onClick={complete}>
            <CheckIcon />
            {text.completeAndPick}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="overlay-tab"
          onClick={complete}
          aria-label={text.tabAria(minutesLeft)}
          title={text.tabTitle}
        >
          {ring}
        </button>
      )}
    </div>
  );
}
