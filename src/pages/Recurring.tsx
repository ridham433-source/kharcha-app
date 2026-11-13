import { useState } from 'react';
import { deleteRecurring, saveRecurring, useAppState } from '../lib/store';
import { EXPENSE_CATS, INCOME_CATS, catEmoji } from '../lib/categories';
import { fmt, parseAmount, toInput } from '../lib/money';
import { nextDate, repeatLabel } from '../lib/recurring';
import { shortDate, today } from '../lib/util';
import { Empty, Icon, Segmented, Sheet, TopBar } from '../components/ui';
import type { Recurring, Repeat, TxType } from '../lib/types';

export default function RecurringPage() {
  const s = useAppState();
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  const t = today();
  const list = [...s.recurring].sort((a, b) => nextDate(a, t).localeCompare(nextDate(b, t)));

  return (
    <div className="page no-nav stack" style={{ paddingBottom: 120 }}>
      <TopBar title="Repeating expenses" />
      <p className="muted" style={{ margin: 0 }}>
        Add subscriptions, SIPs, rent and EMIs once. They are written down by themselves on the due date, the next
        time you open the app.
      </p>

      <button className="btn primary block" onClick={() => setEditing('new')}>
        <Icon name="plus" /> Add repeating expense
      </button>

      {list.length === 0 ? (
        <Empty emoji="🔁" title="Nothing repeating yet" text="Try Netflix, rent, a SIP or your phone recharge." />
      ) : (
        <div className="card flush list">
          {list.map((r) => (
            <button key={r.id} className="item" onClick={() => setEditing(r)}>
              <span className="bubble">{catEmoji(r.category)}</span>
              <span className="grow">
                <span className="ellipsis" style={{ display: 'block', fontWeight: 700 }}>{r.note || r.category}</span>
                <span className="muted small" style={{ display: 'block' }}>
                  {repeatLabel(r)}
                  {r.paused ? ' · Paused' : ` · Next ${shortDate(nextDate(r, t))}`}
                </span>
              </span>
              <span className={`num ${r.type === 'income' ? 'pos' : 'neg'}`}>
                {r.type === 'income' ? '+' : '-'}
                {fmt(r.amountPaise)}
              </span>
            </button>
          ))}
        </div>
      )}

      {editing && <RuleSheet rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleSheet({ rule, onClose }: { rule?: Recurring; onClose: () => void }) {
  const s = useAppState();
  const accounts = s.accounts.filter((a) => !a.archived);
  const [type, setType] = useState<TxType>(rule?.type ?? 'expense');
  const [amt, setAmt] = useState(rule ? toInput(rule.amountPaise) : '');
  const [note, setNote] = useState(rule?.note ?? '');
  const [category, setCategory] = useState(rule?.category ?? 'Subscriptions');
  const [accountId, setAccountId] = useState(rule ? (rule.accountId ?? '') : (accounts[0]?.id ?? ''));
  const [repeat, setRepeat] = useState<Repeat>(rule?.repeat ?? 'monthly');
  const [start, setStart] = useState(rule?.startDate ?? today());
  const [paused, setPaused] = useState(rule?.paused ?? false);

  const paise = parseAmount(amt) ?? 0;
  const cats = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const problem = paise <= 0 ? 'Enter an amount.' : !note.trim() ? 'Give it a name, like Netflix.' : !start ? 'Pick the first date.' : '';

  const save = () => {
    if (problem) return;
    // Changing the date or the repeat restarts the schedule; the amount and name can change freely.
    const scheduleChanged = rule && (rule.startDate !== start || rule.repeat !== repeat);
    saveRecurring({
      id: rule?.id,
      type,
      amountPaise: paise,
      category,
      accountId: accountId || null,
      note: note.trim(),
      necessary: true,
      repeat,
      startDate: start,
      lastDate: scheduleChanged ? undefined : rule?.lastDate,
      paused,
    });
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={rule ? 'Edit repeating expense' : 'New repeating expense'}>
      <div className="stack">
        <Segmented
          options={[
            { id: 'expense', label: 'Expense' },
            { id: 'income', label: 'Income' },
          ]}
          value={type}
          onChange={(v) => {
            setType(v);
            setCategory(v === 'income' ? 'Salary' : 'Subscriptions');
          }}
        />
        <label className="field">
          <span>Name</span>
          <input className="input" placeholder="Netflix, SIP, Rent" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="field">
          <span>Amount (₹)</span>
          <input
            className="input"
            inputMode="decimal"
            placeholder="0"
            value={amt}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setAmt(v);
            }}
          />
        </label>
        <label className="field">
          <span>Category</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.emoji} {c.id}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{type === 'income' ? 'Money comes into' : 'Money goes out of'}</span>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
            <option value="">No account</option>
          </select>
        </label>
        <div className="field">
          <span>How often</span>
          <Segmented
            options={[
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'yearly', label: 'Yearly' },
            ]}
            value={repeat}
            onChange={setRepeat}
          />
        </div>
        <label className="field">
          <span>First date</span>
          <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <p className="muted small" style={{ margin: 0 }}>
          {start ? repeatLabel({ repeat, startDate: start }) : ''}. If the date is today or earlier, it is added right away.
        </p>
        {rule && (
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 26, height: 26 }} checked={paused} onChange={(e) => setPaused(e.target.checked)} />
            <span className="grow"><b>Pause</b> <span className="muted small">(stop adding for now)</span></span>
          </label>
        )}
        {problem && <div className="notice">{problem}</div>}
        <button className="btn primary block" disabled={Boolean(problem)} onClick={save}>
          <Icon name="check" /> Save
        </button>
        {rule && (
          <button
            className="btn danger block"
            onClick={() => {
              if (window.confirm('Stop this repeating expense? Entries already added stay in your history.')) {
                deleteRecurring(rule.id);
                onClose();
              }
            }}
          >
            Stop repeating
          </button>
        )}
      </div>
    </Sheet>
  );
}
