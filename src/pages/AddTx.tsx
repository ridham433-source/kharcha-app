import { useMemo, useState } from 'react';
import {
  createFriend,
  deleteTx,
  getState,
  saveGroupExpense,
  saveTx,
  useAppState,
} from '../lib/store';
import { EXPENSE_CATS, INCOME_CATS } from '../lib/categories';
import { fmt, parseAmount, toInput } from '../lib/money';
import { allocate, otherMember } from '../lib/splits';
import { back, replace } from '../lib/router';
import { today } from '../lib/util';
import { Icon, Segmented, TopBar } from '../components/ui';
import type { SplitType, TxType } from '../lib/types';

type Mode = TxType | 'owe';

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

/**
 * Builds the shared-expense record for a Khata entry.
 * equal: the bill is split between the two of you and the payer is owed the other half.
 * full:  the whole amount belongs to the person who did not pay.
 */
function oweParts(paise: number, iPaid: boolean, equal: boolean, meId: string, themId: string) {
  const payer = iPaid ? meId : themId;
  const other = iPaid ? themId : meId;
  if (equal) {
    return {
      paidBy: { [payer]: paise },
      weights: { [meId]: 1, [themId]: 1 },
      splitType: 'equal' as SplitType,
      owedByOther: allocate(paise, { [meId]: 1, [themId]: 1 })[other] ?? 0,
    };
  }
  return {
    paidBy: { [payer]: paise },
    weights: { [other]: paise },
    splitType: 'exact' as SplitType,
    owedByOther: paise,
  };
}

export default function AddTx({
  editId,
  startOwe,
  friendId,
}: {
  editId?: string;
  startOwe?: boolean;
  friendId?: string;
}) {
  const s = useAppState();
  const editing = editId ? s.txs.find((t) => t.id === editId) : undefined;
  const accounts = s.accounts.filter((a) => !a.archived || a.id === editing?.accountId);
  const ledgers = useMemo(() => s.groups.filter((g) => g.kind === 'friend'), [s.groups]);

  const [mode, setMode] = useState<Mode>(editing?.type ?? (startOwe ? 'owe' : 'expense'));
  const type: TxType = mode === 'owe' ? 'expense' : mode;
  const [amount, setAmount] = useState(editing ? toInput(editing.amountPaise) : '');
  const [category, setCategory] = useState(editing?.category ?? 'Food');
  const [accountId, setAccountId] = useState<string>(editing?.accountId ?? accounts[0]?.id ?? '');
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? '');
  const [necessary, setNecessary] = useState(editing?.necessary ?? true);

  // Owe (Khata) fields. friend: a ledger id, 'new' for a new friend, '' for nothing chosen yet.
  const [friend, setFriend] = useState<string>(
    friendId && ledgers.some((l) => l.id === friendId) ? friendId : ledgers.length === 0 ? 'new' : '',
  );
  const [newName, setNewName] = useState('');
  const [iPaid, setIPaid] = useState(true);
  const [equal, setEqual] = useState(true);

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

  const ledger = ledgers.find((l) => l.id === friend);
  const friendName = ledger
    ? (otherMember(ledger, s.meIds[ledger.id])?.name ?? ledger.name)
    : newName.trim() || 'your friend';

  const switchMode = (m: Mode) => {
    setMode(m);
    if (m === 'expense') setCategory('Food');
    if (m === 'income') setCategory('Salary');
  };

  const canSave =
    !!paise && paise > 0 && (mode !== 'owe' || (friend !== '' && (friend !== 'new' || newName.trim() !== '')));

  // What the entry will do, shown before saving.
  const preview = (() => {
    if (mode !== 'owe' || !paise) return '';
    const parts = oweParts(paise, iPaid, equal, 'me', 'them');
    return iPaid
      ? `${friendName} will owe you ${fmt(parts.owedByOther)}`
      : `You will owe ${friendName} ${fmt(parts.owedByOther)}`;
  })();

  const saveOwe = () => {
    if (!paise || paise <= 0) return;
    let gid = friend;
    if (friend === 'new') {
      if (!newName.trim()) return;
      gid = createFriend(newName);
    }
    const st = getState();
    const g = st.groups.find((x) => x.id === gid);
    if (!g) return;
    const meId = st.meIds[gid];
    const them = otherMember(g, meId);
    if (!meId || !them) return;
    const parts = oweParts(paise, iPaid, equal, meId, them.id);
    saveGroupExpense(gid, {
      title: note.trim() || 'Shared expense',
      category: 'Other',
      date,
      amountPaise: paise,
      paidBy: parts.paidBy,
      splitType: parts.splitType,
      weights: parts.weights,
    });
    replace(`/khata/${gid}`);
  };

  const save = () => {
    if (!canSave) return;
    if (mode === 'owe') return saveOwe();
    saveTx({
      id: editing?.id,
      type,
      amountPaise: paise!,
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

  const nameUnset = !s.settings.userName.trim() || s.settings.userName.trim() === 'Me';

  return (
    <div className="add-screen">
      <TopBar
        title={editing ? 'Edit transaction' : mode === 'owe' ? 'Add to Khata' : 'Add transaction'}
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
          options={
            editing
              ? [
                  { id: 'expense', label: 'Expense' },
                  { id: 'income', label: 'Income' },
                ]
              : [
                  { id: 'expense', label: 'Expense' },
                  { id: 'income', label: 'Income' },
                  { id: 'owe', label: 'Owe' },
                ]
          }
          value={mode}
          onChange={switchMode}
        />

        <div
          className={`amount-display ${mode === 'owe' ? 'owe' : type}`}
          aria-live="polite"
          aria-label={`Amount ${amount || 0} rupees`}
        >
          ₹{amount || '0'}
        </div>

        {mode === 'owe' ? (
          <>
            {preview && (
              <div className="notice" style={{ fontSize: 17 }} aria-live="polite">
                {preview}
              </div>
            )}

            <div>
              <span className="field-label">With whom?</span>
              <div className="chips" role="group" aria-label="Friend">
                {ledgers.map((l) => (
                  <button
                    key={l.id}
                    className="chip blue"
                    aria-pressed={friend === l.id}
                    onClick={() => setFriend(l.id)}
                  >
                    {otherMember(l, s.meIds[l.id])?.name ?? l.name}
                  </button>
                ))}
                <button className="chip blue" aria-pressed={friend === 'new'} onClick={() => setFriend('new')}>
                  + New friend
                </button>
              </div>
            </div>

            {friend === 'new' && (
              <input
                className="input"
                aria-label="Friend's name"
                placeholder="Friend's name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            )}

            <div>
              <span className="field-label">Who paid?</span>
              <div className="seg" role="group" aria-label="Who paid">
                <button aria-pressed={iPaid} onClick={() => setIPaid(true)}>
                  I paid
                </button>
                <button aria-pressed={!iPaid} onClick={() => setIPaid(false)}>
                  <span className="ellipsis">{friendName} paid</span>
                </button>
              </div>
            </div>

            <div>
              <span className="field-label">How is it shared?</span>
              <div className="seg" role="group" aria-label="How it is shared">
                <button aria-pressed={equal} onClick={() => setEqual(true)}>
                  Split equally
                </button>
                <button aria-pressed={!equal} onClick={() => setEqual(false)}>
                  Full amount
                </button>
              </div>
              <div className="muted small" style={{ marginTop: 6 }}>
                {equal
                  ? 'The bill is shared between the two of you.'
                  : iPaid
                    ? `The whole amount is ${friendName}'s.`
                    : 'The whole amount is yours.'}
              </div>
            </div>

            <div className="grid2">
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Note</span>
                <input
                  className="input"
                  placeholder="Dinner, cab, movie…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
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

            {nameUnset && (
              <div className="notice">
                Your name shows as “{s.settings.userName.trim() || 'Me'}” on your friend’s phone. Set your real name in{' '}
                <a href="#/more">Profile</a> first.
              </div>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
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
        <button className="btn primary block" disabled={!canSave} onClick={save}>
          <Icon name="check" />{' '}
          {editing ? 'Save changes' : mode === 'owe' ? 'Save entry' : type === 'expense' ? 'Save expense' : 'Save income'}
        </button>
      </div>
    </div>
  );
}
