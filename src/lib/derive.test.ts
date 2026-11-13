import { describe, expect, it } from 'vitest';
import { accountBalance, entries, monthStats } from './derive';
import { allocate, splitWithFriend, owedShares } from './splits';
import type { AppState, GroupExpense, Tx } from './types';

const state = (txs: Tx[]): AppState => ({
  v: 1,
  accounts: [{ id: 'a', name: 'Cash', kind: 'cash', openingPaise: 100000, color: '#000' }],
  txs,
  budgets: {},
  goals: [],
  recurring: [],
  groups: [],
  meIds: {},
  settings: { userName: 'R', includeGroupShare: true, cloudUrl: '', cloudKey: '', upiId: '', reminderOn: true, reminderTime: '21:00', reminderDoneDate: '' },
});

let n = 0;
const tx = (o: Partial<Tx>): Tx => ({
  id: `t${n++}`,
  type: 'expense',
  amountPaise: 0,
  category: 'Food',
  accountId: 'a',
  date: '2026-11-10',
  note: '',
  necessary: true,
  createdAt: 1,
  ...o,
});

const stats = (s: AppState) => monthStats(entries(s), '2026-11');

describe('split expenses: only my share counts as spending', () => {
  const dinner = tx({ amountPaise: 50000, sharedPaise: 25000, khata: { groupId: 'g', expenseId: 'e' } });

  it('I paid 500, friend owes 250: spending 250, account down by the full 500', () => {
    const s = state([dinner]);
    expect(stats(s).spent).toBe(25000);
    expect(accountBalance(s, 'a')).toBe(100000 - 50000);
  });

  it('friend pays back 250 into my account: balance recovers, spending and income are unchanged', () => {
    const payback = tx({
      type: 'income',
      amountPaise: 25000,
      category: 'Khata',
      internal: true,
      khata: { groupId: 'g', paymentId: 'p' },
    });
    const s = state([dinner, payback]);
    const st = stats(s);
    expect(st.spent).toBe(25000);
    expect(st.income).toBe(0);
    expect(accountBalance(s, 'a')).toBe(100000 - 50000 + 25000);
  });

  it('paying a friend back moves money out of the account but is not spending', () => {
    const payOut = tx({ amountPaise: 10000, category: 'Khata', internal: true });
    const s = state([payOut]);
    expect(stats(s).spent).toBe(0);
    expect(accountBalance(s, 'a')).toBe(90000);
  });

  it('an expense the friend fully owes counts as 0 spending', () => {
    const s = state([tx({ amountPaise: 30000, sharedPaise: 30000 })]);
    expect(stats(s).spent).toBe(0);
    expect(accountBalance(s, 'a')).toBe(70000);
  });

  it('category and needed totals use only my share', () => {
    const s = state([tx({ amountPaise: 40000, sharedPaise: 10000, necessary: false })]);
    const st = stats(s);
    expect(st.byCategory.Food).toBe(30000);
    expect(st.unnecessary).toBe(30000);
    expect(st.necessary).toBe(0);
  });
});

describe('splitWithFriend', () => {
  const owes = (paise: number, share: number) => {
    const p = splitWithFriend(paise, share, 'me', 'them');
    const e: GroupExpense = {
      id: 'x', title: 't', category: 'Food', date: '2026-11-10', amountPaise: paise,
      paidBy: p.paidBy, splitType: p.splitType, weights: p.weights, updatedAt: 1,
    };
    return owedShares(e);
  };

  it('half of 500', () => {
    expect(owes(50000, 25000)).toEqual({ them: 25000, me: 25000 });
  });
  it('friend owes all of it', () => {
    expect(owes(30000, 30000)).toEqual({ them: 30000 });
  });
  it('odd paise: friend gets the floor half, I keep the extra paisa, nothing is lost', () => {
    const r = owes(10001, Math.floor(10001 / 2));
    expect(r.them).toBe(5000);
    expect(r.me).toBe(5001);
    expect((r.them ?? 0) + (r.me ?? 0)).toBe(10001);
  });
  it('never lets the friend share go above the amount or below zero', () => {
    expect(owes(1000, 99999)).toEqual({ them: 1000 });
    expect(owes(1000, -5)).toEqual({ me: 1000, them: 0 });
  });
  it('allocate still adds up (regression)', () => {
    const r = allocate(10001, { a: 1, b: 1 });
    expect(r.a + r.b).toBe(10001);
  });
});
