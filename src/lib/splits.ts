import type { Group, GroupExpense, ID } from './types';
import { fmt } from './money';

/**
 * Splits `total` paise across members in proportion to their weights.
 * Uses the largest-remainder method so the parts always add up to exactly `total`.
 */
export function allocate(total: number, weights: Record<ID, number>): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const k of Object.keys(weights)) out[k] = 0;
  const ids = Object.keys(weights).filter((k) => weights[k] > 0);
  const sum = ids.reduce((s, k) => s + weights[k], 0);
  if (!ids.length || sum <= 0) return out;

  let used = 0;
  const parts = ids.map((k) => {
    const raw = (total * weights[k]) / sum;
    const floor = Math.floor(raw);
    used += floor;
    return { k, floor, frac: raw - floor };
  });
  const remaining = total - used;
  parts.sort((a, b) => b.frac - a.frac || (a.k < b.k ? -1 : 1));
  for (let i = 0; i < remaining && i < parts.length; i++) parts[i].floor += 1;
  for (const p of parts) out[p.k] = p.floor;
  return out;
}

/** How much each participant owes for one expense (paise). */
export function owedShares(e: GroupExpense): Record<ID, number> {
  if (e.splitType === 'exact') {
    const sum = Object.values(e.weights).reduce((s, v) => s + v, 0);
    if (sum === e.amountPaise) return { ...e.weights };
  }
  if (e.splitType === 'equal') {
    const ones: Record<ID, number> = {};
    for (const k of Object.keys(e.weights)) ones[k] = 1;
    return allocate(e.amountPaise, ones);
  }
  return allocate(e.amountPaise, e.weights);
}

export const activeExpenses = (g: Group) => g.expenses.filter((e) => !e.deleted);
export const activePayments = (g: Group) => g.payments.filter((p) => !p.deleted);
export const activeMembers = (g: Group) => g.members.filter((m) => !m.deleted);

export function memberName(g: Group, id: ID): string {
  return g.members.find((m) => m.id === id)?.name ?? 'Someone';
}

/**
 * Net balance per member in paise.
 * Positive = the group owes them money. Negative = they owe the group.
 */
export function netBalances(g: Group): Record<ID, number> {
  const net: Record<ID, number> = {};
  for (const m of g.members) net[m.id] = 0;
  const add = (id: ID, v: number) => (net[id] = (net[id] ?? 0) + v);

  for (const e of activeExpenses(g)) {
    for (const [id, paid] of Object.entries(e.paidBy)) add(id, paid);
    for (const [id, owed] of Object.entries(owedShares(e))) add(id, -owed);
  }
  for (const p of activePayments(g)) {
    add(p.from, p.amountPaise); // they handed over money, so they are owed less
    add(p.to, -p.amountPaise);
  }
  return net;
}

export interface Transfer {
  from: ID;
  to: ID;
  amountPaise: number;
}

/** The fewest simple payments that clear every balance. */
export function settleUp(net: Record<ID, number>): Transfer[] {
  const debtors = Object.entries(net)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, amt: -v }))
    .sort((a, b) => b.amt - a.amt);
  const creditors = Object.entries(net)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, amt: v }))
    .sort((a, b) => b.amt - a.amt);

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amountPaise: pay });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return out;
}

export interface GroupTotals {
  totalSpent: number;
  paid: Record<ID, number>;
  share: Record<ID, number>;
  byCategory: Record<string, number>;
}

export function groupTotals(g: Group): GroupTotals {
  const paid: Record<ID, number> = {};
  const share: Record<ID, number> = {};
  const byCategory: Record<string, number> = {};
  let totalSpent = 0;
  for (const m of g.members) {
    paid[m.id] = 0;
    share[m.id] = 0;
  }
  for (const e of activeExpenses(g)) {
    totalSpent += e.amountPaise;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amountPaise;
    for (const [id, v] of Object.entries(e.paidBy)) paid[id] = (paid[id] ?? 0) + v;
    for (const [id, v] of Object.entries(owedShares(e))) share[id] = (share[id] ?? 0) + v;
  }
  return { totalSpent, paid, share, byCategory };
}

/** Text summary to paste into the WhatsApp group. */
export function summaryText(g: Group, link?: string): string {
  const net = netBalances(g);
  const totals = groupTotals(g);
  const lines: string[] = [`🍋 Splitter · ${g.emoji} ${g.name}`, `Total spent: ${fmt(totals.totalSpent)}`, ''];
  const sorted = Object.entries(net).sort((a, b) => b[1] - a[1]);
  for (const [id, v] of sorted) {
    if (v > 0) lines.push(`• ${memberName(g, id)} gets ${fmt(v)}`);
    else if (v < 0) lines.push(`• ${memberName(g, id)} owes ${fmt(-v)}`);
  }
  const transfers = settleUp(net);
  if (transfers.length) {
    lines.push('', 'Settle up:');
    for (const t of transfers) {
      lines.push(`${memberName(g, t.from)} → ${memberName(g, t.to)}  ${fmt(t.amountPaise)}`);
    }
  } else {
    lines.push('Everyone is settled up ✅');
  }
  if (link) lines.push('', link);
  return lines.join('\n');
}
