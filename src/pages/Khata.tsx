import { useState } from 'react';
import { createFriend, useAppState } from '../lib/store';
import { fmt } from '../lib/money';
import { friendBalance, otherMember } from '../lib/splits';
import { go } from '../lib/router';
import { Avatar, Empty, Icon, Sheet } from '../components/ui';
import { JoinSheet } from './Splitter';

export default function Khata() {
  const s = useAppState();
  const [addOpen, setAddOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const rows = s.groups
    .filter((g) => g.kind === 'friend')
    .map((g) => {
      const me = s.meIds[g.id];
      const name = otherMember(g, me)?.name ?? g.name;
      return { g, name, bal: me ? friendBalance(g, me) : 0 };
    })
    .sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal));

  let owed = 0;
  let owe = 0;
  for (const r of rows) {
    if (r.bal > 0) owed += r.bal;
    else owe += -r.bal;
  }

  return (
    <div className="page stack" style={{ paddingBottom: 150 }}>
      <header>
        <h1>Khata</h1>
        <div className="tagline" style={{ marginTop: 4 }}>
          Never forget who owes whom
        </div>
      </header>

      {rows.length > 0 && (
        <section className="card soft">
          <div className="row" style={{ gap: 28 }}>
            <div>
              <div className="small" style={{ fontWeight: 600 }}>You are owed</div>
              <div className="num pos" style={{ fontSize: 28 }}>{fmt(owed)}</div>
            </div>
            <div>
              <div className="small" style={{ fontWeight: 600 }}>You owe</div>
              <div className="num neg" style={{ fontSize: 28 }}>{fmt(owe)}</div>
            </div>
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="card">
          <Empty
            emoji="🤝"
            title="No friends yet"
            text="Add a friend, then note it down whenever you pay for them or they pay for you. Khata keeps the running total, so you never have to remember."
            action={
              <button className="btn primary" onClick={() => setAddOpen(true)}>
                <Icon name="plus" /> Add a friend
              </button>
            }
          />
        </div>
      ) : (
        <div className="card flush list">
          {rows.map(({ g, name, bal }) => (
            <button key={g.id} className="item" onClick={() => go(`/khata/${g.id}`)}>
              <Avatar name={name} />
              <span className="grow">
                <span className="ellipsis" style={{ display: 'block', fontWeight: 700 }}>
                  {name}
                </span>
                <span className="muted small">
                  {g.code && <span className="badge blue">Synced</span>}
                </span>
              </span>
              <span style={{ textAlign: 'right' }}>
                {bal === 0 ? (
                  <span className="muted small">All settled</span>
                ) : (
                  <>
                    <span className="small muted" style={{ display: 'block' }}>
                      {bal > 0 ? 'owes you' : 'you owe'}
                    </span>
                    <span className={`num ${bal > 0 ? 'pos' : 'neg'}`}>{fmt(Math.abs(bal))}</span>
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid2">
        <button className="btn ghost" onClick={() => setAddOpen(true)}>
          <Icon name="user" /> Add friend
        </button>
        <button className="btn ghost" onClick={() => setJoinOpen(true)}>
          <Icon name="link" /> Join with code
        </button>
      </div>

      <a href="#/add?owe=1" className="btn primary fab-float">
        <Icon name="plus" /> Add entry
      </a>

      <NewFriendSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <JoinSheet open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}

function NewFriendSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const create = () => {
    const id = createFriend(name);
    setName('');
    onClose();
    go(`/khata/${id}`);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a friend">
      <div className="stack">
        <label className="field">
          <span>Friend’s name</span>
          <input className="input" placeholder="Neel" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn primary block" disabled={!name.trim()} onClick={create}>
          Add friend
        </button>
      </div>
    </Sheet>
  );
}
