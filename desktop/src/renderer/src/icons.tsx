/** Inline stroke icons from the design canvas (decorative; buttons carry their own labels). */

import type { ReactNode } from "react";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function PlayIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SnoozeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 3.5v4.5H16" />
      <path d="M12 8v4.5l3 1.8" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </svg>
  );
}

export function PowerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M12 3v9" />
      <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={2.4} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Progress ring: `fraction` of the circle (0..1) drawn clockwise from the top. */
export function Ring({
  size,
  width,
  fraction,
  color,
  children,
}: {
  size: number;
  width: number;
  fraction: number;
  color: string;
  children?: ReactNode;
}) {
  const c = size / 2;
  const r = c - width;
  const length = 2 * Math.PI * r;
  const drawn = Math.max(0, Math.min(1, fraction)) * length;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ flex: "none" }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={width} />
      {drawn > 0 && (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={`${drawn} ${length}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      )}
      {children}
    </svg>
  );
}
