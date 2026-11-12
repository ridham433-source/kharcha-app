import { useState } from 'react';
import { createGroup, getState, useAppState } from '../lib/store';
import { myBalance } from '../lib/derive';
import { fmt } from '../lib/money';
import { GROUP_EMOJIS } from '../lib/categories';
import { activeMembers } from '../lib/splits';
import { go } from '../lib/router';
import { groupPath } from '../lib/util';
import { cloudConfig, joinByCode } from '../lib/cloud';
import { Empty, Icon, Sheet } from '../components/ui';

export default function Splitter() {
  const s = useAppState();
  const [newOpen, setNewOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const trips = s.groups.filter((g) => g.kind !== 'friend');
  let owed = 0;
  let owe = 0;
  for (const g of trips) {
    const b = myBalance(s, g);
    if (b > 0) owed += b;
    else owe += -b;
  }

  return (
    <div className="page stack" style={{ paddingBottom: 150 }}>
      <header>
        <h1>Splitter</h1>
        <div className="tagline" style={{ marginTop: 4 }}>
          Use Splitter to avoid bitter
        </div>
      </header>

      {trips.length > 0 && (
        <section className="card lemon">
          <div className="row" style={{ gap: 28 }}>
            <div>
              <div className="small" style={{ fontWeight: 600 }}>You are owed</div>
              <div className="num" style={{ fontSize: 28 }}>{fmt(owed)}</div>
            </div>
            <div>
              <div className="small" style={{ fontWeight: 600 }}>You owe</div>
              <div className="num" style={{ fontSize: 28 }}>{fmt(owe)}</div>
            </div>
          </div>
        </section>
      )}

      {trips.length === 0 ? (
        <div className="card">
          <Empty
            emoji="🍋"
            title="No groups yet"
            text="Going on a trip or sharing a flat? Make a group, add who paid and who it was for, and Splitter works out who owes whom."
            action={
              <button className="btn lemon" onClick={() => setNewOpen(true)}>
                <Icon name="plus" /> Create a group
              </button>
            }
          />
        </div>
      ) : (
        <div className="card flush list">
          {trips.map((g) => {
            const b = myBalance(s, g);
            const members = activeMembers(g).length;
            return (
              <button key={g.id} className="item" onClick={() => go(`/splitter/${g.id}`)}>
                <span className="bubble lemon">{g.emoji}</span>
                <span className="grow">
                  <span className="ellipsis" style={{ display: 'block', fontWeight: 700 }}>
                    {g.name}
                  </span>
                  <span className="muted small">
                    {members} people {g.code && <span className="badge blue">Shared</span>}
                  </span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  {b === 0 ? (
                    <span className="muted small">Settled up</span>
                  ) : (
                    <>
                      <span className="small muted" style={{ display: 'block' }}>
                        {b > 0 ? 'you are owed' : 'you owe'}
                      </span>
                      <span className={`num ${b > 0 ? 'pos' : 'neg'}`}>{fmt(Math.abs(b))}</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <a href="#/khata" className="btn ghost block">
        🤝 Open Khata (friend balances)
      </a>

      <button className="btn ghost block" onClick={() => setJoinOpen(true)}>
        <Icon name="link" /> Join with a code
      </button>

      {trips.length > 0 && (
        <button className="btn lemon fab-float" onClick={() => setNewOpen(true)}>
          <Icon name="plus" /> New group
        </button>
      )}

      <NewGroupSheet open={newOpen} onClose={() => setNewOpen(false)} />
      <JoinSheet open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}

function NewGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useAppState();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(GROUP_EMOJIS[0]);
  const [people, setPeople] = useState('');

  const create = () => {
    const names = people.split(/[,\n]/).map((n) => n.trim()).filter(Boolean);
    const id = createGroup(name, emoji, names);
    setName('');
    setPeople('');
    onClose();
    go(`/splitter/${id}`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="New group">
      <div className="stack">
        <label className="field">
          <span>Group name</span>
          <input
            className="input"
            placeholder="Goa trip, Flat 402, Office lunch"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div>
          <div className="field">
            <span style={{ display: 'block', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Icon</span>
          </div>
          <div className="chips" role="group" aria-label="Group icon">
            {GROUP_EMOJIS.map((e) => (
              <button key={e} className="chip" aria-pressed={emoji === e} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Friends (separate names with commas)</span>
          <textarea
            className="input"
            placeholder="Neel, Piya, Rahul"
            value={people}
            onChange={(e) => setPeople(e.target.value)}
          />
        </label>
        <p className="muted small" style={{ margin: 0 }}>
          You are added as {s.settings.userName || 'Me'}. You can add more people later, or invite them with a link.
        </p>
        <button className="btn lemon block" disabled={!name.trim()} onClick={create}>
          Create group
        </button>
      </div>
    </Sheet>
  );
}

export function JoinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = cloudConfig() !== null;

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      const id = await joinByCode(code);
      onClose();
      go(groupPath(getState().groups.find((x) => x.id === id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Join a group">
      <div className="stack">
        {!configured && (
          <div className="notice">
            Shared groups need cloud sync, which is not set up on this device yet. Open the invite link your friend sent, or set it up in Profile.
          </div>
        )}
        <label className="field">
          <span>Group code</span>
          <input
            className="input"
            placeholder="Paste the code from your friend"
            autoCapitalize="characters"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        {error && <div className="notice bad">{error}</div>}
        <button className="btn lemon block" disabled={!code.trim() || busy || !configured} onClick={join}>
          {busy ? 'Joining…' : 'Join group'}
        </button>
      </div>
    </Sheet>
  );
}
