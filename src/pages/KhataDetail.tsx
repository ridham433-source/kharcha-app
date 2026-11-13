import { useState } from 'react';
import {
  deleteGroupExpense,
  deletePayment,
  leaveGroup,
  removeKhataPaymentTxs,
  savePayment,
  saveTx,
  setMe,
  unlinkKhataExpense,
  updateMember,
  useAppState,
} from '../lib/store';
import {
  activeExpenses,
  activeMembers,
  activePayments,
  friendBalance,
  friendSummary,
  memberName,
  otherMember,
  owedShares,
} from '../lib/splits';
import { fmt, parseAmount, toInput } from '../lib/money';
import { dayLabel, shareText, today } from '../lib/util';
import { go } from '../lib/router';
import { inviteLink, useAutoSync, useSyncStatus } from '../lib/cloud';
import { Avatar, Empty, Icon, Sheet, TopBar } from '../components/ui';
import { InviteSheet } from './GroupDetail';
import { looksLikeUpi, upiLink } from '../lib/report';
import type { Group, Member } from '../lib/types';

export default function KhataDetail({ id }: { id: string }) {
  const s = useAppState();
  const g = s.groups.find((x) => x.id === id);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const sync = useSyncStatus();
  useAutoSync(id, g?.code);

  if (!g || g.kind !== 'friend') {
    return (
      <div className="page no-nav stack">
        <TopBar title="Not found" onBack={() => go('/khata')} />
        <Empty emoji="🤝" title="This friend is not on this phone" text="It may have been removed. Join again with a code." />
      </div>
    );
  }

  const meId = s.meIds[id];
  const other = otherMember(g, meId);
  const theirName = other?.name ?? g.name;
  const net = meId ? friendBalance(g, meId) : 0;

  return (
    <div className="page no-nav stack" style={{ paddingBottom: 120 }}>
      <TopBar
        title={theirName}
        onBack={() => go('/khata')}
        right={
          <button className="icon-btn" aria-label="Sync with your friend" onClick={() => setInviteOpen(true)}>
            <Icon name="link" />
          </button>
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
                : 'Synced with your friend'}
          </span>
        </div>
      )}

      <section className={`card ${net > 0 ? 'green' : net < 0 ? 'red' : ''}`}>
        <div className="row">
          <Avatar name={theirName} size={48} />
          <div className="grow">
            {net === 0 ? (
              <div className="hero-amount" style={{ fontSize: 30 }}>All settled up</div>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>
                  {net > 0 ? `${theirName} owes you` : `You owe ${theirName}`}
                </div>
                <div className="hero-amount" style={{ fontSize: 40 }}>{fmt(Math.abs(net))}</div>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="grid2">
        <a href={`#/add?owe=${g.id}`} className="btn primary">
          <Icon name="plus" /> Add entry
        </a>
        <button className="btn" disabled={net === 0} onClick={() => setSettleOpen(true)}>
          <Icon name="check" /> Settle up
        </button>
      </div>
      <button
        className="btn ghost block"
        disabled={!meId}
        onClick={() => meId && void shareText(friendSummary(g, meId, g.code ? inviteLink(g.code) : undefined))}
      >
        <Icon name="share" /> Share balance on WhatsApp
      </button>

      {net > 0 && (
        <button
          className="btn block"
          onClick={() =>
            void shareText(
              `Hi ${theirName}, a small reminder: you owe me ${fmt(net)}.` +
                (s.settings.upiId ? `\nYou can pay by UPI to: ${s.settings.upiId}` : '') +
                '\nThanks!',
            )
          }
        >
          💬 Send a payment reminder
        </button>
      )}

      <History g={g} meId={meId} theirName={theirName} />

      <button
        className="btn danger block"
        onClick={() => {
          if (window.confirm(`Remove ${theirName} from this phone? Your friend keeps their copy if it is synced.`)) {
            leaveGroup(g.id);
            go('/khata');
          }
        }}
      >
        Remove from this phone
      </button>

      {settleOpen && meId && other && (
        <SettleSheet g={g} meId={meId} other={other} net={net} theirName={theirName} onClose={() => setSettleOpen(false)} />
      )}
      <InviteSheet g={g} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <Sheet open={!meId} onClose={() => {}} title="Which one are you?">
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            Pick your name so Khata can tell who owes whom from your side.
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
        </div>
      </Sheet>
    </div>
  );
}

function History({ g, meId, theirName }: { g: Group; meId?: string; theirName: string }) {
  type Item = { kind: 'e' | 'p'; id: string; date: string; at: number };
  const items: Item[] = [
    ...activeExpenses(g).map((e) => ({ kind: 'e' as const, id: e.id, date: e.date, at: e.updatedAt })),
    ...activePayments(g).map((p) => ({ kind: 'p' as const, id: p.id, date: p.date, at: p.updatedAt })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);

  if (items.length === 0) {
    return (
      <Empty
        emoji="📒"
        title="Nothing written down yet"
        text={`Tap Add entry when you pay for ${theirName} or they pay for you.`}
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
                const effect = meId ? (p.from === meId ? p.amountPaise : p.to === meId ? -p.amountPaise : 0) : 0;
                return (
                  <button
                    key={it.id}
                    className="item"
                    onClick={() => {
                      if (window.confirm('Delete this settlement? If you recorded it in an account, that entry is removed too.')) {
                        deletePayment(g.id, p.id);
                        removeKhataPaymentTxs(g.id, p.id);
                      }
                    }}
                  >
                    <span className="bubble lemon">💸</span>
                    <span className="grow">
                      <span style={{ display: 'block', fontWeight: 700 }}>
                        {memberName(g, p.from)} paid {memberName(g, p.to)}
                      </span>
                      <span className="muted small">Settled up</span>
                    </span>
                    <span className="num">{fmt(p.amountPaise)}</span>
                    <span className="sr-only">{effect}</span>
                  </button>
                );
              }
              const e = g.expenses.find((x) => x.id === it.id)!;
              const mine = meId ? (e.paidBy[meId] ?? 0) - (owedShares(e)[meId] ?? 0) : 0;
              const payers = Object.keys(e.paidBy).map((m) => memberName(g, m)).join(' + ');
              return (
                <button
                  key={it.id}
                  className="item"
                  onClick={() => {
                    if (window.confirm('Delete this entry?')) {
                      deleteGroupExpense(g.id, e.id);
                      unlinkKhataExpense(g.id, e.id);
                    }
                  }}
                >
                  <span className="bubble">{mine >= 0 ? '↗️' : '↙️'}</span>
                  <span className="grow">
                    <span className="ellipsis" style={{ display: 'block', fontWeight: 700 }}>{e.title}</span>
                    <span className="muted small ellipsis" style={{ display: 'block' }}>
                      {payers} paid {fmt(e.amountPaise)}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span className={`num ${mine >= 0 ? 'pos' : 'neg'}`} style={{ display: 'block' }}>
                      {mine >= 0 ? '+' : '-'}
                      {fmt(Math.abs(mine))}
                    </span>
                    <span className="small muted">{mine >= 0 ? 'you lent' : 'you borrowed'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="muted small center" style={{ margin: 0 }}>Tap an entry to delete it.</p>
    </>
  );
}

function SettleSheet({
  g,
  meId,
  other,
  net,
  theirName,
  onClose,
}: {
  g: Group;
  meId: string;
  other: Member;
  net: number;
  theirName: string;
  onClose: () => void;
}) {
  const s = useAppState();
  const accounts = s.accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [amt, setAmt] = useState(toInput(Math.abs(net)));
  const paise = parseAmount(amt) ?? 0;
  const max = Math.abs(net);
  const otherId = other.id;
  const iPay = net < 0;
  const [upiInput, setUpiInput] = useState('');
  const problem = paise <= 0 ? 'Enter an amount.' : paise > max ? `The balance is only ${fmt(max)}.` : '';

  const record = () => {
    if (problem) return;
    const paymentId = savePayment(g.id, {
      from: iPay ? meId : otherId,
      to: iPay ? otherId : meId,
      amountPaise: paise,
      date: today(),
    });
    // One tap: also move the money in the chosen account, without counting it as income or spending.
    if (accountId) {
      saveTx({
        type: iPay ? 'expense' : 'income',
        amountPaise: paise,
        category: 'Khata',
        accountId,
        date: today(),
        note: iPay ? `Paid ${theirName}` : `${theirName} paid back`,
        necessary: true,
        internal: true,
        khata: { groupId: g.id, paymentId },
      });
    }
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title="Settle up">
      <div className="stack">
        <p style={{ margin: 0, fontWeight: 600 }}>
          {iPay ? `You paid ${theirName}` : `${theirName} paid you`}
        </p>
        <label className="field">
          <span>Amount (₹)</span>
          <input
            className="input"
            inputMode="decimal"
            value={amt}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setAmt(v);
            }}
          />
        </label>
        <label className="field">
          <span>{iPay ? 'Paid from which account?' : 'Money received in which account?'}</span>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="">Do not record in an account</option>
          </select>
        </label>
        {iPay && !problem && (
          other.upi ? (
            <button
              className="btn block"
              onClick={() => {
                window.location.href = upiLink({ upi: other.upi!, name: theirName, paise, note: 'Kharcha settle up' });
              }}
            >
              Pay {fmt(paise)} with UPI
            </button>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <label className="field">
                <span>{theirName}'s UPI ID (to pay from here)</span>
                <input
                  className="input"
                  placeholder="name@bank"
                  autoCapitalize="none"
                  value={upiInput}
                  onChange={(e) => setUpiInput(e.target.value.trim())}
                />
              </label>
              <button
                className="btn"
                disabled={!looksLikeUpi(upiInput)}
                onClick={() => updateMember(g.id, other.id, { upi: upiInput })}
              >
                Save UPI ID
              </button>
            </div>
          )
        )}
        {iPay && other.upi && (
          <p className="muted small" style={{ margin: 0 }}>
            Your UPI app opens with the amount filled in. After you pay, come back and tap Record payment.
          </p>
        )}
        <p className="muted small" style={{ margin: 0 }}>
          Part of the amount is fine. The rest stays on the balance.
        </p>
        {problem && <div className="notice">{problem}</div>}
        <button className="btn primary block" disabled={Boolean(problem)} onClick={record}>
          <Icon name="check" /> Record payment
        </button>
      </div>
    </Sheet>
  );
}
