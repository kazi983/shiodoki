import { useEffect, useState } from "react";
import { t } from "@shared/i18n";
import type { SyncInfo } from "@shared/sync";

/** Sync status (requirements D-06). Refreshes whenever tasks change. */
export function SyncBadge() {
  const [info, setInfo] = useState<SyncInfo | null>(null);

  useEffect(() => {
    const load = () => void window.api.sync.get().then(setInfo);
    load();
    return window.api.tasks.onChanged(load);
  }, []);

  if (!info) return null;
  const label = t().sync[info.status];
  return (
    <span className={`sync-badge sync-${info.status}`} title={info.email ? `${label.title}\n${info.email}` : label.title}>
      <span className="sync-dot" aria-hidden />
      {label.text}
    </span>
  );
}
