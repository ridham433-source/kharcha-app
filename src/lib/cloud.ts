import { useSyncExternalStore } from 'react';
import type { Group, GroupDoc, ID } from './types';
import {
  getState,
  replaceGroupSilently,
  setGroupChangeHandler,
  setMe,
  mutateGroup,
} from './store';
import { makeCode } from './util';

/**
 * Optional free cloud sync for shared Splitter groups (Supabase free tier).
 * Without it the whole app still works on one phone.
 * Setup: see README.md and supabase/schema.sql.
 */

/* ---------------- config ---------------- */

export interface CloudConfig {
  url: string;
  key: string;
  /** true when typed into the app, false when baked into the build */
  fromSettings: boolean;
}

export function cloudConfig(): CloudConfig | null {
  const s = getState().settings;
  const url = (s.cloudUrl || import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (s.cloudKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key, fromSettings: Boolean(s.cloudUrl && s.cloudKey) };
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const cfg = cloudConfig();
  if (!cfg) throw new Error('Cloud sync is not set up');
  const headers: Record<string, string> = {
    apikey: cfg.key,
    'Content-Type': 'application/json',
  };
  // Legacy anon keys are JWTs. Newer publishable keys are not and go in `apikey` only.
  if (cfg.key.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.key}`;
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sync failed (${res.status}) ${text.slice(0, 120)}`);
  }
  return (await res.json()) as T;
}

/** Checks the address and key by asking for a group that does not exist. */
export async function testCloud(url: string, key: string): Promise<void> {
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/get_group`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_code: 'TESTCODE00' }),
  });
  if (res.status === 404) {
    throw new Error('Connected, but the SQL from supabase/schema.sql has not been run yet.');
  }
  if (!res.ok) throw new Error(`Could not connect (${res.status}). Check the address and key.`);
}

/* ---------------- status ---------------- */

export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline';
interface SyncSnapshot {
  status: SyncState;
  lastError: string;
}
let statusSnapshot: SyncSnapshot = { status: 'idle', lastError: '' };
const statusListeners = new Set<() => void>();

function setStatus(status: SyncState, lastError = '') {
  statusSnapshot = { status, lastError };
  statusListeners.forEach((l) => l());
}

export function useSyncStatus() {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => statusSnapshot,
  );
}

/* ---------------- merge ---------------- */

export function toDoc(g: Group): GroupDoc {
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    createdAt: g.createdAt,
    metaUpdatedAt: g.metaUpdatedAt,
    updatedAt: g.updatedAt,
    members: g.members,
    expenses: g.expenses,
    payments: g.payments,
  };
}

function mergeById<T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of a) map.set(item.id, item);
  for (const item of b) {
    const cur = map.get(item.id);
    if (!cur || item.updatedAt > cur.updatedAt) map.set(item.id, item);
  }
  return [...map.values()];
}

/** Combines two copies of a group. The newest edit of every item wins. */
export function mergeDocs(local: GroupDoc, remote: GroupDoc): GroupDoc {
  const meta = remote.metaUpdatedAt > local.metaUpdatedAt ? remote : local;
  return {
    id: local.id,
    name: meta.name,
    emoji: meta.emoji,
    createdAt: Math.min(local.createdAt, remote.createdAt),
    metaUpdatedAt: Math.max(local.metaUpdatedAt, remote.metaUpdatedAt),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    members: mergeById(local.members, remote.members),
    expenses: mergeById(local.expenses, remote.expenses),
    payments: mergeById(local.payments, remote.payments),
  };
}

function fingerprint(d: GroupDoc): string {
  const byId = <T extends { id: string }>(l: T[]) => [...l].sort((a, b) => (a.id < b.id ? -1 : 1));
  return JSON.stringify({
    n: d.name,
    e: d.emoji,
    m: byId(d.members),
    x: byId(d.expenses),
    p: byId(d.payments),
  });
}

/* ---------------- server calls ---------------- */

interface RemoteRow {
  data: GroupDoc;
  version: number;
}

async function fetchRemote(code: string): Promise<RemoteRow | null> {
  const rows = await rpc<RemoteRow[]>('get_group', { p_code: code });
  return rows[0] ?? null;
}

/* ---------------- sync ---------------- */

const inflight = new Set<ID>();
const queued = new Set<ID>();

export async function syncGroup(groupId: ID): Promise<void> {
  if (!cloudConfig()) return;
  if (inflight.has(groupId)) {
    queued.add(groupId);
    return;
  }
  inflight.add(groupId);
  setStatus('syncing');
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const local = getState().groups.find((g) => g.id === groupId);
      if (!local?.code) return;

      const remote = await fetchRemote(local.code);
      const merged = remote ? mergeDocs(toDoc(local), remote.data) : toDoc(local);
      const remoteSame = remote ? fingerprint(merged) === fingerprint(remote.data) : false;

      if (remote && remoteSame) {
        // Nothing to upload. Just take whatever the server had.
        replaceGroupSilently({ ...local, ...merged, code: local.code, version: remote.version });
        setStatus('synced');
        return;
      }

      const result = await rpc<number>('put_group', {
        p_code: local.code,
        p_data: merged,
        p_expected: remote?.version ?? 0,
      });
      if (result !== -1) {
        replaceGroupSilently({ ...local, ...merged, code: local.code, version: result });
        setStatus('synced');
        return;
      }
      // Someone else saved first. Loop: fetch, merge again, retry.
    }
    setStatus('offline', 'Too many edits at once. Try again.');
  } catch (err) {
    setStatus('offline', err instanceof Error ? err.message : 'Offline');
  } finally {
    inflight.delete(groupId);
    if (queued.has(groupId)) {
      queued.delete(groupId);
      void syncGroup(groupId);
    }
  }
}

const timers = new Map<ID, number>();

/** Push local edits to the cloud shortly after the last change. */
export function scheduleSync(groupId: ID) {
  const g = getState().groups.find((x) => x.id === groupId);
  if (!g?.code) return;
  window.clearTimeout(timers.get(groupId));
  timers.set(
    groupId,
    window.setTimeout(() => void syncGroup(groupId), 700),
  );
}

export function startCloud() {
  setGroupChangeHandler(scheduleSync);
  window.addEventListener('online', () => {
    for (const g of getState().groups) if (g.code) void syncGroup(g.id);
  });
}

/* ---------------- share and join ---------------- */

/** Turns a local group into a shared one and uploads it. Returns the join code. */
export async function enableSharing(groupId: ID): Promise<string> {
  const group = getState().groups.find((g) => g.id === groupId);
  if (!group) throw new Error('Group not found');
  if (group.code) return group.code;
  if (!cloudConfig()) throw new Error('Cloud sync is not set up');

  const code = makeCode();
  const result = await rpc<number>('put_group', {
    p_code: code,
    p_data: toDoc(group),
    p_expected: 0,
  });
  if (result === -1) throw new Error('Could not create the share code. Try again.');
  replaceGroupSilently({ ...group, code, version: result });
  setStatus('synced');
  return code;
}

export class JoinError extends Error {}

/** Downloads a shared group by its code. Returns the local group id. */
export async function joinByCode(rawCode: string): Promise<ID> {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 8) throw new JoinError('That code looks too short.');
  const existing = getState().groups.find((g) => g.code === code);
  if (existing) return existing.id;

  const remote = await fetchRemote(code);
  if (!remote) throw new JoinError('No group found with that code.');

  const local = getState().groups.find((g) => g.id === remote.data.id);
  if (local) {
    replaceGroupSilently({ ...local, ...mergeDocs(toDoc(local), remote.data), code, version: remote.version });
    return local.id;
  }
  replaceGroupSilently({ ...remote.data, code, version: remote.version });
  return remote.data.id;
}

/** Link a friend can open to join. Includes the cloud address if it was typed into the app. */
export function inviteLink(code: string): string {
  const base = `${window.location.origin}${window.location.pathname}#/join/${code}`;
  const cfg = cloudConfig();
  if (cfg?.fromSettings) {
    return `${base}?u=${encodeURIComponent(cfg.url)}&k=${encodeURIComponent(cfg.key)}`;
  }
  return base;
}

/** After joining: pick which member is "me", or add yourself. */
export function claimMember(groupId: ID, memberId: ID) {
  setMe(groupId, memberId);
}

export function touchGroup(groupId: ID) {
  mutateGroup(groupId, () => {});
}
