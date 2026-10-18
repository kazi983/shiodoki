import { useEffect, useState } from "react";
import { t } from "@shared/i18n";
import type { LeaveInfo } from "@shared/ipc";
import { WARNING_LEAD_MINUTES, formatHHMM } from "@shared/leave";
import { formatDuration } from "@shared/task";
import { alertError } from "../errors";
import { CheckIcon, Ring } from "../icons";
import { formatCountdown, useNow } from "../useNow";

/**
 * warning: 5 minutes before the stop time (dismissible); leave a note on the running task
 * block:   stop time reached (cannot be closed; exit the app to leave), with today's work
 */
export function LeavePage({ mode }: { mode: "warning" | "block" }) {
  const [info, setInfo] = useState<LeaveInfo | null>(null);

  useEffect(() => {
    document.title = "Shiodoki";
    void window.api.leave.getState().then(setInfo);
  }, []);

  return mode === "warning" ? <LeaveWarning info={info} /> : <LeaveBlock info={info} />;
}

function LeaveWarning({ info }: { info: LeaveInfo | null }) {
  const now = useNow(1000);
  const [memo, setMemo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const task = info?.task ?? null;
  const memoValue = memo ?? task?.memo ?? "";
  const text = t().leave;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) void window.api.leave.dismissWarning();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stopAt = info?.schedule ? new Date(info.schedule.stopAt) : null;
  const remaining = stopAt ? Math.max(0, stopAt.getTime() - now.getTime()) : 0;

  async function saveAndContinue() {
    if (busy) return;
    setBusy(true);
    try {
      if (task && memoValue.trim() !== task.memo) {
        await window.api.tasks.update(task.id, { name: task.name, priority: task.priority, memo: memoValue });
      }
      await window.api.leave.dismissWarning();
    } catch (error) {
      await alertError(error);
      setBusy(false);
    }
  }

  return (
    <main className="leave warning">
      <div className="warning-body">
        <Ring size={200} width={10} fraction={remaining / (WARNING_LEAD_MINUTES * 60_000)} color="var(--warn)">
          <text
            x="100"
            y="108"
            textAnchor="middle"
            fontFamily="IBM Plex Mono, monospace"
            fontSize="44"
            fontWeight="600"
            fill="var(--text-strong)"
          >
            {formatCountdown(remaining)}
          </text>
          {stopAt && (
            <text x="100" y="138" textAnchor="middle" fontSize="13" fill="var(--sub)">
              {text.stopAt(formatHHMM(stopAt))}
            </text>
          )}
        </Ring>
        <div className="warning-main">
          <div>
            <h1>{text.warningTitle(WARNING_LEAD_MINUTES)}</h1>
            <p className="sub">{task ? text.working(task.name) : text.prepare}</p>
          </div>
          {task && (
            <label>
              {text.memoLabel}
              <textarea
                className="field"
                rows={3}
                value={memoValue}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={text.memoPlaceholder}
                autoFocus
              />
            </label>
          )}
          <div className="warning-actions">
            {task && (
              <button type="button" className="btn btn-primary" onClick={() => void saveAndContinue()} disabled={busy}>
                {text.saveAndContinue}
              </button>
            )}
            <button
              type="button"
              className={task ? "btn btn-outline" : "btn btn-primary"}
              onClick={() => void window.api.leave.dismissWarning()}
              autoFocus={!task}
            >
              {text.close(
                <span key="kbd" className="kbd">
                  Esc
                </span>,
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function LeaveBlock({ info }: { info: LeaveInfo | null }) {
  const today = info?.today;
  const max = Math.max(1, ...(today?.tasks.map((t) => t.minutes) ?? []));
  const { common, leave: text } = t();

  const exitApp = async () => {
    if (await window.api.dialog.confirm(common.quit, common.quitConfirm)) await window.api.nav.exit();
  };

  return (
    <main className="leave block">
      <div className="block-body">
        <header className="block-header">
          <div>
            {info?.schedule && (
              <p className="block-time">{text.blockTime(formatHHMM(new Date(info.schedule.stopAt)))}</p>
            )}
            <h1>{text.blockTitle}</h1>
            <p className="sub">{text.blockSub}</p>
          </div>
          {today && (
            <div className="block-stats">
              <div className="block-stat">
                <span className="mono">{formatDuration(today.totalMinutes, "0m")}</span>
                <span>{text.todayTotal}</span>
              </div>
              <div className="block-stat">
                <span className="mono">{today.sessionCount}</span>
                <span>{common.sessions}</span>
              </div>
            </div>
          )}
        </header>

        <section className="today scroll" aria-label={text.todayByTask}>
          {today && today.tasks.length === 0 && <p className="today-empty">{text.todayEmpty}</p>}
          {today?.tasks.map((t) => (
            <div key={t.taskId} className="today-row">
              <span className="ellipsis" title={t.taskName}>
                {t.taskName}
              </span>
              <span className="today-bar">
                <span style={{ width: `${Math.round((t.minutes / max) * 100)}%` }} />
              </span>
              <span className="today-time">{formatDuration(t.minutes, "0m")}</span>
            </div>
          ))}
        </section>

        <footer className="block-footer">
          <CheckIcon size={14} />
          {text.allRecorded}
          <button type="button" className="link-btn" onClick={() => void exitApp()}>
            {text.quitApp}
          </button>
        </footer>
      </div>
    </main>
  );
}
