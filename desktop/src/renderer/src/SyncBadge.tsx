import { useEffect, useState } from "react";
import type { SyncInfo } from "@shared/sync";

const LABEL: Record<SyncInfo["status"], { text: string; title: string }> = {
  local: { text: "💻 この PC のみ", title: "データはこの PC にだけ保存されています" },
  synced: { text: "☁ 同期済み", title: "すべての変更が保存されています" },
  pending: { text: "⏳ 送信待ち", title: "未送信の変更があります。オンラインになると自動で送信されます" },
  offline: { text: "⚠ オフライン", title: "オフラインです。変更はこの PC に保存され、オンラインになると自動で送信されます" },
};

/** Sync status (requirements D-06). Refreshes whenever tasks change. */
export function SyncBadge({ tone }: { tone: "dark" | "light" }) {
  const [info, setInfo] = useState<SyncInfo | null>(null);

  useEffect(() => {
    const load = () => void window.api.sync.get().then(setInfo);
    load();
    return window.api.tasks.onChanged(load);
  }, []);

  if (!info) return null;
  const label = LABEL[info.status];
  return (
    <span className={`sync-badge sync-${info.status} ${tone}`} title={info.email ? `${label.title}\n${info.email}` : label.title}>
      {label.text}
    </span>
  );
}
