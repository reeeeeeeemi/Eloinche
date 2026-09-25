'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DB_EVENT, api } from './data';
import { getCurrentUid, setCurrentUid } from './data/mock';
import type { Profile } from './types';

interface Session {
  ready: boolean;
  uid: string | null;
  me: Profile | null;
  signInAs: (uid: string) => void;
  signOut: () => void;
}

const Ctx = createContext<Session>({
  ready: false, uid: null, me: null, signInAs: () => {}, signOut: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);

  useEffect(() => {
    const sync = async () => {
      const u = getCurrentUid();
      setUid(u);
      setMe(u ? await api.getProfile(u) : null);
      setReady(true);
    };
    sync();
    window.addEventListener(DB_EVENT, sync);
    return () => window.removeEventListener(DB_EVENT, sync);
  }, []);

  return (
    <Ctx.Provider value={{
      ready, uid, me,
      signInAs: id => setCurrentUid(id),
      signOut: () => setCurrentUid(null),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);
