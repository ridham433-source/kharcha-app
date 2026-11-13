import { useMemo } from 'react';
import { updateSettings, useAppState } from '../lib/store';
import { nextDate } from '../lib/recurring';
import { reminderDue } from '../lib/report';
import { accountBalance, entries, monthStats, myBalance } from '../lib/derive';
import { fmt } from '../lib/money';
import { monthKey, monthLabel, shiftMonth, shortDate, today } from '../lib/util';
import { Icon } from '../components/ui';
import TxRow from '../components/TxRow';
import { go } from '../lib/router';

export default function Home() {
  const s = useAppState();
  const all = useMemo(() => entries(s), [s]);
  const key = monthKey(today());
  const st = useMemo(() => monthStats(all, key), [all, key]);

  const todaySpent = all
    .filter((e) => e.date === today() && e.type === 'expense')
    .reduce((sum, e) => sum + e.counted, 0);

  const total = s.budgets._total ?? 0;
  const left = total - st.spent;
  const pct = total > 0 ? Math.min(100, Math.round((st.spent / total) * 100)) : 0;

  let owed = 0;
  let owe = 0;
  let kOwed = 0;
  let kOwe = 0;
  for (const g of s.groups) {
    const b = myBalance(s, g);
    if (g.kind === 'friend') {
      if (b > 0) kOwed += b;
      else kOwe += -b;
    } else if (b > 0) owed += b;
    else owe += -b;
  }
  const hasTrips = s.groups.some((g) => g.kind !== 'friend');
  const hasFriends = s.groups.some((g) => g.kind === 'friend');

  const t = today();
  const now = new Date();
  const showReminder = reminderDue({
    on: s.settings.reminderOn,
    time: s.settings.reminderTime,
    doneDate: s.settings.reminderDoneDate,
    hasEntryToday: s.txs.some((x) => x.date === t && !x.recurringId && !x.internal),
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
    todayStr: t,
  });
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;
  const upcoming = s.recurring
    .filter((r) => !r.paused)
    .map((r) => ({ r, date: nextDate(r, t) }))
    .filter((x) => x.date <= weekEndStr && x.date > t)
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastMonth = shiftMonth(key, -1);
  const showReport = Number(t.slice(8, 10)) <= 7 && all.some((e) => monthKey(e.date) === lastMonth);

  const accounts = s.accounts.filter((a) => !a.archived);
  const recent = all.slice(0, 5);

  return (
    <div className="page stack">
      <div className="row between">
        <div>
          <h1>Hi, {s.settings.userName || 'there'}</h1>
          <div className="muted">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <a href="#/more" className="icon-btn" aria-label="Profile and settings">
          <Icon name="user" />
        </a>
      </div>

      {showReminder && (
        <section className="card lemon">
          <b>Did you spend anything today?</b>
          <div className="grid2" style={{ marginTop: 10 }}>
            <a href="#/add" className="btn primary">Add expense</a>
            <button className="btn" onClick={() => updateSettings({ reminderDoneDate: t })}>
              Nothing today
            </button>
          </div>
        </section>
      )}

      {showReport && (
        <a href={`#/report?m=${lastMonth}`} className="card soft" style={{ display: 'block' }}>
          <b>Your {monthLabel(lastMonth).split(' ')[0]} report card is ready</b>
          <div className="muted small">See how last month went</div>
        </a>
      )}

      <section className="card blue">
        <div style={{ opacity: 0.9, fontWeight: 600 }}>Spent in {monthLabel(key)}</div>
        <div className="hero-amount" style={{ margin: '6px 0 14px' }}>
          {fmt(st.spent)}
        </div>
        <div className="row between" style={{ fontWeight: 600 }}>
          <span>Today {fmt(todaySpent)}</span>
          <span>Income {fmt(st.income)}</span>
        </div>
        {total > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div className="bar big" style={{ background: 'rgba(255,255,255,0.3)' }}>
              <i style={{ width: `${pct}%`, background: left < 0 ? '#FFB4A8' : '#FFD60A' }} />
            </div>
            <div style={{ marginTop: 8, fontWeight: 700 }}>
              {left >= 0 ? `${fmt(left)} left of ${fmt(total)}` : `${fmt(-left)} over your ${fmt(total)} budget`}
            </div>
          </div>
        ) : (
          <button
            className="btn small"
            style={{ marginTop: 14, background: '#fff', borderColor: '#fff' }}
            onClick={() => go('/more')}
          >
            Set a monthly budget
          </button>
        )}
      </section>

      <section>
        <div className="card-title">
          <h2>Accounts</h2>
          <button className="link-btn" onClick={() => go('/more')}>
            Manage
          </button>
        </div>
        <div className="hscroll">
          {accounts.map((a) => (
            <div key={a.id} className="acc-card">
              <div className="row" style={{ gap: 8 }}>
                <span className="dot" style={{ background: a.color }} />
                <span className="muted small ellipsis">{a.name}</span>
              </div>
              <div className="num">{fmt(accountBalance(s, a.id))}</div>
            </div>
          ))}
        </div>
      </section>

      {upcoming.length > 0 && (
        <section className="card flush list">
          {upcoming.map(({ r, date }) => (
            <a key={r.id} href="#/repeat" className="item">
              <span className="bubble">🔁</span>
              <span className="grow">
                <b className="ellipsis" style={{ display: 'block' }}>{r.note || r.category}</b>
                <span className="muted small">Coming up {shortDate(date)}</span>
              </span>
              <span className="num">{fmt(r.amountPaise)}</span>
            </a>
          ))}
        </section>
      )}

      <section className="card lemon">
        <div className="row between">
          <div>
            <h2>Splitter</h2>
            <div className="tagline">Use Splitter to avoid bitter</div>
          </div>
          <a href="#/splitter" className="btn small ink">
            Open
          </a>
        </div>
        {hasTrips && (
          <div className="row" style={{ marginTop: 14, gap: 24 }}>
            <div>
              <div className="small" style={{ fontWeight: 600 }}>You are owed</div>
              <div className="num" style={{ fontSize: 22 }}>{fmt(owed)}</div>
            </div>
            <div>
              <div className="small" style={{ fontWeight: 600 }}>You owe</div>
              <div className="num" style={{ fontSize: 22 }}>{fmt(owe)}</div>
            </div>
          </div>
        )}
      </section>

      <section className="card soft">
        <div className="row between">
          <div>
            <h2>Khata</h2>
            <div className="tagline">Never forget who owes whom</div>
          </div>
          <a href="#/khata" className="btn small primary">
            Open
          </a>
        </div>
        {hasFriends && (
          <div className="row" style={{ marginTop: 14, gap: 24 }}>
            <div>
              <div className="small" style={{ fontWeight: 600 }}>Owed to you</div>
              <div className="num pos" style={{ fontSize: 22 }}>{fmt(kOwed)}</div>
            </div>
            <div>
              <div className="small" style={{ fontWeight: 600 }}>You owe</div>
              <div className="num neg" style={{ fontSize: 22 }}>{fmt(kOwe)}</div>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="card-title">
          <h2>Recent</h2>
          <button className="link-btn" onClick={() => go('/activity')}>
            See all
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="card center muted">
            Nothing yet. Tap the + button to add your first expense.
          </div>
        ) : (
          <div className="card flush list">
            {recent.map((e) => (
              <TxRow key={e.id} e={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
