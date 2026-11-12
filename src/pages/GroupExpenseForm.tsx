import { useMemo, useState } from 'react';
import { deleteGroupExpense, saveGroupExpense, useAppState } from '../lib/store';
import { EXPENSE_CATS } from '../lib/categories';
import { fmt, parseAmount, toInput } from '../lib/money';
import { activeMembers, allocate } from '../lib/splits';
import { back } from '../lib/router';
import { today } from '../lib/util';
import { Avatar, Icon, Segmented, TopBar } from '../components/ui';
import type { SplitType } from '../lib/types';

const SPLIT_OPTIONS: { id: SplitType; label: string }[] = [
  { id: 'equal', label: 'Equally' },
  { id: 'exact', label: 'Amounts' },
  { id: 'percent', label: 'Percent' },
  { id: 'shares', label: 'Shares' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Sensible starting values when the split type or the people change. */
function prefill(type: SplitType, ids: string[], amountPaise: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (type === 'shares') {
    for (const id of ids) out[id] = '1';
  } else if (type === 'percent' && ids.length) {
    let used = 0;
    ids.forEach((id, i) => {
      const v = i === ids.length - 1 ? round2(100 - used) : round2(100 / ids.length);
      used += v;
      out[id] = String(v);
    });
  } else if (type === 'exact' && ids.length) {
    const parts = allocate(amountPaise, Object.fromEntries(ids.map((i) => [i, 1])));
    for (const id of ids) out[id] = toInput(parts[id] ?? 0);
  }
  return out;
}

export default function GroupExpenseForm({ groupId, editId }: { groupId: string; editId?: string }) {
  const s = useAppState();
  const g = s.groups.find((x) => x.id === groupId);
  const editing = g?.expenses.find((e) => e.id === editId && !e.deleted);
  const meId = s.meIds[groupId];

  const members = useMemo(() => (g ? activeMembers(g) : []), [g]);
  // When editing, also show people who were removed later but are part of this expense.
  const allMembers = useMemo(() => {
    if (!g) return [];
    const extra = g.members.filter(
      (m) => m.deleted && editing && (editing.paidBy[m.id] || editing.weights[m.id]),
    );
    return [...members, ...extra];
  }, [g, members, editing]);

  const [title, setTitle] = useState(editing?.title ?? '');
  const [amount, setAmount] = useState(editing ? toInput(editing.amountPaise) : '');
  const [category, setCategory] = useState(editing?.category ?? 'Food');
  const [date, setDate] = useState(editing?.date ?? today());
  const [splitType, setSplitType] = useState<SplitType>(editing?.splitType ?? 'equal');

  const editPayers = editing ? Object.keys(editing.paidBy) : [];
  const [multiPay, setMultiPay] = useState(editPayers.length > 1);
  const [payer, setPayer] = useState(editPayers[0] ?? meId ?? members[0]?.id ?? '');
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>(
    editing && editPayers.length > 1
      ? Object.fromEntries(editPayers.map((id) => [id, toInput(editing.paidBy[id])]))
      : {},
  );

  const [joined, setJoined] = useState<Record<string, boolean>>(() => {
    if (editing) return Object.fromEntries(Object.keys(editing.weights).map((id) => [id, true]));
    return Object.fromEntries(members.map((m) => [m.id, true]));
  });
  const [values, setValues] = useState<Record<string, string>>(() =>
    editing && editing.splitType !== 'equal'
      ? Object.fromEntries(
          Object.entries(editing.weights).map(([id, v]) => [
            id,
            editing.splitType === 'exact' ? toInput(v) : String(v),
          ]),
        )
      : {},
  );

  if (!g || (editId && !editing)) {
    return (
      <div className="page no-nav">
        <TopBar title="Not found" />
        <p className="muted">This group or expense no longer exists.</p>
      </div>
    );
  }

  const paise = parseAmount(amount) ?? 0;
  const joinedIds = allMembers.filter((m) => joined[m.id]).map((m) => m.id);

  /* ---- weights from the form ---- */
  const num = (t: string | undefined) => {
    const n = parseFloat((t ?? '').replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const weights: Record<string, number> = {};
  for (const id of joinedIds) {
    if (splitType === 'equal') weights[id] = 1;
    else if (splitType === 'exact') weights[id] = parseAmount(values[id] ?? '') ?? 0;
    else weights[id] = num(values[id]);
  }

  /* ---- who paid ---- */
  const paidBy: Record<string, number> = {};
  if (multiPay) {
    for (const m of allMembers) {
      const v = parseAmount(payAmounts[m.id] ?? '') ?? 0;
      if (v > 0) paidBy[m.id] = v;
    }
  } else if (payer && paise > 0) {
    paidBy[payer] = paise;
  }
  const paidSum = Object.values(paidBy).reduce((a, b) => a + b, 0);

  /* ---- preview and checks ---- */
  const preview = (() => {
    if (!paise || !joinedIds.length) return {} as Record<string, number>;
    if (splitType === 'exact') return weights;
    return allocate(paise, weights);
  })();

  let problem = '';
  if (!title.trim()) problem = 'Add a short title, like Dinner or Cab.';
  else if (paise <= 0) problem = 'Enter the amount.';
  else if (joinedIds.length === 0) problem = 'Choose at least one person who shares this.';
  else if (multiPay && paidSum !== paise) problem = `Payments add up to ${fmt(paidSum)}. They should add up to ${fmt(paise)}.`;
  else if (!multiPay && !payer) problem = 'Choose who paid.';
  else if (splitType === 'exact') {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (sum !== paise) problem = sum > paise ? `Amounts are ${fmt(sum - paise)} too high.` : `${fmt(paise - sum)} is still unassigned.`;
  } else if (splitType === 'percent') {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.01) problem = `Percentages add up to ${round2(sum)}%. They should add up to 100%.`;
  } else if (splitType === 'shares') {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (sum <= 0) problem = 'Give at least one person a share.';
  }

  const resetValues = (type: SplitType, ids: string[], total = paise) => setValues(prefill(type, ids, total));

  const changeType = (t: SplitType) => {
    setSplitType(t);
    resetValues(t, joinedIds);
  };

  const toggle = (id: string) => {
    const next = { ...joined, [id]: !joined[id] };
    setJoined(next);
    if (splitType === 'percent' || splitType === 'exact') {
      resetValues(splitType, allMembers.filter((m) => next[m.id]).map((m) => m.id));
    } else if (splitType === 'shares' && !values[id]) {
      setValues({ ...values, [id]: '1' });
    }
  };

  const selectAll = () => {
    const all = Object.fromEntries(allMembers.map((m) => [m.id, true]));
    setJoined(all);
    resetValues(splitType, allMembers.map((m) => m.id));
  };

  const save = () => {
    if (problem) return;
    saveGroupExpense(g.id, {
      id: editing?.id,
      title: title.trim(),
      category,
      date,
      amountPaise: paise,
      paidBy,
      splitType,
      weights,
    });
    back(`/splitter/${g.id}`);
  };

  const remove = () => {
    if (!editing) return;
    if (window.confirm('Delete this expense for everyone in the group?')) {
      deleteGroupExpense(g.id, editing.id);
      back(`/splitter/${g.id}`);
    }
  };

  const valueLabel = splitType === 'exact' ? '₹' : splitType === 'percent' ? '%' : 'shares';

  return (
    <div className="page no-nav stack" style={{ paddingBottom: 40 }}>
      <TopBar
        title={editing ? 'Edit expense' : 'Add expense'}
        right={
          editing ? (
            <button className="icon-btn" aria-label="Delete expense" onClick={remove}>
              <Icon name="trash" />
            </button>
          ) : undefined
        }
      />
      <div className="muted small" style={{ marginTop: -8 }}>
        {g.emoji} {g.name}
      </div>

      <label className="field">
        <span>What was it for?</span>
        <input
          className="input"
          placeholder="Dinner, cab, hotel…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <div className="grid2">
        <label className="field">
          <span>Amount (₹)</span>
          <input
            className="input"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) {
                setAmount(v);
                if (splitType === 'exact') resetValues('exact', joinedIds, parseAmount(v) ?? 0);
              }
            }}
          />
        </label>
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
        </label>
      </div>

      <div className="chips" role="group" aria-label="Category">
        {EXPENSE_CATS.map((c) => (
          <button key={c.id} className="chip" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
            <span aria-hidden="true">{c.emoji}</span> {c.id}
          </button>
        ))}
      </div>

      <section className="card stack">
        <div className="row between">
          <h3>Paid by</h3>
          <button className="link-btn" onClick={() => setMultiPay(!multiPay)}>
            {multiPay ? 'One person paid' : 'Several people paid'}
          </button>
        </div>
        {multiPay ? (
          <div className="stack" style={{ gap: 10 }}>
            {allMembers.map((m) => (
              <div key={m.id} className="row">
                <Avatar name={m.name} size={36} />
                <span className="grow" style={{ fontWeight: 600 }}>{m.name}</span>
                <input
                  className="input"
                  style={{ width: 120 }}
                  inputMode="decimal"
                  aria-label={`Amount paid by ${m.name}`}
                  placeholder="₹0"
                  value={payAmounts[m.id] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setPayAmounts({ ...payAmounts, [m.id]: v });
                  }}
                />
              </div>
            ))}
            <div className={`small ${paidSum === paise && paise > 0 ? 'pos' : 'muted'}`} style={{ fontWeight: 600 }}>
              {fmt(paidSum)} of {fmt(paise)}
            </div>
          </div>
        ) : (
          <div className="chips" role="group" aria-label="Who paid">
            {allMembers.map((m) => (
              <button key={m.id} className="chip" aria-pressed={payer === m.id} onClick={() => setPayer(m.id)}>
                {m.name}
                {m.id === meId ? ' (you)' : ''}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="row between">
          <h3>Who is it for?</h3>
          <button className="link-btn" onClick={selectAll}>
            Select everyone
          </button>
        </div>
        <Segmented options={SPLIT_OPTIONS} value={splitType} onChange={changeType} lemon />

        <div className="stack" style={{ gap: 4 }}>
          {allMembers.map((m) => {
            const on = Boolean(joined[m.id]);
            return (
              <div key={m.id} className="row" style={{ minHeight: 56 }}>
                <button
                  className="row grow"
                  style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
                  aria-pressed={on}
                  onClick={() => toggle(m.id)}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 9,
                      border: '2px solid var(--ink)',
                      background: on ? 'var(--lemon)' : 'var(--card)',
                      display: 'grid',
                      placeItems: 'center',
                      flex: 'none',
                    }}
                  >
                    {on && <Icon name="check" size={18} />}
                  </span>
                  <Avatar name={m.name} size={34} />
                  <span className="grow" style={{ fontWeight: 600 }}>
                    {m.name}
                    {m.id === meId ? ' (you)' : ''}
                  </span>
                </button>
                {on && splitType !== 'equal' && (
                  <input
                    className="input"
                    style={{ width: 96 }}
                    inputMode="decimal"
                    aria-label={`${valueLabel} for ${m.name}`}
                    placeholder={valueLabel}
                    value={values[m.id] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setValues({ ...values, [m.id]: v });
                    }}
                  />
                )}
                {on && paise > 0 && (
                  <span className="num" style={{ minWidth: 70, textAlign: 'right' }}>
                    {fmt(preview[m.id] ?? 0)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {splitType !== 'equal' && (
          <button className="link-btn" style={{ textAlign: 'left' }} onClick={() => resetValues(splitType, joinedIds)}>
            Reset to an even split
          </button>
        )}
      </section>

      {problem && <div className="notice">{problem}</div>}

      <button className="btn lemon block" disabled={Boolean(problem)} onClick={save}>
        <Icon name="check" /> {editing ? 'Save changes' : 'Add expense'}
      </button>
    </div>
  );
}
