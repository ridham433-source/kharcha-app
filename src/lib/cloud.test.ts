import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enableSharing, joinByCode, mergeDocs, syncGroup, toDoc } from './cloud';
import {
  createFriend,
  createGroup,
  getState,
  saveGroupExpense,
  updateSettings,
  resetAll,
  leaveGroup,
} from './store';
import type { GroupDoc } from './types';

/** A tiny stand-in for the two SQL functions in supabase/schema.sql. */
function fakeServer() {
  const rows = new Map<string, { data: GroupDoc; version: number }>();
  let beforePut: (() => void) | null = null;
  const handler = vi.fn(async (url: string, init: RequestInit) => {
    const name = url.split('/rpc/')[1];
    const body = JSON.parse(String(init.body));
    let result: unknown;
    if (name === 'get_group') {
      const r = rows.get(body.p_code);
      result = r ? [{ data: r.data, version: r.version }] : [];
    } else if (name === 'put_group') {
      beforePut?.();
      beforePut = null;
      const cur = rows.get(body.p_code);
      if (body.p_expected === 0) {
        if (cur) result = -1;
        else {
          rows.set(body.p_code, { data: body.p_data, version: 1 });
          result = 1;
        }
      } else if (!cur || cur.version !== body.p_expected) {
        result = -1;
      } else {
        cur.data = body.p_data;
        cur.version += 1;
        result = cur.version;
      }
    }
    return new Response(JSON.stringify(result), { status: 200 });
  });
  return { rows, handler, onNextPut: (fn: () => void) => (beforePut = fn) };
}

const expense = (id: string, updatedAt: number, amountPaise = 1000) => ({
  id,
  title: id,
  category: 'Food',
  date: '2026-11-01',
  amountPaise,
  paidBy: { m1: amountPaise },
  splitType: 'equal' as const,
  weights: { m1: 1 },
  updatedAt,
});

describe('mergeDocs', () => {
  const base: GroupDoc = {
    id: 'g',
    name: 'Trip',
    emoji: '🏖️',
    createdAt: 1,
    metaUpdatedAt: 1,
    updatedAt: 1,
    members: [],
    expenses: [],
    payments: [],
  };

  it('keeps expenses added on both sides', () => {
    const a = { ...base, expenses: [expense('x', 5)] };
    const b = { ...base, expenses: [expense('y', 6)] };
    expect(mergeDocs(a, b).expenses.map((e) => e.id).sort()).toEqual(['x', 'y']);
  });

  it('newest edit of the same expense wins', () => {
    const a = { ...base, expenses: [expense('x', 5, 1000)] };
    const b = { ...base, expenses: [expense('x', 9, 2500)] };
    expect(mergeDocs(a, b).expenses[0].amountPaise).toBe(2500);
    expect(mergeDocs(b, a).expenses[0].amountPaise).toBe(2500);
  });

  it('a delete made later beats an older edit', () => {
    const a = { ...base, expenses: [{ ...expense('x', 9), deleted: true }] };
    const b = { ...base, expenses: [expense('x', 5)] };
    expect(mergeDocs(a, b).expenses[0].deleted).toBe(true);
  });
});

describe('cloud sync against a fake server', () => {
  let server: ReturnType<typeof fakeServer>;

  beforeEach(() => {
    resetAll();
    for (const g of getState().groups) leaveGroup(g.id);
    server = fakeServer();
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => server.handler(url, init));
    updateSettings({ cloudUrl: 'https://fake.supabase.co', cloudKey: 'sb_publishable_test' });
  });

  it('shares a group and lets a second phone join and see the data', async () => {
    const id = createGroup('Goa', '🏖️', ['Neel']);
    const me = getState().groups[0].members[0].id;
    saveGroupExpense(id, {
      title: 'Dinner',
      category: 'Food',
      date: '2026-11-01',
      amountPaise: 1000,
      paidBy: { [me]: 1000 },
      splitType: 'equal',
      weights: { [me]: 1 },
    });
    const code = await enableSharing(id);
    expect(code).toHaveLength(10);
    expect(server.rows.get(code)?.data.expenses).toHaveLength(1);

    // pretend this is another phone: forget the group locally, then join by code
    leaveGroup(id);
    expect(getState().groups).toHaveLength(0);
    const joined = await joinByCode(code);
    expect(joined).toBe(id);
    expect(getState().groups[0].expenses).toHaveLength(1);
  });

  it('rejects unknown and too-short codes', async () => {
    await expect(joinByCode('ABC')).rejects.toThrow('too short');
    await expect(joinByCode('ZZZZZZZZZZ')).rejects.toThrow('No group found');
  });

  it('pulls in a friend\'s expense and keeps my own unsynced one', async () => {
    const id = createGroup('Goa', '🏖️', ['Neel']);
    const code = await enableSharing(id);

    // friend adds an expense on the server
    const remote = server.rows.get(code)!;
    remote.data = { ...remote.data, expenses: [expense('friend', Date.now())] };
    remote.version += 1;

    // I add one locally without syncing yet
    const me = getState().groups[0].members[0].id;
    saveGroupExpense(id, {
      title: 'Mine',
      category: 'Food',
      date: '2026-11-02',
      amountPaise: 500,
      paidBy: { [me]: 500 },
      splitType: 'equal',
      weights: { [me]: 1 },
    });

    await syncGroup(id);
    const local = getState().groups[0];
    const titles = local.expenses.map((e) => e.title).sort();
    expect(titles).toEqual(['Mine', 'friend']);
    expect(server.rows.get(code)?.data.expenses).toHaveLength(2);
  });

  it('retries when someone saves between my read and my write', async () => {
    const id = createGroup('Goa', '🏖️', ['Neel']);
    const code = await enableSharing(id);
    const me = getState().groups[0].members[0].id;

    saveGroupExpense(id, {
      title: 'Mine',
      category: 'Food',
      date: '2026-11-02',
      amountPaise: 500,
      paidBy: { [me]: 500 },
      splitType: 'equal',
      weights: { [me]: 1 },
    });

    // a friend sneaks in right before my write lands
    server.onNextPut(() => {
      const r = server.rows.get(code)!;
      r.data = { ...r.data, expenses: [...r.data.expenses, expense('sneaky', Date.now())] };
      r.version += 1;
    });

    await syncGroup(id);
    const titles = server.rows.get(code)!.data.expenses.map((e) => e.title).sort();
    expect(titles).toEqual(['Mine', 'sneaky']);
    expect(getState().groups[0].expenses).toHaveLength(2);
  });

  it('a friend ledger keeps its kind when the friend joins from another phone', async () => {
    const id = createFriend('Neel');
    const code = await enableSharing(id);
    expect(server.rows.get(code)?.data.kind).toBe('friend');
    leaveGroup(id);
    await joinByCode(code);
    const joined = getState().groups[0];
    expect(joined.kind).toBe('friend');
    expect(joined.members).toHaveLength(2);
  });

  it('toDoc leaves local-only fields out', () => {
    const id = createGroup('Goa', '🏖️', []);
    const doc = toDoc(getState().groups.find((g) => g.id === id)!);
    expect('code' in doc).toBe(false);
    expect('version' in doc).toBe(false);
  });
});
