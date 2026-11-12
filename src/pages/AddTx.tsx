import { useState } from 'react';
import { deleteTx, saveTx, useAppState } from '../lib/store';
import { EXPENSE_CATS, INCOME_CATS } from '../lib/categories';
import { parseAmount, toInput } from '../lib/money';
import { back } from '../lib/router';
import { today } from '../lib/util';
import { Icon, Segmented, TopBar } from '../components/ui';
import type { TxType } from '../lib/types';

/** Applies one key press to the amount text. Keeps at most 2 decimals. */
export function pressKey(cur: string, key: string): string {
  if (key === 'back') return cur.slice(0, -1);
  if (key === '.') {
    if (cur.includes('.')) return cur;
    return cur === '' ? '0.' : cur + '.';
  }
  if (cur.includes('.')) {
    const dec = cur.split('.')[1];
    return dec.length >= 2 ? cur : cur + key;
  }
  if (cur === '0') return key; // no leading zeros
  if (cur.length >= 9) return cur;
  return cur + key;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

export default function AddTx({ editId }: { editId?: string }) {
  const s = useAppState();
  const editing = editId ? s.txs.find((t) => t.id === editId) : undefined;
  const accounts = s.accounts.filter((a) => !a.archived || a.id === editing?.accountId);

  const [type, setType] = useState<TxType>(editing?.type ?? 'expense');
  const [amount, setAmount] = useState(editing ? toInput(editing.amountPaise) : '');
  const [category, setCategory] = useState(editing?.category ?? 'Food');
  const [accountId, setAccountId] = useState<string>(editing?.accountId ?? accounts[0]?.id ?? '');
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? '');
  const [necessary, setNecessary] = useState(editing?.necessary ?? true);

  if (editId && !editing) {
    return (
      <div className="page no-nav">
        <TopBar title="Not found" />
        <p className="muted">This transaction no longer exists.</p>
      </div>
    );
  }

  const paise = parseAmount(amount);
  const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;

  const switchType = (t: TxType) => {
    setType(t);
    setCategory(t === 'expense' ? 'Food' : 'Salary');
  };

  const save = () => {
    if (!paise || paise <= 0) return;
    saveTx({
      id: editing?.id,
      type,
      amountPaise: paise,
      category,
      accountId: accountId || null,
      date,
      note: note.trim(),
      necessary: type === 'expense' ? necessary : true,
    });
    back('/');
  };

  const remove = () => {
    if (!editing) return;
    if (window.confirm('Delete this transaction?')) {
      deleteTx(editing.id);
      back('/');
    }
  };

  return (
    <div className="add-screen">
      <TopBar
        title={editing ? 'Edit transaction' : 'Add transaction'}
        right={
          editing ? (
            <button className="icon-btn" aria-label="Delete transaction" onClick={remove}>
              <Icon name="trash" />
            </button>
          ) : undefined
        }
      />
      <div className="add-body stack">
        <Segmented
          options={[
            { id: 'expense', label: 'Expense' },
            { id: 'income', label: 'Income' },
          ]}
          value={type}
          onChange={switchType}
        />

        <div
          className={`amount-display ${type}`}
          aria-live="polite"
          aria-label={`Amount ${amount || 0} rupees`}
        >
          ₹{amount || '0'}
        </div>

        {type === 'expense' && (
          <div className="seg" role="group" aria-label="Was it needed?">
            <button aria-pressed={necessary} onClick={() => setNecessary(true)}>
              Needed
            </button>
            <button aria-pressed={!necessary} onClick={() => setNecessary(false)}>
              Could skip
            </button>
          </div>
        )}

        <div className="chips" role="group" aria-label="Category">
          {cats.map((c) => (
            <button
              key={c.id}
              className="chip blue"
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              <span aria-hidden="true">{c.emoji}</span> {c.id}
            </button>
          ))}
        </div>

        <div className="grid2">
          <label className="field">
            <span>Account</span>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input
              className="input"
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value || today())}
            />
          </label>
        </div>

        <label className="field">
          <span>Note</span>
          <input
            className="input"
            placeholder={type === 'expense' ? 'What was it for?' : 'Where did it come from?'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

      </div>

      <div className="keypad-wrap">
        <div className="keypad" role="group" aria-label="Amount keypad">
          {KEYS.map((k) => (
            <button
              key={k}
              className="key"
              aria-label={k === 'back' ? 'Delete last digit' : k === '.' ? 'Decimal point' : k}
              onClick={() => setAmount((cur) => pressKey(cur, k))}
            >
              {k === 'back' ? <Icon name="backspace" /> : k}
            </button>
          ))}
        </div>
        <button className="btn primary block" disabled={!paise || paise <= 0} onClick={save}>
          <Icon name="check" /> {editing ? 'Save changes' : type === 'expense' ? 'Save expense' : 'Save income'}
        </button>
      </div>
    </div>
  );
}
