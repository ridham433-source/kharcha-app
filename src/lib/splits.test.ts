import { describe, expect, it } from 'vitest';
import { allocate, netBalances, owedShares, settleUp, groupTotals, friendBalance, friendSummary, otherMember } from './splits';
import { fmt, parseAmount } from './money';
import type { Group, GroupExpense } from './types';

const sum = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0);

const member = (id: string) => ({ id, name: id.toUpperCase(), updatedAt: 1 });

function group(expenses: GroupExpense[], payments: Group['payments'] = []): Group {
  return {
    id: 'g',
    name: 'Trip',
    emoji: '🏖️',
    createdAt: 1,
    metaUpdatedAt: 1,
    updatedAt: 1,
    members: ['a', 'b', 'c', 'd'].map(member),
    expenses,
    payments,
  };
}

const exp = (over: Partial<GroupExpense>): GroupExpense => ({
  id: Math.random().toString(36),
  title: 't',
  category: 'Food',
  date: '2026-11-01',
  amountPaise: 0,
  paidBy: {},
  splitType: 'equal',
  weights: {},
  updatedAt: 1,
  ...over,
});

describe('money', () => {
  it('formats with Indian grouping', () => {
    expect(fmt(10000000)).toBe('₹1,00,000');
    expect(fmt(1234567)).toBe('₹12,345.67');
    expect(fmt(-5000)).toBe('-₹50');
  });
  it('parses amounts', () => {
    expect(parseAmount('1,234.5')).toBe(123450);
    expect(parseAmount('19.99')).toBe(1999);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('1.234')).toBeNull();
  });
});

describe('allocate', () => {
  it('always adds up to the total', () => {
    for (const total of [100, 101, 9999, 1, 33333]) {
      const r = allocate(total, { a: 1, b: 1, c: 1 });
      expect(sum(r)).toBe(total);
    }
  });
  it('splits by weights', () => {
    expect(allocate(1000, { a: 3, b: 1 })).toEqual({ a: 750, b: 250 });
  });
  it('gives zero to members with zero weight', () => {
    expect(allocate(500, { a: 1, b: 0 })).toEqual({ a: 500, b: 0 });
  });
});

describe('owedShares', () => {
  it('splits equally among chosen members only (A to F out of A to Q idea)', () => {
    const e = exp({ amountPaise: 1000, paidBy: { a: 1000 }, weights: { a: 1, b: 1 } });
    expect(owedShares(e)).toEqual({ a: 500, b: 500 });
  });
  it('uses exact amounts when they add up', () => {
    const e = exp({ splitType: 'exact', amountPaise: 1000, weights: { a: 700, b: 300 } });
    expect(owedShares(e)).toEqual({ a: 700, b: 300 });
  });
  it('handles percentages', () => {
    const e = exp({ splitType: 'percent', amountPaise: 1000, weights: { a: 25, b: 75 } });
    expect(owedShares(e)).toEqual({ a: 250, b: 750 });
  });
  it('handles shares', () => {
    const e = exp({ splitType: 'shares', amountPaise: 900, weights: { a: 2, b: 1 } });
    expect(owedShares(e)).toEqual({ a: 600, b: 300 });
  });
});

describe('balances and settle up', () => {
  it('balances always net to zero', () => {
    const g = group([
      exp({ amountPaise: 1000, paidBy: { a: 1000 }, weights: { a: 1, b: 1, c: 1, d: 1 } }),
      exp({ amountPaise: 3001, paidBy: { b: 2000, c: 1001 }, weights: { a: 1, b: 1, c: 1 } }),
    ]);
    expect(sum(netBalances(g))).toBe(0);
  });

  it('simple case: a pays 300 for a,b,c', () => {
    const g = group([
      exp({ amountPaise: 300, paidBy: { a: 300 }, weights: { a: 1, b: 1, c: 1 } }),
    ]);
    const net = netBalances(g);
    expect(net).toEqual({ a: 200, b: -100, c: -100, d: 0 });
    const t = settleUp(net);
    expect(t).toHaveLength(2);
    expect(t.every((x) => x.to === 'a' && x.amountPaise === 100)).toBe(true);
  });

  it('recorded payments reduce balances', () => {
    const g = group(
      [exp({ amountPaise: 200, paidBy: { a: 200 }, weights: { a: 1, b: 1 } })],
      [{ id: 'p', from: 'b', to: 'a', amountPaise: 100, date: '2026-11-02', updatedAt: 1 }],
    );
    const net = netBalances(g);
    expect(net.a).toBe(0);
    expect(net.b).toBe(0);
    expect(settleUp(net)).toEqual([]);
  });

  it('ignores deleted expenses', () => {
    const g = group([
      exp({ amountPaise: 200, paidBy: { a: 200 }, weights: { a: 1, b: 1 }, deleted: true }),
    ]);
    expect(settleUp(netBalances(g))).toEqual([]);
  });

  it('settling the suggested transfers clears everyone', () => {
    const g = group([
      exp({ amountPaise: 1200, paidBy: { a: 1200 }, weights: { a: 1, b: 1, c: 1, d: 1 } }),
      exp({ amountPaise: 700, paidBy: { b: 700 }, weights: { b: 1, c: 1 } }),
      exp({ amountPaise: 999, paidBy: { c: 500, d: 499 }, weights: { a: 1, d: 1, c: 1 } }),
    ]);
    const transfers = settleUp(netBalances(g));
    const paid = transfers.map((t, i) => ({
      id: `s${i}`,
      from: t.from,
      to: t.to,
      amountPaise: t.amountPaise,
      date: '2026-11-03',
      updatedAt: 1,
    }));
    const after = netBalances({ ...g, payments: paid });
    for (const v of Object.values(after)) expect(v).toBe(0);
  });
});

describe('group totals', () => {
  it('adds up paid, share and total', () => {
    const g = group([
      exp({ amountPaise: 300, paidBy: { a: 300 }, weights: { a: 1, b: 1, c: 1 } }),
    ]);
    const t = groupTotals(g);
    expect(t.totalSpent).toBe(300);
    expect(t.paid.a).toBe(300);
    expect(sum(t.share)).toBe(300);
  });
});

describe('Khata (two-person ledger)', () => {
  const ledger = (expenses: GroupExpense[], payments: Group['payments'] = []): Group => ({
    id: 'k',
    name: 'Neel',
    emoji: '🤝',
    kind: 'friend',
    createdAt: 1,
    metaUpdatedAt: 1,
    updatedAt: 1,
    members: [member('me'), member('neel')],
    expenses,
    payments,
  });

  // I paid a 1000 bill and split it equally: Neel owes me 500.
  const iPaidBill = exp({ amountPaise: 100000, paidBy: { me: 100000 }, weights: { me: 1, neel: 1 } });
  // Neel paid a 800 bill and we split it: I owe him 400.
  const neelPaidBill = exp({ amountPaise: 80000, paidBy: { neel: 80000 }, weights: { me: 1, neel: 1 } });

  it('+500 then -400 leaves Neel owing 100', () => {
    const g = ledger([iPaidBill, neelPaidBill]);
    expect(friendBalance(g, 'me')).toBe(10000);
    expect(friendBalance(g, 'neel')).toBe(-10000);
  });

  it('full amount entries: lent 300 to Neel, borrowed 50 from him', () => {
    const lent = exp({ splitType: 'exact', amountPaise: 30000, paidBy: { me: 30000 }, weights: { neel: 30000 } });
    const borrowed = exp({ splitType: 'exact', amountPaise: 5000, paidBy: { neel: 5000 }, weights: { me: 5000 } });
    expect(friendBalance(ledger([lent, borrowed]), 'me')).toBe(25000);
  });

  it('a settlement reduces the balance, and a part payment leaves the rest', () => {
    const settled = ledger(
      [iPaidBill],
      [{ id: 'p1', from: 'neel', to: 'me', amountPaise: 20000, date: '2026-11-02', updatedAt: 1 }],
    );
    expect(friendBalance(settled, 'me')).toBe(30000);
    const full = ledger(
      [iPaidBill],
      [{ id: 'p2', from: 'neel', to: 'me', amountPaise: 50000, date: '2026-11-02', updatedAt: 1 }],
    );
    expect(friendBalance(full, 'me')).toBe(0);
  });

  it('works from both phones: opposite sign, same amount', () => {
    const g = ledger([iPaidBill]);
    expect(friendBalance(g, 'me')).toBe(-friendBalance(g, 'neel'));
  });

  it('odd paise never go missing', () => {
    const e = exp({ amountPaise: 10001, paidBy: { me: 10001 }, weights: { me: 1, neel: 1 } });
    const g = ledger([e]);
    expect(friendBalance(g, 'me') + friendBalance(g, 'neel')).toBe(0);
  });

  it('finds the other person and writes a shareable summary', () => {
    const g = ledger([iPaidBill, neelPaidBill]);
    expect(otherMember(g, 'me')?.id).toBe('neel');
    const text = friendSummary(g, 'me');
    expect(text).toContain('NEEL owes ME ₹100');
    expect(text).toContain('Recent:');
  });
});
