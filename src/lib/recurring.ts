import type { Recurring } from './types';
import { daysInMonth } from './util';

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (d: string) => d.split('-').map(Number) as [number, number, number];

/** All dates this rule falls on, from its first date up to `upTo`, that have not been added yet. */
export function occurrences(r: Pick<Recurring, 'repeat' | 'startDate' | 'lastDate'>, upTo: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = parts(r.startDate);
  const after = r.lastDate ?? '';
  const push = (d: string) => {
    if (d >= r.startDate && d <= upTo && d > after) out.push(d);
  };

  if (r.repeat === 'weekly') {
    const d = new Date(sy, sm - 1, sd);
    while (true) {
      const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      if (s > upTo || out.length > 400) break;
      push(s);
      d.setDate(d.getDate() + 7);
    }
    return out;
  }

  const [uy, um] = parts(upTo);
  if (r.repeat === 'monthly') {
    let y = sy;
    let m = sm;
    while (y < uy || (y === uy && m <= um)) {
      const key = `${y}-${pad(m)}`;
      push(`${key}-${pad(Math.min(sd, daysInMonth(key)))}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
      if (out.length > 400) break;
    }
    return out;
  }

  for (let y = sy; y <= uy; y++) {
    const key = `${y}-${pad(sm)}`;
    push(`${key}-${pad(Math.min(sd, daysInMonth(key)))}`);
  }
  return out;
}

/** The next date on or after `from` that this rule has not added yet. */
export function nextDate(r: Pick<Recurring, 'repeat' | 'startDate' | 'lastDate'>, from: string): string {
  const [y, m, d] = parts(from);
  const far = `${y + 2}-${pad(m)}-${pad(d)}`;
  return occurrences(r, far).find((x) => x >= from) ?? r.startDate;
}

export const repeatLabel = (r: Pick<Recurring, 'repeat' | 'startDate'>): string => {
  const [y, m, d] = parts(r.startDate);
  if (r.repeat === 'weekly')
    return `Every ${new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long' })}`;
  if (r.repeat === 'yearly')
    return `Every year on ${new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  return `Every month on the ${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;
};
