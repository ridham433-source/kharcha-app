import { useMemo, useState } from 'react';
import { useAppState } from '../lib/store';
import { entries, monthStats } from '../lib/derive';
import { fmt } from '../lib/money';
import { catEmoji } from '../lib/categories';
import { monthKey, monthLabel, shiftMonth, today } from '../lib/util';
import { Empty, MonthSwitch } from '../components/ui';
import TxRow from '../components/TxRow';

const BAR_COLORS = ['#1F3FFF', '#FFD60A', '#067647', '#C8261B', '#7C3AED', '#0891B2', '#EA580C', '#475467'];

export default function Insights() {
  const s = useAppState();
  const all = useMemo(() => entries(s), [s]);
  const [key, setKey] = useState(monthKey(today()));

  const st = useMemo(() => monthStats(all, key), [all, key]);
  const prev = useMemo(() => monthStats(all, shiftMonth(key, -1)), [all, key]);

  const saved = st.income - st.spent;
  const rate = st.income > 0 ? Math.round((saved / st.income) * 100) : null;
  const known = st.necessary + st.unnecessary;
  const needPct = known > 0 ? Math.round((st.necessary / known) * 100) : null;

  const cats = Object.entries(st.byCategory).sort((a, b) => b[1] - a[1]);
  const maxDay = Math.max(...st.daily, 1);
  const isThisMonth = key === monthKey(today());
  const todayIdx = Number(today().slice(8, 10)) - 1;
  const daysPassed = isThisMonth ? todayIdx + 1 : st.daily.length;
  const avgPerDay = Math.round(st.spent / Math.max(daysPassed, 1));

  const diff = st.spent - prev.spent;

  if (st.count === 0) {
    return (
      <div className="page stack">
        <MonthSwitch
          label={monthLabel(key)}
          onPrev={() => setKey(shiftMonth(key, -1))}
          onNext={() => setKey(shiftMonth(key, 1))}
          nextDisabled={isThisMonth}
        />
        <Empty
          emoji="📊"
          title="No data for this month"
          text="Add a few expenses and your insights will show up here."
        />
      </div>
    );
  }

  return (
    <div className="page stack">
      <MonthSwitch
        label={monthLabel(key)}
        onPrev={() => setKey(shiftMonth(key, -1))}
        onNext={() => setKey(shiftMonth(key, 1))}
        nextDisabled={isThisMonth}
      />

      <div className="stat-grid">
        <div className="stat">
          <span className="muted small">Spent</span>
          <b className="num neg">{fmt(st.spent)}</b>
        </div>
        <div className="stat">
          <span className="muted small">Income</span>
          <b className="num pos">{fmt(st.income)}</b>
        </div>
        <div className="stat">
          <span className="muted small">Saved</span>
          <b className={`num ${saved >= 0 ? 'pos' : 'neg'}`}>{fmt(saved)}</b>
        </div>
        <div className="stat">
          <span className="muted small">Savings rate</span>
          <b className="num">{rate === null ? 'No income' : `${rate}%`}</b>
        </div>
      </div>

      {prev.spent > 0 && (
        <div className="notice">
          {diff === 0
            ? 'You spent the same as last month.'
            : diff > 0
              ? `You spent ${fmt(diff)} more than last month.`
              : `You spent ${fmt(-diff)} less than last month. Nice.`}
        </div>
      )}

      <section className="card">
        <h2>Needed vs could skip</h2>
        {needPct === null ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Mark each expense as needed or could skip when you add it and your discipline score will appear here.
          </p>
        ) : (
          <>
            <div className="row between" style={{ margin: '10px 0 8px' }}>
              <span className="num" style={{ fontSize: 34 }}>{needPct}%</span>
              <span className="muted small" style={{ textAlign: 'right' }}>
                of your tracked spending
                <br />
                was needed
              </span>
            </div>
            <div className="bar big">
              <i style={{ width: `${needPct}%`, background: 'var(--green)' }} />
              <i style={{ width: `${100 - needPct}%`, background: 'var(--red)' }} />
            </div>
            <div className="row between small" style={{ marginTop: 8, fontWeight: 600 }}>
              <span className="pos">Needed {fmt(st.necessary)}</span>
              <span className="neg">Could skip {fmt(st.unnecessary)}</span>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 12 }}>Where it went</h2>
        <div className="stack" style={{ gap: 14 }}>
          {cats.map(([cat, v], i) => {
            const limit = s.budgets[cat];
            return (
              <div key={cat}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 700 }}>
                    {catEmoji(cat)} {cat}
                  </span>
                  <span className="num">{fmt(v)}</span>
                </div>
                <div className="bar">
                  <i
                    style={{
                      width: `${Math.max(2, Math.round((v / st.spent) * 100))}%`,
                      background: BAR_COLORS[i % BAR_COLORS.length],
                    }}
                  />
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  {Math.round((v / st.spent) * 100)}% of spending
                  {limit ? ` · ${v > limit ? `${fmt(v - limit)} over` : `${fmt(limit - v)} left`} of ${fmt(limit)}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2>Day by day</h2>
          <span className="muted small">Avg {fmt(avgPerDay)} a day</span>
        </div>
        <div className="daily" role="img" aria-label="Spending for each day of the month">
          {st.daily.map((v, i) => (
            <i
              key={i}
              className={v === 0 ? 'zero' : isThisMonth && i === todayIdx ? 'today' : ''}
              style={{ height: v === 0 ? 3 : `${Math.max(4, (v / maxDay) * 100)}%` }}
              title={`Day ${i + 1}: ${fmt(v)}`}
            />
          ))}
        </div>
        <div className="row between muted small" style={{ marginTop: 6 }}>
          <span>1</span>
          <span>{st.daily.length}</span>
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: 10 }}>Biggest expenses</h2>
        <div className="card flush list">
          {st.biggest.map((e) => (
            <TxRow key={e.id} e={e} />
          ))}
        </div>
      </section>
    </div>
  );
}
