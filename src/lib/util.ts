import type { Group } from './types';

/** Where a group lives in the app: trips in Splitter, friend ledgers in Khata. */
export const groupPath = (g?: Pick<Group, 'id' | 'kind'>): string =>
  !g ? '/splitter' : g.kind === 'friend' ? `/khata/${g.id}` : `/splitter/${g.id}`;

/** Opens the phone's share sheet, or WhatsApp when there is none. */
export async function shareText(text: string) {
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({ text });
    } catch {
      /* cancelled */
    }
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** 10 characters from a 32-letter alphabet = about 50 bits, hard to guess. */
export function makeCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Today as YYYY-MM-DD in the phone's local time zone. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const monthKey = (date: string): string => date.slice(0, 7);

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function dayLabel(date: string): string {
  const t = today();
  if (date === t) return 'Today';
  const [y, m, d] = date.split('-').map(Number);
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yKey = `${yest.getFullYear()}-${pad(yest.getMonth() + 1)}-${pad(yest.getDate())}`;
  if (date === yKey) return 'Yesterday';
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function download(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
