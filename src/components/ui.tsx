import { useEffect, type ReactNode } from 'react';
import { back } from '../lib/router';

export type IconName =
  | 'home'
  | 'list'
  | 'chart'
  | 'split'
  | 'plus'
  | 'back'
  | 'chev'
  | 'close'
  | 'check'
  | 'trash'
  | 'share'
  | 'copy'
  | 'user'
  | 'backspace'
  | 'link'
  | 'search'
  | 'edit';

const PATHS: Record<IconName, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  split: 'M4 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0M10 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  chev: 'M9 18l6-6-6-6',
  close: 'M18 6L6 18M6 6l12 12',
  check: 'M5 13l4 4L19 7',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  user: 'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z',
  backspace: 'M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM17 9l-4 6M13 9l4 6',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM21 21l-5-5',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
};

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function TopBar({
  title,
  onBack,
  showBack = true,
  right,
}: {
  title: ReactNode;
  onBack?: () => void;
  showBack?: boolean;
  right?: ReactNode;
}) {
  return (
    <div className="topbar">
      {showBack && (
        <button className="icon-btn" aria-label="Go back" onClick={onBack ?? (() => back())}>
          <Icon name="back" />
        </button>
      )}
      <h2 className="ellipsis">{title}</h2>
      {right}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn plain" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  lemon,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  lemon?: boolean;
}) {
  return (
    <div className={`seg${lemon ? ' lemon' : ''}`}>
      {options.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const AVATAR_COLORS = ['#FFD60A', '#9EE6C0', '#B7C4FF', '#FFB4A8', '#F6C0FF', '#9FE3F0', '#FFCF8B'];

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: AVATAR_COLORS[h % AVATAR_COLORS.length],
      }}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function Empty({
  emoji,
  title,
  text,
  action,
}: {
  emoji: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="big">{emoji}</div>
      <h3>{title}</h3>
      {text && <p className="muted" style={{ margin: '0 0 16px' }}>{text}</p>}
      {action}
    </div>
  );
}

export function MonthSwitch({
  label,
  onPrev,
  onNext,
  nextDisabled,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div className="month-switch">
      <button className="icon-btn" aria-label="Previous month" onClick={onPrev}>
        <Icon name="back" />
      </button>
      <h2>{label}</h2>
      <button className="icon-btn" aria-label="Next month" onClick={onNext} disabled={nextDisabled}>
        <Icon name="chev" />
      </button>
    </div>
  );
}
