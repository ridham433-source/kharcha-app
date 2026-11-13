import { describe, expect, it } from 'vitest';
import { nextDate, occurrences } from './recurring';
import { looksLikeUpi, minutesOf, reminderDue, reminderIcs, upiLink, buildReport } from './report';
import type { Entry } from './derive';

describe('occurrences', () => {
  it('monthly: adds every missed month once', () => {
    expect(occurrences({ repeat: 'monthly', startDate: '2026-08-05' }, '2026-11-13')).toEqual([
      '2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05',
    ]);
  });
  it('does not add anything before the first date or twice', () => {
    expect(occurrences({ repeat: 'monthly', startDate: '2026-11-20' }, '2026-11-13')).toEqual([]);
    expect(occurrences({ repeat: 'monthly', startDate: '2026-08-05', lastDate: '2026-11-13' }, '2026-11-13')).toEqual([]);
  });
  it('monthly on the 31st uses the last day of short months', () => {
    expect(occurrences({ repeat: 'monthly', startDate: '2026-01-31' }, '2026-03-31')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31',
    ]);
  });
  it('weekly steps by 7 days', () => {
    expect(occurrences({ repeat: 'weekly', startDate: '2026-11-01' }, '2026-11-20')).toEqual([
      '2026-11-01', '2026-11-08', '2026-11-15',
    ]);
  });
  it('yearly', () => {
    expect(occurrences({ repeat: 'yearly', startDate: '2024-02-29' }, '2026-03-01')).toEqual([
      '2024-02-29', '2025-02-28', '2026-02-28',
    ]);
  });
  it('nextDate looks ahead', () => {
    expect(nextDate({ repeat: 'monthly', startDate: '2026-08-05', lastDate: '2026-11-13' }, '2026-11-13')).toBe('2026-12-05');
  });
});

describe('reminder and upi', () => {
  const base = { on: true, time: '21:00', doneDate: '', hasEntryToday: false, todayStr: '2026-11-13' };
  it('shows only after the time, when nothing added and not dismissed', () => {
    expect(reminderDue({ ...base, nowMinutes: minutesOf('20:59') })).toBe(false);
    expect(reminderDue({ ...base, nowMinutes: minutesOf('21:00') })).toBe(true);
    expect(reminderDue({ ...base, nowMinutes: 1300, hasEntryToday: true })).toBe(false);
    expect(reminderDue({ ...base, nowMinutes: 1300, doneDate: '2026-11-13' })).toBe(false);
    expect(reminderDue({ ...base, nowMinutes: 1300, on: false })).toBe(false);
  });
  it('builds a daily calendar alarm', () => {
    const ics = reminderIcs('21:30');
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics).toContain('T213000');
    expect(ics).toContain('BEGIN:VALARM');
  });
  it('builds a upi link with the amount', () => {
    const l = upiLink({ upi: 'neel@okaxis', name: 'Neel Shah', paise: 25050, note: 'Kharcha' });
    expect(l).toBe('upi://pay?pa=neel%40okaxis&pn=Neel%20Shah&am=250.50&cu=INR&tn=Kharcha');
    expect(looksLikeUpi('neel@okaxis')).toBe(true);
    expect(looksLikeUpi('9876543210')).toBe(false);
  });
});

describe('report card', () => {
  const e = (date: string, paise: number, category = 'Food'): Entry => ({
    id: date + paise, type: 'expense', amountPaise: paise, category, accountId: null, date,
    note: category, necessary: true, at: 0, counted: paise,
  });
  it('compares with last month and finds the top category', () => {
    const all = [e('2026-10-03', 100000), e('2026-11-02', 50000, 'Food'), e('2026-11-04', 25000, 'Rent')];
    const r = buildReport(all, '2026-11', 100000, '2026-11-13');
    expect(r.spent).toBe(75000);
    expect(r.changePct).toBe(-25);
    expect(r.headline).toBe('You spent 25% less than last month.');
    expect(r.topCategory?.name).toBe('Food');
    expect(r.budgetUsedPct).toBe(75);
    expect(r.noSpendDays).toBe(11);
  });
});
