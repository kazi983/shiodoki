import { useCallback, useEffect, useState } from "react";
import type { RunningInfo } from "@shared/ipc";
import { formatHHMM } from "@shared/leave";
import { CheckIcon, Ring } from "../icons";
import { formatCountdown, useNow } from "../useNow";

/** The ring turns orange in the last 5 minutes. */
const WARN_MS = 5 * 60_000;

/**
 * Always-on-top tab on the right edge while a session runs: a ring with the
 * minutes left. On hover it expands to show the task and a complete button.
 */
export function OverlayPage() {
  const [expanded, setExpanded] = useState(false);
  const [info, setInfo] = useState<RunningInfo | null>(null);
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
    setExpanded(next);
    void window.api.overlay.setExpanded(next);
  }

  const complete = () => void window.api.overlay.complete();

  const endsAt = info ? new Date(info.endsAt).getTime() : 0;
  const total = info ? endsAt - new Date(info.startedAt).getTime() : 1;
  const remaining = Math.max(0, endsAt - now.getTime());
  const warn = remaining <= Math.min(WARN_MS, total / 6);
  const color = warn ? "var(--warn)" : "var(--accent)";
  const minutesLeft = Math.ceil(remaining / 60_000);

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
    <div className="overlay-root" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {expanded ? (
        <div className="overlay-panel">
          <div className="overlay-info">
            {ring}
            <div className="overlay-text">
              <span className="overlay-task ellipsis" title={info?.taskName}>
                {info?.taskName ?? ""}
              </span>
              <span className="overlay-sub">
                残り <span className="mono">{formatCountdown(remaining)}</span>
                {info?.stopAt && ` · ${formatHHMM(new Date(info.stopAt))} に作業終了`}
              </span>
            </div>
          </div>
          <button type="button" className="btn btn-primary overlay-complete" onClick={complete}>
            <CheckIcon />
            完了して次を選ぶ
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="overlay-tab"
          onClick={complete}
          aria-label={`残り${minutesLeft}分。クリックでセッションを完了`}
          title="セッションを完了してタスクを選ぶ"
        >
          {ring}
        </button>
      )}
    </div>
  );
}
