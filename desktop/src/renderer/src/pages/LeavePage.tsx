import { useEffect } from "react";

/**
 * warning: 5 minutes before the stop time (dismissible)
 * block:   stop time reached (cannot be closed; exit the app to leave)
 */
export function LeavePage({ mode }: { mode: "warning" | "block" }) {
  const warning = mode === "warning";

  useEffect(() => {
    document.title = "30min Task Timer";
    if (!warning) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void window.api.leave.dismissWarning();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [warning]);

  const exitApp = async () => {
    if (await window.api.dialog.confirm("終了", "アプリを終了しますか？")) await window.api.nav.exit();
  };

  return (
    <main className={`leave ${mode}`}>
      <h1>{warning ? "あと5分で作業終了です" : "作業終了です"}</h1>
      <p className="sub">{warning ? "保存や中断準備をしてください" : "PCを休止状態にして席を立ちましょう"}</p>
      {warning ? (
        <button className="btn btn-primary btn-large" autoFocus onClick={() => void window.api.leave.dismissWarning()}>
          OK
        </button>
      ) : (
        <button className="btn btn-secondary" onClick={() => void exitApp()}>
          アプリを終了
        </button>
      )}
    </main>
  );
}
