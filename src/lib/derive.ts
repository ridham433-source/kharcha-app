import type { AppState, Group, TxType } from './types';
import { owedShares, activeExpenses, netBalances } from './splits';
import { daysInMonth, monthKey } from './util';

/** A row in the personal ledger. Splitter shares show up here too. */
export interface Entry {
  id: string;
  type: TxType;
  amountPaise: number;
  category: string;
  accountId: string | null;
  date: string;
  note: string;
  /** null for money that came from Splitter, where "needed or not" is unknown */
  necessary: boolean | null;
  at: number;
  groupId?: string;
}

export function entries(s: AppState): Entry[] {
  const out: Entry[] = s.txs.map((t) => ({
    id: t.id,
    type: t.type,
    amountPaise: t.amountPaise,
    category: t.category,
    accountId: t.accountId,
    date: t.date,
    note: t.note,
    necessary: t.type === 'expense' ? t.necessary : null,
    at: t.createdAt,
  }));

  if (s.settings.includeGroupShare) {
    for (const g of s.groups) {
      const me = s.meIds[g.id];
      if (!me) continue;
      for (const e of activeExpenses(g)) {
        const mine = owedShares(e)[me] ?? 0;
        if (mine > 0) {
          out.push({
            id: `g:${g.id}:${e.id}`,
            type: 'expense',
            amountPaise: mine,
            category: e.category,
            accountId: null,
            date: e.date,
            note: `${g.name} · ${e.title}`,
            necessary: null,
            at: e.updatedAt,
            groupId: g.id,
          });
        }
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
}

export function accountBalance(s: AppState, accountId: string): number {
  const acc = s.accounts.find((a) => a.id === accountId);
  let bal = acc?.openingPaise ?? 0;
  for (const t of s.txs) {
    if (t.accountId !== accountId) continue;
    bal += t.type === 'income' ? t.amountPaise : -t.amountPaise;
  }
  return bal;
}

export interface MonthStats {
  key: string;
  spent: number;
  income: number;
  byCategory: Record<string, number>;
  necessary: number;
  unnecessary: number;
  daily: number[]; // index 0 = day 1
  biggest: Entry[];
  count: number;
}

export function monthStats(all: Entry[], key: string): MonthStats {
  const days = daysInMonth(key);
  const stats: MonthStats = {
    key,
    spent: 0,
    income: 0,
    byCategory: {},
    necessary: 0,
    unnecessary: 0,
    daily: Array.from({ length: days }, () => 0),
    biggest: [],
    count: 0,
  };
  const expenses: Entry[] = [];
  for (const e of all) {
    if (monthKey(e.date) !== key) continue;
    stats.count++;
    if (e.type === 'income') {
      stats.income += e.amountPaise;
      continue;
    }
    stats.spent += e.amountPaise;
    expenses.push(e);
    stats.byCategory[e.category] = (stats.byCategory[e.category] ?? 0) + e.amountPaise;
    if (e.necessary === true) stats.necessary += e.amountPaise;
    if (e.necessary === false) stats.unnecessary += e.amountPaise;
    const day = Number(e.date.slice(8, 10));
    if (day >= 1 && day <= days) stats.daily[day - 1] += e.amountPaise;
  }
  stats.biggest = expenses.sort((a, b) => b.amountPaise - a.amountPaise).slice(0, 5);
  return stats;
}

/** What I am owed (+) or owe (-) in one group. */
export function myBalance(s: AppState, g: Group): number {
  const me = s.meIds[g.id];
  if (!me) return 0;
  return netBalances(g)[me] ?? 0;
}
