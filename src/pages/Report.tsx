import { useMemo, useState } from 'react';
import { useAppState } from '../lib/store';
import { entries } from '../lib/derive';
import { buildReport, reportText } from '../lib/report';
import { fmt } from '../lib/money';
import { catEmoji } from '../lib/categories';
import { monthKey, shiftMonth, shortDate, shareText, today } from '../lib/util';
import { Empty, Icon, MonthSwitch, TopBar } from '../components/ui';

export default function Report({ month }: { month?: string }) {
  const s = useAppState();
  const all = useMemo(() => entries(s), [s]);
  const now = monthKey(today());
  const [key, setKey] = useState(month ?? now);
  const r = useMemo(() => buildReport(all, key, s.budgets._total ?? 0), [all, key, s.budgets]);

  return (
    <div className="page no-nav stack" style={{ paddingBottom: 60 }}>
      <TopBar title="Report card" />
      <MonthSwitch
        label={r.label}
        onPrev={() => setKey(shiftMonth(key, -1))}
        onNext={() => setKey(shiftMonth(key, 1))}
        nextDisabled={key >= now}
      />

      {!r.hasData ? (
        <Empty emoji="🗒️" title="No data for this month" text="Add a few expenses and your report card will appear here." />
      ) : (
        <>
          <section className="card blue">
            <div style={{ fontWeight: 700, fontSize: 20 }}>{r.headline}</div>
            <div className="hero-amount" style={{ margin: '8px 0 4px' }}>{fmt(r.spent)}</div>
            <div style={{ opacity: 0.9 }}>
              {r.prevSpent > 0 ? `Last month: ${fmt(r.prevSpent)}` : 'No spending last month to compare with'}
            </div>
          </section>

          <div className="stat-grid">
            <div className="stat"><span className="muted small">Average per day</span><b className="num">{fmt(r.perDay)}</b></div>
            <div className="stat"><span className="muted small">No-spend days</span><b className="num">{r.noSpendDays}</b></div>
            <div className="stat"><span className="muted small">Income</span><b className="num pos">{fmt(r.income)}</b></div>
            {r.income > 0 ? (
              <div className="stat">
                <span className="muted small">{r.saved >= 0 ? 'Left over' : 'Overspent'}</span>
                <b className={`num ${r.saved >= 0 ? 'pos' : 'neg'}`}>{fmt(Math.abs(r.saved))}</b>
              </div>
            ) : (
              <div className="stat">
                <span className="muted small">Entries</span>
                <b className="num">{r.entries}</b>
              </div>
            )}
          </div>

          {r.topCategory && (
            <section className="card">
              <div className="muted small">Where most of it went</div>
              <div className="row between" style={{ marginTop: 6 }}>
                <b style={{ fontSize: 20 }}>{catEmoji(r.topCategory.name)} {r.topCategory.name}</b>
                <span className="num">{fmt(r.topCategory.paise)} · {r.topCategory.pct}%</span>
              </div>
            </section>
          )}

          {r.biggest && (
            <section className="card">
              <div className="muted small">Biggest single spend</div>
              <div className="row between" style={{ marginTop: 6 }}>
                <b className="ellipsis">{r.biggest.note}</b>
                <span className="num">{fmt(r.biggest.paise)}</span>
              </div>
              <div className="muted small">{shortDate(r.biggest.date)}</div>
            </section>
          )}

          {r.budgetUsedPct !== null && (
            <section className="card">
              <div className="row between">
                <span className="muted small">Monthly budget</span>
                <b>{r.budgetUsedPct}% used</b>
              </div>
              <div className="bar big" style={{ marginTop: 8 }}>
                <i style={{ width: `${Math.min(100, r.budgetUsedPct)}%`, background: r.budgetUsedPct > 100 ? '#C8261B' : undefined }} />
              </div>
              <div className="muted small" style={{ marginTop: 6 }}>{fmt(r.spent)} of {fmt(r.budget)}</div>
            </section>
          )}

          <section className="card lemon">
            <b>One thing to try</b>
            <p style={{ margin: '6px 0 0' }}>{r.tip}</p>
          </section>

          <button className="btn primary block" onClick={() => void shareText(reportText(r))}>
            <Icon name="share" /> Share my report
          </button>
        </>
      )}
    </div>
  );
}
