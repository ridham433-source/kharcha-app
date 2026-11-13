import { useRef, useState, type ReactNode } from 'react';
import {
  deleteGoal,
  getState,
  removeAccount,
  replaceAll,
  resetAll,
  saveAccount,
  saveGoal,
  setBudget,
  updateSettings,
  useAppState,
} from '../lib/store';
import { EXPENSE_CATS } from '../lib/categories';
import { fmt, parseAmount, toInput } from '../lib/money';
import { accountBalance } from '../lib/derive';
import { download, today, uid } from '../lib/util';
import { looksLikeUpi, reminderIcs } from '../lib/report';
import { cloudConfig, testCloud } from '../lib/cloud';
import { Icon, TopBar } from '../components/ui';
import type { Account, AppState, Goal } from '../lib/types';

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="card stack">
      <div>
        <h2>{title}</h2>
        {note && <p className="muted small" style={{ margin: '4px 0 0' }}>{note}</p>}
      </div>
      {children}
    </section>
  );
}

const ACCOUNT_COLORS = ['#067647', '#1F3FFF', '#C8261B', '#7C3AED', '#0891B2', '#EA580C'];

export default function More() {
  const s = useAppState();

  return (
    <div className="page stack">
      <TopBar title="Profile and settings" showBack={false} />

      <Section title="You">
        <label className="field">
          <span>Your name</span>
          <input
            className="input"
            value={s.settings.userName}
            onChange={(e) => updateSettings({ userName: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Your UPI ID (for payment reminders)</span>
          <input
            className="input"
            placeholder="name@okhdfcbank"
            autoCapitalize="none"
            value={s.settings.upiId}
            onChange={(e) => updateSettings({ upiId: e.target.value.trim() })}
          />
          {s.settings.upiId && !looksLikeUpi(s.settings.upiId) && (
            <span className="muted small">This does not look like a UPI ID. It should look like name@bank.</span>
          )}
        </label>
      </Section>

      <Section title="Automatic and reports">
        <a href="#/repeat" className="btn block">🔁 Repeating expenses (subscriptions, SIP, rent)</a>
        <a href="#/report" className="btn block">📋 Monthly report card</a>
      </Section>

      <ReminderSection />
      <BudgetSection />
      <AccountSection />
      <GoalSection />

      <Section title="Splitter" note="Use Splitter to avoid bitter.">
        <label className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            style={{ width: 26, height: 26 }}
            checked={s.settings.includeGroupShare}
            onChange={(e) => updateSettings({ includeGroupShare: e.target.checked })}
          />
          <span className="grow">
            <b>Count my group share in daily spending</b>
            <span className="muted small" style={{ display: 'block' }}>
              Your share of each Splitter expense shows in Activity, Insights and budgets, even when a friend paid.
            </span>
          </span>
        </label>
      </Section>

      <CloudSection />
      <DataSection />
    </div>
  );
}

/* ---------------- budgets ---------------- */

function BudgetRow({ id, label }: { id: string; label: string }) {
  const s = useAppState();
  const [v, setV] = useState(s.budgets[id] ? toInput(s.budgets[id]) : '');
  return (
    <label className="row">
      <span className="grow" style={{ fontWeight: 600 }}>{label}</span>
      <input
        className="input"
        style={{ width: 130 }}
        inputMode="decimal"
        placeholder="No limit"
        aria-label={`Monthly budget for ${label}`}
        value={v}
        onChange={(e) => {
          if (e.target.value === '' || /^\d*\.?\d{0,2}$/.test(e.target.value)) setV(e.target.value);
        }}
        onBlur={() => setBudget(id, parseAmount(v) ?? 0)}
      />
    </label>
  );
}

function BudgetSection() {
  return (
    <Section title="Monthly budget" note="Leave a field empty for no limit. Saved when you leave the field.">
      <BudgetRow id="_total" label="Total for the month" />
      <h3>By category</h3>
      {EXPENSE_CATS.map((c) => (
        <BudgetRow key={c.id} id={c.id} label={`${c.emoji} ${c.id}`} />
      ))}
    </Section>
  );
}

/* ---------------- accounts ---------------- */

function AccountRow({ a }: { a: Account }) {
  const s = useAppState();
  const [name, setName] = useState(a.name);
  const [open, setOpen] = useState(toInput(a.openingPaise));
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="row" style={{ gap: 8 }}>
          <span className="dot" style={{ background: a.color }} />
          <b>{fmt(accountBalance(s, a.id))}</b>
        </span>
        <button
          className="btn small danger"
          onClick={() => {
            if (window.confirm(`Remove ${a.name}? Transactions keep their history.`)) removeAccount(a.id);
          }}
        >
          Remove
        </button>
      </div>
      <div className="grid2">
        <label className="field">
          <span>Name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && saveAccount({ ...a, name: name.trim() })}
          />
        </label>
        <label className="field">
          <span>Opening balance</span>
          <input
            className="input"
            inputMode="decimal"
            value={open}
            onChange={(e) => {
              if (e.target.value === '' || /^-?\d*\.?\d{0,2}$/.test(e.target.value)) setOpen(e.target.value);
            }}
            onBlur={() => saveAccount({ ...a, openingPaise: parseAmount(open) ?? 0 })}
          />
        </label>
      </div>
    </div>
  );
}

function AccountSection() {
  const s = useAppState();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Account['kind']>('bank');
  const [opening, setOpening] = useState('');

  const add = () => {
    if (!name.trim()) return;
    saveAccount({
      id: uid(),
      name: name.trim(),
      kind,
      openingPaise: parseAmount(opening) ?? 0,
      color: ACCOUNT_COLORS[s.accounts.length % ACCOUNT_COLORS.length],
    });
    setName('');
    setOpening('');
  };

  return (
    <Section title="Accounts" note="Cash, bank accounts, UPI apps and cards.">
      {s.accounts.filter((a) => !a.archived).map((a) => (
        <AccountRow key={a.id} a={a} />
      ))}
      <h3>Add an account</h3>
      <div className="grid2">
        <input className="input" aria-label="Account name" placeholder="e.g. HDFC Bank" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input" aria-label="Account type" value={kind} onChange={(e) => setKind(e.target.value as Account['kind'])}>
          <option value="bank">Bank</option>
          <option value="cash">Cash</option>
          <option value="upi">UPI app</option>
          <option value="card">Card</option>
          <option value="wallet">Wallet</option>
        </select>
      </div>
      <input className="input" aria-label="Opening balance" inputMode="decimal" placeholder="Current balance (₹)" value={opening} onChange={(e) => (e.target.value === '' || /^\d*\.?\d{0,2}$/.test(e.target.value)) && setOpening(e.target.value)} />
      <button className="btn primary block" disabled={!name.trim()} onClick={add}>
        Add account
      </button>
    </Section>
  );
}

/* ---------------- goals ---------------- */

function GoalRow({ g }: { g: Goal }) {
  const [add, setAdd] = useState('');
  const pct = g.targetPaise > 0 ? Math.min(100, Math.round((g.savedPaise / g.targetPaise) * 100)) : 0;
  const addMoney = () => {
    const p = parseAmount(add);
    if (!p) return;
    saveGoal({ ...g, savedPaise: g.savedPaise + p });
    setAdd('');
  };
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between">
        <b>{g.name}</b>
        <button className="icon-btn plain" aria-label={`Delete goal ${g.name}`} onClick={() => window.confirm('Delete this goal?') && deleteGoal(g.id)}>
          <Icon name="trash" size={20} />
        </button>
      </div>
      <div className="bar big" style={{ margin: '8px 0' }}>
        <i style={{ width: `${pct}%`, background: 'var(--blue)' }} />
      </div>
      <div className="row between small" style={{ fontWeight: 600 }}>
        <span>{fmt(g.savedPaise)} saved</span>
        <span className="muted">
          {pct}% of {fmt(g.targetPaise)}
        </span>
      </div>
      {g.deadline && <div className="muted small">By {g.deadline}</div>}
      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" inputMode="decimal" aria-label={`Add savings to ${g.name}`} placeholder="Add money (₹)" value={add} onChange={(e) => (e.target.value === '' || /^\d*\.?\d{0,2}$/.test(e.target.value)) && setAdd(e.target.value)} />
        <button className="btn primary" disabled={!parseAmount(add)} onClick={addMoney}>
          Add
        </button>
      </div>
    </div>
  );
}

function GoalSection() {
  const s = useAppState();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');

  return (
    <Section title="Savings goals">
      {s.goals.map((g) => (
        <GoalRow key={g.id} g={g} />
      ))}
      <h3>New goal</h3>
      <input className="input" aria-label="Goal name" placeholder="Trip to Japan" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid2">
        <input className="input" aria-label="Target amount" inputMode="decimal" placeholder="Target (₹)" value={target} onChange={(e) => (e.target.value === '' || /^\d*\.?\d{0,2}$/.test(e.target.value)) && setTarget(e.target.value)} />
        <input className="input" aria-label="Deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </div>
      <button
        className="btn primary block"
        disabled={!name.trim() || !parseAmount(target)}
        onClick={() => {
          saveGoal({ id: uid(), name: name.trim(), targetPaise: parseAmount(target) ?? 0, savedPaise: 0, deadline: deadline || undefined });
          setName('');
          setTarget('');
          setDeadline('');
        }}
      >
        Add goal
      </button>
    </Section>
  );
}

/* ---------------- cloud ---------------- */

function CloudSection() {
  const s = useAppState();
  const [url, setUrl] = useState(s.settings.cloudUrl);
  const [key, setKey] = useState(s.settings.cloudKey);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const active = cloudConfig();

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await testCloud(url.trim(), key.trim());
      updateSettings({ cloudUrl: url.trim(), cloudKey: key.trim() });
      setMsg({ ok: true, text: 'Connected. Shared groups are ready.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not connect.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Cloud sync for Splitter"
      note="Optional and free. Lets friends join a group by link and add expenses from their own phones. Steps are in the README."
    >
      {active && !s.settings.cloudUrl && (
        <div className="notice">Cloud sync is already set up for this app.</div>
      )}
      <label className="field">
        <span>Project URL</span>
        <input className="input" placeholder="https://xxxx.supabase.co" autoCapitalize="none" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <label className="field">
        <span>Public (anon) key</span>
        <input className="input" placeholder="eyJ… or sb_publishable_…" autoCapitalize="none" value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      {msg && <div className={`notice${msg.ok ? '' : ' bad'}`}>{msg.text}</div>}
      <div className="row">
        <button className="btn primary grow" disabled={!url.trim() || !key.trim() || busy} onClick={test}>
          {busy ? 'Checking…' : 'Save and test'}
        </button>
        {s.settings.cloudUrl && (
          <button
            className="btn ghost"
            onClick={() => {
              updateSettings({ cloudUrl: '', cloudKey: '' });
              setUrl('');
              setKey('');
              setMsg(null);
            }}
          >
            Clear
          </button>
        )}
      </div>
    </Section>
  );
}

/* ---------------- backup ---------------- */

function csvCell(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const exportJson = () => {
    const state = getState();
    // Do not put the cloud key into a backup file people might share.
    const safe: AppState = { ...state, settings: { ...state.settings, cloudKey: '', cloudUrl: '' } };
    download(`kharcha-backup-${today()}.json`, JSON.stringify(safe, null, 2));
  };

  const exportCsv = () => {
    const st = getState();
    const rows = [['Date', 'Type', 'Category', 'Account', 'Note', 'Amount', 'Needed', 'Owed by friend', 'Khata settlement']];
    for (const t of [...st.txs].sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([
        t.date,
        t.type,
        t.category,
        st.accounts.find((a) => a.id === t.accountId)?.name ?? '',
        t.note,
        (t.amountPaise / 100).toFixed(2),
        t.type === 'expense' ? (t.necessary ? 'yes' : 'no') : '',
        t.sharedPaise ? (t.sharedPaise / 100).toFixed(2) : '',
        t.internal ? 'yes' : '',
      ]);
    }
    download(`kharcha-transactions-${today()}.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Partial<AppState>;
      if (!Array.isArray(data.accounts) || !Array.isArray(data.txs)) throw new Error('shape');
      if (!window.confirm('Replace everything on this phone with this backup?')) return;
      const cur = getState();
      replaceAll({
        ...cur,
        ...(data as AppState),
        settings: { ...cur.settings, ...(data.settings ?? {}), cloudUrl: cur.settings.cloudUrl, cloudKey: cur.settings.cloudKey },
      });
      setMsg({ ok: true, text: 'Backup restored.' });
    } catch {
      setMsg({ ok: false, text: 'That file is not a Kharcha backup.' });
    }
  };

  return (
    <Section title="Your data" note="Everything is stored on this phone. Back it up now and then.">
      {msg && <div className={`notice${msg.ok ? '' : ' bad'}`}>{msg.text}</div>}
      <button className="btn block" onClick={exportJson}>
        Download backup
      </button>
      <button className="btn block" onClick={exportCsv}>
        Export transactions as CSV
      </button>
      <button className="btn block" onClick={() => fileRef.current?.click()}>
        Restore from backup
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importJson(f);
          e.target.value = '';
        }}
      />
      <button
        className="btn danger block"
        onClick={() => {
          if (window.confirm('Delete all data on this phone? This cannot be undone.')) resetAll();
        }}
      >
        Delete all data
      </button>
    </Section>
  );
}

/* ---------------- daily reminder ---------------- */

function ReminderSection() {
  const s = useAppState();
  return (
    <Section title="Daily reminder" note="A prompt on the home screen after this time if you have not added anything today.">
      <label className="row" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          style={{ width: 26, height: 26 }}
          checked={s.settings.reminderOn}
          onChange={(e) => updateSettings({ reminderOn: e.target.checked })}
        />
        <b className="grow">Remind me to add today's expenses</b>
      </label>
      <label className="field">
        <span>Time</span>
        <input
          className="input"
          type="time"
          value={s.settings.reminderTime}
          onChange={(e) => e.target.value && updateSettings({ reminderTime: e.target.value })}
        />
      </label>
      <button
        className="btn block"
        onClick={() => download('kharcha-daily-reminder.ics', reminderIcs(s.settings.reminderTime), 'text/calendar')}
      >
        Also remind me on my phone
      </button>
      <p className="muted small" style={{ margin: 0 }}>
        The home prompt only shows when you open the app. The button above adds a daily alarm to your phone's
        calendar so you get a real notification. If it does not open, set a repeating alarm in your Clock app.
      </p>
    </Section>
  );
}
