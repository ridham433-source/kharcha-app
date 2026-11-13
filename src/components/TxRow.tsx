import type { Entry } from '../lib/derive';
import { catEmoji } from '../lib/categories';
import { fmt } from '../lib/money';
import { go } from '../lib/router';
import { useAppState } from '../lib/store';

export default function TxRow({ e }: { e: Entry }) {
  const s = useAppState();
  const account = e.accountId ? s.accounts.find((a) => a.id === e.accountId)?.name : null;
  const isGroup = Boolean(e.groupId);
  const open = () => go(isGroup ? `/splitter/${e.groupId}` : `/edit/${e.id}`);

  return (
    <button className="item" onClick={open}>
      <span className={`bubble${isGroup ? ' lemon' : ''}`}>{catEmoji(e.category)}</span>
      <span className="grow">
        <span className="ellipsis" style={{ display: 'block', fontWeight: 700 }}>
          {e.note || e.category}
        </span>
        <span className="muted small ellipsis" style={{ display: 'block' }}>
          {isGroup && <span className="badge">Splitter</span>}{' '}
          {e.note ? `${e.category}` : ''}
          {account ? `${e.note ? ' · ' : ''}${account}` : ''}
          {e.necessary === false && <span className="badge red" style={{ marginLeft: 6 }}>Could skip</span>}
          {e.recurring && <span className="badge green" style={{ marginLeft: 6 }}>Auto</span>}
          {e.internal && <span className="badge blue" style={{ marginLeft: 6 }}>Khata</span>}
          {!!e.sharedPaise && (
            <span className="badge blue" style={{ marginLeft: 6 }}>{fmt(e.sharedPaise)} owed to you</span>
          )}
        </span>
      </span>
      <span className={`num ${e.type === 'income' ? 'pos' : 'neg'}`}>
        {e.type === 'income' ? '+' : '-'}
        {fmt(e.amountPaise)}
      </span>
    </button>
  );
}
