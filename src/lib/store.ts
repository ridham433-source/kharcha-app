import { useSyncExternalStore } from 'react';
import type {
  Account,
  AppState,
  Goal,
  Group,
  GroupExpense,
  ID,
  Member,
  Payment,
  Tx,
} from './types';
import { uid } from './util';

const KEY = 'kharcha:v1';

function initial(): AppState {
  return {
    v: 1,
    accounts: [
      { id: uid(), name: 'Cash', kind: 'cash', openingPaise: 0, color: '#067647' },
      { id: uid(), name: 'Bank / UPI', kind: 'bank', openingPaise: 0, color: '#1F3FFF' },
    ],
    txs: [],
    budgets: {},
    goals: [],
    groups: [],
    meIds: {},
    settings: { userName: 'Me', includeGroupShare: true, cloudUrl: '', cloudKey: '' },
  };
}

function load(): AppState {
  const base = initial();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<AppState>;
      return { ...base, ...s, settings: { ...base.settings, ...(s.settings ?? {}) } };
    }
  } catch {
    /* corrupted or blocked storage: start fresh */
  }
  return base;
}

let state: AppState = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked */
  }
}

export const getState = () => state;

export function setState(fn: (s: AppState) => AppState) {
  state = fn(state);
  persist();
  listeners.forEach((l) => l());
}

export function useAppState(): AppState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

/** Replace everything (used by "restore backup"). */
export function replaceAll(next: AppState) {
  const base = initial();
  setState(() => ({ ...base, ...next, settings: { ...base.settings, ...next.settings } }));
}

export function resetAll() {
  setState(() => initial());
}

/* ---------------- settings ---------------- */

export function updateSettings(patch: Partial<AppState['settings']>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

/* ---------------- accounts ---------------- */

export function saveAccount(a: Account) {
  setState((s) => ({
    ...s,
    accounts: s.accounts.some((x) => x.id === a.id)
      ? s.accounts.map((x) => (x.id === a.id ? a : x))
      : [...s.accounts, a],
  }));
}

export function removeAccount(id: ID) {
  // Keep the account if transactions use it, just hide it.
  setState((s) =>
    s.txs.some((t) => t.accountId === id)
      ? { ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, archived: true } : a)) }
      : { ...s, accounts: s.accounts.filter((a) => a.id !== id) },
  );
}

/* ---------------- transactions ---------------- */

export function saveTx(t: Omit<Tx, 'id' | 'createdAt'> & { id?: ID }): ID {
  const id = t.id ?? uid();
  setState((s) => {
    const existing = s.txs.find((x) => x.id === id);
    const tx: Tx = { ...t, id, createdAt: existing?.createdAt ?? Date.now() };
    return {
      ...s,
      txs: existing ? s.txs.map((x) => (x.id === id ? tx : x)) : [...s.txs, tx],
    };
  });
  return id;
}

export function deleteTx(id: ID) {
  setState((s) => ({ ...s, txs: s.txs.filter((t) => t.id !== id) }));
}

/* ---------------- budgets & goals ---------------- */

export function setBudget(key: string, paise: number) {
  setState((s) => {
    const budgets = { ...s.budgets };
    if (paise > 0) budgets[key] = paise;
    else delete budgets[key];
    return { ...s, budgets };
  });
}

export function saveGoal(g: Goal) {
  setState((s) => ({
    ...s,
    goals: s.goals.some((x) => x.id === g.id)
      ? s.goals.map((x) => (x.id === g.id ? g : x))
      : [...s.goals, g],
  }));
}

export function deleteGoal(id: ID) {
  setState((s) => ({ ...s, goals: s.goals.filter((g) => g.id !== id) }));
}

/* ---------------- Splitter groups ---------------- */

let onGroupChange: (id: ID) => void = () => {};
export function setGroupChangeHandler(fn: (id: ID) => void) {
  onGroupChange = fn;
}

export function createGroup(name: string, emoji: string, otherNames: string[]): ID {
  const now = Date.now();
  const me: Member = { id: uid(), name: getState().settings.userName || 'Me', updatedAt: now };
  const others: Member[] = otherNames
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => ({ id: uid(), name: n, updatedAt: now }));
  const group: Group = {
    id: uid(),
    name: name.trim() || 'New group',
    emoji,
    createdAt: now,
    metaUpdatedAt: now,
    updatedAt: now,
    members: [me, ...others],
    expenses: [],
    payments: [],
  };
  setState((s) => ({
    ...s,
    groups: [group, ...s.groups],
    meIds: { ...s.meIds, [group.id]: me.id },
  }));
  return group.id;
}

/** Edit a group and tell the cloud about it. */
export function mutateGroup(id: ID, fn: (g: Group) => void) {
  setState((s) => ({
    ...s,
    groups: s.groups.map((g) => {
      if (g.id !== id) return g;
      const copy: Group = {
        ...g,
        members: g.members.map((m) => ({ ...m })),
        expenses: [...g.expenses],
        payments: [...g.payments],
      };
      fn(copy);
      copy.updatedAt = Date.now();
      return copy;
    }),
  }));
  onGroupChange(id);
}

export function renameGroup(id: ID, name: string, emoji: string) {
  mutateGroup(id, (g) => {
    g.name = name.trim() || g.name;
    g.emoji = emoji;
    g.metaUpdatedAt = Date.now();
  });
}

export function addMember(groupId: ID, name: string): ID {
  const m: Member = { id: uid(), name: name.trim(), updatedAt: Date.now() };
  mutateGroup(groupId, (g) => {
    g.members.push(m);
  });
  return m.id;
}

export function updateMember(groupId: ID, memberId: ID, patch: Partial<Member>) {
  mutateGroup(groupId, (g) => {
    g.members = g.members.map((m) =>
      m.id === memberId ? { ...m, ...patch, updatedAt: Date.now() } : m,
    );
  });
}

export function saveGroupExpense(
  groupId: ID,
  e: Omit<GroupExpense, 'id' | 'updatedAt'> & { id?: ID },
): ID {
  const id = e.id ?? uid();
  mutateGroup(groupId, (g) => {
    const exp: GroupExpense = { ...e, id, updatedAt: Date.now() };
    const has = g.expenses.some((x) => x.id === id);
    g.expenses = has ? g.expenses.map((x) => (x.id === id ? exp : x)) : [...g.expenses, exp];
  });
  return id;
}

export function deleteGroupExpense(groupId: ID, id: ID) {
  mutateGroup(groupId, (g) => {
    g.expenses = g.expenses.map((x) =>
      x.id === id ? { ...x, deleted: true, updatedAt: Date.now() } : x,
    );
  });
}

export function savePayment(groupId: ID, p: Omit<Payment, 'id' | 'updatedAt'>): ID {
  const id = uid();
  mutateGroup(groupId, (g) => {
    g.payments = [...g.payments, { ...p, id, updatedAt: Date.now() }];
  });
  return id;
}

export function deletePayment(groupId: ID, id: ID) {
  mutateGroup(groupId, (g) => {
    g.payments = g.payments.map((x) =>
      x.id === id ? { ...x, deleted: true, updatedAt: Date.now() } : x,
    );
  });
}

export function setMe(groupId: ID, memberId: ID) {
  setState((s) => ({ ...s, meIds: { ...s.meIds, [groupId]: memberId } }));
}

/** Remove a group from this phone only. */
export function leaveGroup(groupId: ID) {
  setState((s) => {
    const meIds = { ...s.meIds };
    delete meIds[groupId];
    return { ...s, groups: s.groups.filter((g) => g.id !== groupId), meIds };
  });
}

/** Used by cloud sync. Does not trigger another sync. */
export function replaceGroupSilently(g: Group) {
  setState((s) => ({
    ...s,
    groups: s.groups.some((x) => x.id === g.id)
      ? s.groups.map((x) => (x.id === g.id ? g : x))
      : [g, ...s.groups],
  }));
}
