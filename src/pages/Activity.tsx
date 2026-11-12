import { useMemo, useState } from 'react';
import { useAppState } from '../lib/store';
import { entries, monthStats, type Entry } from '../lib/derive';
import { fmt } from '../lib/money';
import { dayLabel, monthKey, monthLabel, shiftMonth, today } from '../lib/util';
import { Empty, Icon, MonthSwitch } from '../components/ui';
import TxRow from '../components/TxRow';

type Filter = 'all' | 'expense' | 'income' | 'skip';

export default function Activity() {
  const s = useAppState();
  const all = useMemo(() => entries(s), [s]);
  const [key, setKey] = useState(monthKey(today()));
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const st = useMemo(() => monthStats(all, key), [all, key]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((e) => {
      if (monthKey(e.date) !== key) return false;
      if (filter === 'expense' && e.type !== 'expense') return false;
      if (filter === 'income' && e.type !== 'income') return false;
      if (filter === 'skip' && e.necessary !== false) return false;
      if (needle && !`${e.note} ${e.category}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [all, key, filter, q]);

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of rows) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [rows]);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'expense', label: 'Spent' },
    { id: 'income', label: 'Income' },
    { id: 'skip', label: 'Could skip' },
  ];

  return (
    <div className="page stack">
      <MonthSwitch
        label={monthLabel(key)}
        onPrev={() => setKey(shiftMonth(key, -1))}
        onNext={() => setKey(shiftMonth(key, 1))}
        nextDisabled={key >= monthKey(today())}
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
      </div>

      <label className="field" style={{ position: 'relative', display: 'block' }}>
        <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>
          Search transactions
        </span>
        <span style={{ position: 'absolute', left: 14, top: 14, color: 'var(--muted)' }}>
          <Icon name="search" />
        </span>
        <input
          className="input"
          style={{ paddingLeft: 46 }}
          placeholder="Search by note or category"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      <div className="chips">
        {filters.map((f) => (
          <button
            key={f.id}
            className="chip"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <Empty
          emoji="🧾"
          title="Nothing here"
          text="No transactions match this month and filter."
        />
      ) : (
        groups.map(([date, list]) => (
          <section key={date}>
            <div className="date-head">{dayLabel(date)}</div>
            <div className="card flush list">
              {list.map((e) => (
                <TxRow key={e.id} e={e} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
