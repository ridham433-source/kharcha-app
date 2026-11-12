import { useSyncExternalStore } from 'react';

// Hash routing (#/splitter/abc) works on GitHub Pages with no server rules.

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}

export function parseHash(hash: string) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return {
    parts: path.split('/').filter(Boolean),
    query: new URLSearchParams(query),
  };
}

export function go(to: string) {
  window.location.hash = to;
}

/** Go back one screen, or to `fallback` if there is nothing to go back to. */
export function back(fallback = '/') {
  if (window.history.length > 1) window.history.back();
  else go(fallback);
}
