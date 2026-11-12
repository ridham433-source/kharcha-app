import { useEffect, useState } from 'react';
import { go } from '../lib/router';
import { cloudConfig, joinByCode } from '../lib/cloud';
import { getState, updateSettings } from '../lib/store';
import { groupPath } from '../lib/util';
import { TopBar } from '../components/ui';

/** Opened from an invite link: #/join/CODE?u=...&k=... */
export default function Join({ code, url, anonKey }: { code: string; url?: string; anonKey?: string }) {
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!cloudConfig() && url && anonKey) updateSettings({ cloudUrl: url, cloudKey: anonKey });
        const id = await joinByCode(code);
        if (!cancelled) window.location.replace(`${window.location.pathname}#${groupPath(getState().groups.find((x) => x.id === id))}`);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not join this group.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, url, anonKey]);

  return (
    <div className="page no-nav stack">
      <TopBar title="Joining group" showBack={false} />
      {error ? (
        <>
          <div className="notice bad">{error}</div>
          <button className="btn block" onClick={() => go('/splitter')}>
            Back to Splitter
          </button>
        </>
      ) : (
        <div className="card center">
          <div style={{ fontSize: 44 }}>🍋</div>
          <p className="muted">Fetching the group…</p>
        </div>
      )}
    </div>
  );
}
