import { useEffect, useState } from "react";

/** Small always-on-top tab on the right edge while a session runs. Click = complete. */
export function OverlayPage() {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    document.title = "30min Task Timer";
  }, []);

  function setHover(next: boolean) {
    setExpanded(next);
    void window.api.overlay.setExpanded(next);
  }

  return (
    <button
      className={`overlay ${expanded ? "expanded" : ""}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => void window.api.overlay.complete()}
      title="セッションを完了してタスクを選ぶ"
    >
      {expanded ? "完了 ▶" : "▶"}
    </button>
  );
}
