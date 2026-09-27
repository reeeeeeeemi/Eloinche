'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './data';
import { useSession } from './session';
import type { Group, MyInvite } from './types';
import { useData } from './useData';

const KEY = 'coinche_group';

interface GroupCtx {
  /** Mes groupes (null tant que pas chargés). */
  groups: Group[] | null;
  /** Groupe affiché (classement, historique, nouvelle partie). */
  group: Group | null;
  setGroup: (id: string) => void;
  /** Invitations reçues, en attente de réponse. */
  invites: MyInvite[] | null;
}

const Ctx = createContext<GroupCtx>({ groups: null, group: null, setGroup: () => {}, invites: null });

export function GroupProvider({ children }: { children: ReactNode }) {
  const { uid } = useSession();
  // chaque chargement est étiqueté avec son joueur : après un changement de compte, on ne prend pas
  // la liste (vide) de l'ancien pour celle du nouveau, ce qui l'enverrait à tort vers « Groupes »
  const { data: g } = useData(async () => ({ uid, list: uid ? await api.getGroups() : [] }), [uid]);
  const { data: inv } = useData(async () => ({ uid, list: uid ? await api.getMyInvites() : [] }), [uid]);
  const groups = g?.uid === uid ? g.list : null;
  const invites = inv?.uid === uid ? inv.list : null;
  const [picked, setPicked] = useState<string | null>(null);

  // groupe mémorisé sur l'appareil, ou imposé par le lien d'une notification (?groupe=…)
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('groupe');
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    setPicked(fromUrl ?? saved);
  }, []);

  const setGroup = (id: string) => {
    setPicked(id);
    try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  };
  const group = groups?.find(g => g.id === picked) ?? groups?.[0] ?? null;

  return <Ctx.Provider value={{ groups, group, setGroup, invites }}>{children}</Ctx.Provider>;
}

export const useGroup = () => useContext(Ctx);
