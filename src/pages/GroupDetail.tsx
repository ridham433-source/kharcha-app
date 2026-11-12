import { useEffect, useMemo, useState } from 'react';
import {
  addMember,
  deletePayment,
  leaveGroup,
  renameGroup,
  savePayment,
  setMe,
  updateMember,
  useAppState,
} from '../lib/store';
import {
  activeExpenses,
  activeMembers,
  activePayments,
  groupTotals,
  memberName,
  netBalances,
  owedShares,
  settleUp,
  summaryText,
  type Transfer,
} from '../lib/splits';
import { fmt } from '../lib/money';
import { catEmoji, GROUP_EMOJIS } from '../lib/categories';
import { dayLabel, today } from '../lib/util';
import { go } from '../lib/router';
import { cloudConfig, enableSharing, inviteLink, syncGroup, useSyncStatus } from '../lib/cloud';
import { Avatar, Empty, Icon, Segmented, Sheet, TopBar } from '../components/ui';
import type { Group, Member } from '../lib/types';

type Tab = 'expenses' | 'balances' | 'totals';

async function shareText(text: string) {
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({ text });
      return;
    } catch {
      return; // cancelled
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

export default function GroupDetail({ id }: { id: string }) {
  const s = useAppState();
  const g = s.groups.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>('expenses');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const sync = useSyncStatus();

  // Keep shared groups fresh: sync on open, every 10 seconds, and when the app comes back to the front.
  useEffect(() => {
    if (!g?.code) return;
    void syncGroup(id);
    const timer = window.setInterval(() => {
      if (!document.hidden) void syncGroup(id);
    }, 10000);
    const onVisible = () => {
      if (!document.hidden) void syncGroup(id);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, g?.code]);

  const net = useMemo(() => (g ? netBalances(g) : {}), [g]);

  if (!g) {
    return (
      <div className="page no-nav stack">
        <TopBar title="Group not found" onBack={() => go('/splitter')} />
        <Empty emoji="🍋" title="This group is not on this phone" text="It may have been removed. Join again with a code." />
      </div>
    );
  }

  const meId = s.meIds[g.id];
  const myNet = meId ? (net[meId] ?? 0) : 0;
  const totals = groupTotals(g);
  const transfers = settleUp(net);

  return (
    <div className="page no-nav stack" style={{ paddingBottom: 120 }}>
      <TopBar
        title={`${g.emoji} ${g.name}`}
        onBack={() => go('/splitter')}
        right={
          <>
            <button className="icon-btn" aria-label="Invite friends" onClick={() => setInviteOpen(true)}>
              <Icon name="share" />
            </button>
            <button className="icon-btn" aria-label="Group settings and people" onClick={() => setGroupOpen(true)}>
              <Icon name="edit" />
            </button>
          </>
        }
      />

      {g.code && (
        <div>
          <span className="pill">
            <span
              className={`dot ${sync.status === 'synced' ? 'ok' : sync.status === 'offline' ? 'bad' : sync.status === 'syncing' ? 'busy' : ''}`}
            />
            {sync.status === 'offline'
              ? 'Offline. Changes will sync later'
              : sync.status === 'syncing'
                ? 'Syncing…'
                : 'Shared and up to date'}
          </span>
        </div>
      )}

      <section className="card lemon">
        {!meId ? (
          <div style={{ fontWeight: 700 }}>Pick who you are in this group to see your balance.</div>
        ) : myNet === 0 ? (
          <div className="hero-amount" style={{ fontSize: 32 }}>You are settled up</div>
        ) : (
          <>
            <div style={{ fontWeight: 700 }}>{myNet > 0 ? 'You are owed' : 'You owe'}</div>
            <div className="hero-amount">{fmt(Math.abs(myNet))}</div>
          </>
        )}
        <div className="small" style={{ marginTop: 10, fontWeight: 600 }}>
          Group has spent {fmt(totals.totalSpent)}
          {meId ? ` · your share ${fmt(totals.share[meId] ?? 0)}` : ''}
        </div>
      </section>

      <Segmented
        lemon
        options={[
          { id: 'expenses', label: 'Expenses' },
          { id: 'balances', label: 'Balances' },
          { id: 'totals', label: 'Totals' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'expenses' && <ExpensesTab g={g} meId={meId} />}
      {tab === 'balances' && <BalancesTab g={g} net={net} transfers={transfers} meId={meId} />}
      {tab === 'totals' && <TotalsTab g={g} />}

      <button className="btn lemon fab-float" onClick={() => go(`/splitter/${g.id}/add`)}>
        <Icon name="plus" /> Add expense
      </button>

      <WhoAmI g={g} open={!meId} />
      <InviteSheet g={g} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <GroupSheet g={g} meId={meId} open={groupOpen} onClose={() => setGroupOpen(false)} />
    </div>
  );
}

/* ---------------- tabs ---------------- */

function ExpensesTab({ g, meId }: { g: Group; meId?: string }) {
  type Item =
    | { kind: 'e'; date: string; at: number; id: string }
    | { kind: 'p'; date: string; at: number; id: string };

  const items: Item[] = [
    ...activeExpenses(g).map((e) => ({ kind: 'e' as const, date: e.date, at: e.updatedAt, id: e.id })),
    ...activePayments(g).map((p) => ({ kind: 'p' as const, date: p.date, at: p.updatedAt, id: p.id })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);

  if (items.length === 0) {
    return (
      <Empty
        emoji="🍽️"
        title="No expenses yet"
        text="Add the first one. Choose who paid and who it was for."
      />
    );
  }

  const byDate = new Map<string, Item[]>();
  for (const it of items) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);

  return (
    <>
      {[...byDate.entries()].map(([date, list]) => (
        <section key={date}>
          <div className="date-head">{dayLabel(date)}</div>
          <div className="card flush list">
            {list.map((it) => {
              if (it.kind === 'p') {
                const p = g.payments.find((x) => x.id === it.id)!;
                return (
                  <button
                    key={it.id}
                    className="item"
                    onClick={() => {
                      if (window.confirm('Delete this payment record?')) deletePayment(g.id, p.id);
                    }}
                  >
                    <span className="bubble lemon">💸</span>
                    <span className="grow">
                      <span style={{ display: 'block', fontWeight: 700 }}>
                        {memberName(g, p.from)} paid {memberName(g, p.to)}
                      </span>
                      <span className="muted small">Settlement</span>
                    </span>
                    <span className="num">{fmt(p.amountPaise)}</span>
                  </button>
                );
              }
              const e = g.expenses.find((x) => x.id === it.id)!;
              const payers = Object.keys(e.paidBy).map((m) => memberName(g, m)).join(' + ');
              const owed = owedShares(e);
              const involved = meId && (e.paidBy[meId] || owed[meId]);
              const mine = meId ? (e.paidBy[meId] ?? 0) - (owed[meId] ?? 0) : 0;
              return (
                <button key={it.id} className="item" onClick={() => go(`/splitter/${g.id}/edit/${e.id}`)}>
                  <span className="bubble lemon">{catEmoji(e.category)}</span>
                  <span className="grow">
                    <span className="ellipsis" style={{ display: 'block', fontWeight: 700 }}>
                      {e.title}
                    </span>
                    <span className="muted small ellipsis" style={{ display: 'block' }}>
                      {payers} paid · {Object.keys(e.weights).length} sharing
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span className="num" style={{ display: 'block' }}>{fmt(e.amountPaise)}</span>
                    <span className={`small ${!involved ? 'muted' : mine >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 600 }}>
                      {!involved ? 'not involved' : mine >= 0 ? `you lent ${fmt(mine)}` : `you owe ${fmt(-mine)}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

function BalancesTab({
  g,
  net,
  transfers,
  meId,
}: {
  g: Group;
  net: Record<string, number>;
  transfers: Transfer[];
  meId?: string;
}) {
  const ids = g.members.filter((m) => !m.deleted || (net[m.id] ?? 0) !== 0).map((m) => m.id);
  const maxAbs = Math.max(1, ...ids.map((i) => Math.abs(net[i] ?? 0)));

  const record = (t: Transfer) => {
    savePayment(g.id, { from: t.from, to: t.to, amountPaise: t.amountPaise, date: today() });
  };

  const upiLink = (t: Transfer) => {
    const to = g.members.find((m) => m.id === t.to);
    if (!to?.upi) return null;
    return `upi://pay?pa=${encodeURIComponent(to.upi)}&pn=${encodeURIComponent(to.name)}&am=${(t.amountPaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Splitter: ${g.name}`)}`;
  };

  return (
    <>
      <section className="card flush list">
        {ids.map((id) => {
          const v = net[id] ?? 0;
          return (
            <div key={id} className="item">
              <Avatar name={memberName(g, id)} />
              <span className="grow">
                <span style={{ fontWeight: 700 }}>
                  {memberName(g, id)} {id === meId && <span className="badge blue">You</span>}
                </span>
                <span className="bar" style={{ marginTop: 6, height: 10 }}>
                  <i
                    style={{
                      width: `${Math.round((Math.abs(v) / maxAbs) * 100)}%`,
                      background: v >= 0 ? 'var(--green)' : 'var(--red)',
                    }}
                  />
                </span>
              </span>
              <span className={`num ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted'}`}>
                {v > 0 ? `gets ${fmt(v)}` : v < 0 ? `owes ${fmt(-v)}` : 'settled'}
              </span>
            </div>
          );
        })}
      </section>

      <section>
        <h2 style={{ marginBottom: 10 }}>Settle up</h2>
        {transfers.length === 0 ? (
          <div className="card center">
            <div style={{ fontSize: 36 }}>🎉</div>
            <div style={{ fontWeight: 700 }}>Everyone is settled up</div>
          </div>
        ) : (
          <div className="card flush list">
            {transfers.map((t, i) => {
              const link = meId === t.from ? upiLink(t) : null;
              return (
                <div key={i} className="item" style={{ flexWrap: 'wrap' }}>
                  <span className="grow" style={{ fontWeight: 700 }}>
                    {memberName(g, t.from)} pays {memberName(g, t.to)}
                  </span>
                  <span className="num">{fmt(t.amountPaise)}</span>
                  <div className="row" style={{ width: '100%', gap: 8 }}>
                    {link && (
                      <a className="btn small lemon grow" href={link}>
                        Pay with UPI
                      </a>
                    )}
                    <button className="btn small ghost grow" onClick={() => record(t)}>
                      <Icon name="check" size={18} /> Mark as paid
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <button
        className="btn block"
        onClick={() => void shareText(summaryText(g, g.code ? inviteLink(g.code) : undefined))}
      >
        <Icon name="share" /> Share summary
      </button>
    </>
  );
}

function TotalsTab({ g }: { g: Group }) {
  const t = groupTotals(g);
  const cats = Object.entries(t.byCategory).sort((a, b) => b[1] - a[1]);
  const members = g.members.filter((m) => !m.deleted || t.paid[m.id] || t.share[m.id]);

  return (
    <>
      <section className="card">
        <div className="muted small">Total spent by the group</div>
        <div className="hero-amount" style={{ fontSize: 36 }}>{fmt(t.totalSpent)}</div>
      </section>

      <section>
        <h2 style={{ marginBottom: 10 }}>Per person</h2>
        <div className="card flush list">
          {members.map((m) => (
            <div key={m.id} className="item">
              <Avatar name={m.name} />
              <span className="grow" style={{ fontWeight: 700 }}>{m.name}</span>
              <span style={{ textAlign: 'right' }}>
                <span className="small muted" style={{ display: 'block' }}>
                  paid {fmt(t.paid[m.id] ?? 0)}
                </span>
                <span className="num">share {fmt(t.share[m.id] ?? 0)}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {cats.length > 0 && (
        <section className="card">
          <h2 style={{ marginBottom: 12 }}>By category</h2>
          <div className="stack" style={{ gap: 12 }}>
            {cats.map(([c, v]) => (
              <div key={c}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 700 }}>
                    {catEmoji(c)} {c}
                  </span>
                  <span className="num">{fmt(v)}</span>
                </div>
                <div className="bar">
                  <i style={{ width: `${Math.max(2, Math.round((v / t.totalSpent) * 100))}%`, background: 'var(--lemon)' }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/* ---------------- sheets ---------------- */

function WhoAmI({ g, open }: { g: Group; open: boolean }) {
  const [name, setName] = useState('');
  return (
    <Sheet open={open} onClose={() => {}} title="Who are you?">
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          Pick your name so Splitter can show what you owe and are owed.
        </p>
        <div className="card flush list">
          {activeMembers(g).map((m) => (
            <button key={m.id} className="item" onClick={() => setMe(g.id, m.id)}>
              <Avatar name={m.name} />
              <span className="grow" style={{ fontWeight: 700 }}>{m.name}</span>
              <Icon name="chev" />
            </button>
          ))}
        </div>
        <label className="field">
          <span>Not in the list? Add yourself</span>
          <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button
          className="btn lemon block"
          disabled={!name.trim()}
          onClick={() => {
            const id = addMember(g.id, name);
            setMe(g.id, id);
            setName('');
          }}
        >
          Add me to this group
        </button>
      </div>
    </Sheet>
  );
}

export function InviteSheet({ g, open, onClose }: { g: Group; open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const isFriend = g.kind === 'friend';
  const configured = cloudConfig() !== null;

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await enableSharing(g.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share this group');
    } finally {
      setBusy(false);
    }
  };

  const link = g.code ? inviteLink(g.code) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', link);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={isFriend ? 'Sync with your friend' : 'Invite friends'}>
      <div className="stack">
        {!g.code ? (
          !configured ? (
            <>
              <div className="notice">
                Everyone adding expenses from their own phone needs free cloud sync. It takes about 5 minutes to set up once.
              </div>
              <button
                className="btn lemon block"
                onClick={() => {
                  onClose();
                  go('/more');
                }}
              >
                Set up cloud sync
              </button>
              <p className="muted small" style={{ margin: 0 }}>
                Prefer to enter everything yourself? You can use Splitter on this phone alone. Share the summary with the group from the Balances tab.
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                {isFriend
                  ? 'Create a link and send it to your friend. When they open it, you both see the same balance and either of you can add entries.'
                  : 'Create a link. Anyone with it can join this group and add expenses from their own phone.'}
              </p>
              {error && <div className="notice bad">{error}</div>}
              <button className="btn lemon block" disabled={busy} onClick={create}>
                {busy ? 'Creating…' : 'Create invite link'}
              </button>
            </>
          )
        ) : (
          <>
            <div className="card" style={{ background: 'var(--lemon-soft)' }}>
              <div className="muted small">Group code</div>
              <div className="num" style={{ fontSize: 28, letterSpacing: '0.06em' }}>{g.code}</div>
            </div>
            <button className="btn lemon block" onClick={() => void shareText(isFriend ? `Open our Khata so we both see who owes what:\n${link}` : `Join "${g.name}" on Splitter:\n${link}`)}>
              <Icon name="share" /> Share on WhatsApp or other apps
            </button>
            <button className="btn block" onClick={copy}>
              <Icon name="copy" /> {copied ? 'Copied' : 'Copy link'}
            </button>
            <p className="muted small" style={{ margin: 0 }}>
              Anyone who has this link can see and edit the group, so share it only with people in the trip.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}

function GroupSheet({
  g,
  meId,
  open,
  onClose,
}: {
  g: Group;
  meId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(g.name);
  const [emoji, setEmoji] = useState(g.emoji);
  const [newMember, setNewMember] = useState('');

  const used = (id: string) =>
    g.expenses.some((e) => !e.deleted && (e.paidBy[id] || e.weights[id])) ||
    g.payments.some((p) => !p.deleted && (p.from === id || p.to === id));

  return (
    <Sheet open={open} onClose={onClose} title="Group and people">
      <div className="stack">
        <label className="field">
          <span>Group name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="chips" role="group" aria-label="Group icon">
          {GROUP_EMOJIS.map((e) => (
            <button key={e} className="chip" aria-pressed={emoji === e} onClick={() => setEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
        <button
          className="btn block"
          disabled={name.trim() === g.name && emoji === g.emoji}
          onClick={() => renameGroup(g.id, name, emoji)}
        >
          Save name and icon
        </button>

        <h3>People</h3>
        <div className="stack" style={{ gap: 12 }}>
          {activeMembers(g).map((m) => (
            <MemberRow key={m.id + m.updatedAt} g={g} m={m} isMe={m.id === meId} canRemove={!used(m.id)} />
          ))}
        </div>

        <label className="field">
          <span>Add a person</span>
          <div className="row">
            <input
              className="input"
              placeholder="Name"
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
            />
            <button
              className="btn lemon"
              disabled={!newMember.trim()}
              onClick={() => {
                addMember(g.id, newMember);
                setNewMember('');
              }}
            >
              Add
            </button>
          </div>
        </label>

        <button
          className="btn danger block"
          onClick={() => {
            if (window.confirm('Remove this group from this phone? Friends keep their copy if it is shared.')) {
              leaveGroup(g.id);
              onClose();
              go('/splitter');
            }
          }}
        >
          Remove group from this phone
        </button>
      </div>
    </Sheet>
  );
}

function MemberRow({
  g,
  m,
  isMe,
  canRemove,
}: {
  g: Group;
  m: Member;
  isMe: boolean;
  canRemove: boolean;
}) {
  const [name, setName] = useState(m.name);
  const [upi, setUpi] = useState(m.upi ?? '');
  const dirty = name.trim() !== m.name || upi.trim() !== (m.upi ?? '');

  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <Avatar name={m.name} size={34} />
        <input
          className="input"
          aria-label={`Name of ${m.name}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <input
        className="input"
        aria-label={`UPI ID of ${m.name}`}
        placeholder="UPI ID (optional, for quick payments)"
        value={upi}
        onChange={(e) => setUpi(e.target.value)}
      />
      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        {isMe ? (
          <span className="badge blue">This is you</span>
        ) : (
          <button className="btn small ghost" onClick={() => setMe(g.id, m.id)}>
            This is me
          </button>
        )}
        {dirty && (
          <button
            className="btn small lemon"
            onClick={() => updateMember(g.id, m.id, { name: name.trim() || m.name, upi: upi.trim() || undefined })}
          >
            Save
          </button>
        )}
        {canRemove && !isMe && (
          <button
            className="btn small danger"
            onClick={() => updateMember(g.id, m.id, { deleted: true })}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
