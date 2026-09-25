'use client';
import { useCallback, useEffect, useState } from 'react';
import { DB_EVENT } from './data';

/** Charge une donnée async et la recharge à chaque changement de la base. */
export function useData<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  useEffect(() => {
    let alive = true;
    const load = () =>
      run().then(d => { if (alive) { setData(d); setError(null); } })
           .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    load();
    window.addEventListener(DB_EVENT, load);
    return () => { alive = false; window.removeEventListener(DB_EVENT, load); };
  }, [run]);

  return { data, error, loading: data === null && error === null };
}
