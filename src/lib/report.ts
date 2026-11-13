import type { Entry } from './derive';
import { monthStats } from './derive';
import { daysInMonth, monthLabel, shiftMonth, today, monthKey } from './util';
import { fmt } from './money';

export interface Report {
  key: string;
  label: string;
  spent: number;
  income: number;
  saved: number;
  prevSpent: number;
  /** % change vs last month, null when last month had no spending */
  changePct: number | null;
  topCategory?: { name: string; paise: number; pct: number };
  biggest?: { note: string; paise: number; date: string };
  perDay: number;
  noSpendDays: number;
  skippablePaise: number;
  budget: number;
  budgetUsedPct: number | null;
  headline: string;
  tip: string;
  hasData: boolean;
  entries: number;
}

export function buildReport(all: Entry[], key: string, budget: number, now = today()): Report {
  const st = monthStats(all, key);
  const prev = monthStats(all, shiftMonth(key, -1));
  const days = daysInMonth(key);
  const isNow = key === monthKey(now);
  const daysPassed = isNow ? Number(now.slice(8, 10)) : days;

  const cats = Object.entries(st.byCategory).sort((a, b) => b[1] - a[1]);
  const top = cats[0];
  const big = st.biggest[0];
  const noSpendDays = st.daily.slice(0, daysPassed).filter((x) => x === 0).length;
  const changePct = prev.spent > 0 ? Math.round(((st.spent - prev.spent) / prev.spent) * 100) : null;
  const budgetUsedPct = budget > 0 ? Math.round((st.spent / budget) * 100) : null;

  let headline: string;
  if (st.spent === 0) headline = 'No spending recorded yet.';
  else if (changePct === null) headline = `You spent ${fmt(st.spent)} in ${monthLabel(key)}.`;
  else if (changePct < 0) headline = `You spent ${Math.abs(changePct)}% less than last month.`;
  else if (changePct > 0) headline = `You spent ${changePct}% more than last month.`;
  else headline = 'You spent the same as last month.';

  let tip = 'Keep adding expenses daily to see clearer patterns.';
  if (budgetUsedPct !== null && budgetUsedPct > 100) tip = `You went ${fmt(st.spent - budget)} over your budget. Try a lower limit on ${top?.[0] ?? 'your biggest category'} next month.`;
  else if (st.unnecessary > 0 && st.unnecessary * 5 >= st.spent) tip = `${fmt(st.unnecessary)} was marked "Could skip". Cutting half of that saves ${fmt(Math.round(st.unnecessary / 2))}.`;
  else if (top && st.spent > 0 && top[1] / st.spent >= 0.4) tip = `${top[0]} is ${Math.round((top[1] / st.spent) * 100)}% of your spending. A small cut there makes the biggest difference.`;
  else if (noSpendDays >= 5) tip = `${noSpendDays} no-spend days. Nice. Try to beat that next month.`;

  return {
    key,
    label: monthLabel(key),
    spent: st.spent,
    income: st.income,
    saved: st.income - st.spent,
    prevSpent: prev.spent,
    changePct,
    topCategory: top ? { name: top[0], paise: top[1], pct: Math.round((top[1] / st.spent) * 100) } : undefined,
    biggest: big ? { note: big.note || big.category, paise: big.counted, date: big.date } : undefined,
    perDay: Math.round(st.spent / Math.max(daysPassed, 1)),
    noSpendDays,
    skippablePaise: st.unnecessary,
    budget,
    budgetUsedPct,
    headline,
    tip,
    hasData: st.count > 0,
    entries: st.count,
  };
}

export function reportText(r: Report): string {
  const lines = [`My ${r.label} money report (Kharcha)`, r.headline, `Spent: ${fmt(r.spent)}`];
  if (r.income > 0) lines.push(`Income: ${fmt(r.income)}`);
  if (r.topCategory) lines.push(`Top category: ${r.topCategory.name} ${fmt(r.topCategory.paise)} (${r.topCategory.pct}%)`);
  lines.push(`Average per day: ${fmt(r.perDay)}`, `No-spend days: ${r.noSpendDays}`);
  if (r.budgetUsedPct !== null) lines.push(`Budget used: ${r.budgetUsedPct}% of ${fmt(r.budget)}`);
  return lines.join('\n');
}

/** Minutes from "HH:MM". */
export const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Should the "add today's expenses" prompt show right now? */
export function reminderDue(opts: {
  on: boolean;
  time: string;
  doneDate: string;
  hasEntryToday: boolean;
  nowMinutes: number;
  todayStr: string;
}): boolean {
  if (!opts.on) return false;
  if (opts.doneDate === opts.todayStr) return false;
  if (opts.hasEntryToday) return false;
  return opts.nowMinutes >= minutesOf(opts.time);
}

/** Calendar file with a daily repeating alarm. Opens in the phone's calendar app. */
export function reminderIcs(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(h)}${p(m)}00`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kharcha//EN',
    'BEGIN:VEVENT',
    `UID:kharcha-daily-${Date.now()}@kharcha`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${stamp}`,
    'DURATION:PT15M',
    'RRULE:FREQ=DAILY',
    'SUMMARY:Add today\'s expenses in Kharcha',
    'DESCRIPTION:Open Kharcha and write down what you spent today.',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Add today\'s expenses in Kharcha',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function upiLink(opts: { upi: string; name: string; paise: number; note: string }): string {
  return `upi://pay?pa=${encodeURIComponent(opts.upi.trim())}&pn=${encodeURIComponent(opts.name)}&am=${(opts.paise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(opts.note)}`;
}

export const looksLikeUpi = (v: string): boolean => /^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(v.trim());
