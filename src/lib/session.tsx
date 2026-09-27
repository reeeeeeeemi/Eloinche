'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DATA_SOURCE, DB_EVENT, api } from './data';
import { getCurrentUid, mockEmailOf, setCurrentUid } from './data/mock';
import { subscribeRealtime } from './data/supabase';
import { disablePush } from './push';
import { supabase } from './supabaseClient';
import type { Profile } from './types';

interface Session {
  ready: boolean;
  uid: string | null;
  me: Profile | null;
  /** Email du compte connecté (affiché dans le menu, pour le donner à qui veut t'inviter). */
  email: string | null;
  /** Mode local : se connecter à la place d'un joueur de test. */
  signInAs: (uid: string) => void;
  signOut: () => Promise<void>;
  /** Supabase : connexion / inscription par email + mot de passe (le compte arrive en attente). */
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (displayName: string, email: string, password: string) => Promise<void>;
}

const Ctx = createContext<Session>({
  ready: false, uid: null, me: null, email: null,
  signInAs: () => {}, signOut: async () => {}, signIn: async () => {}, signUp: async () => {},
});

/** Erreurs d'authentification Supabase -> messages en français. */
function authMessage(msg: string) {
  if (/invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.';
  if (/already registered|already exists/i.test(msg)) return 'Un compte existe déjà avec cet email : connecte-toi.';
  if (/password should be at least/i.test(msg)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/database error saving new user/i.test(msg)) return 'Ce nom est déjà pris : essaie avec ton prénom et l’initiale de ton nom.';
  if (/rate limit/i.test(msg)) return 'Trop de tentatives, réessaie dans quelques minutes.';
  if (/valid email|invalid email/i.test(msg)) return 'Adresse email invalide.';
  return msg;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async (u: string | null) => {
      // Session valide mais profil injoignable (réseau lent au réveil de l'appli) : on réessaie
      // au lieu de renvoyer vers la connexion, sinon on croit devoir se reconnecter.
      let p = null;
      for (let i = 0; u && alive; i++) {
        try { p = await api.getProfile(u); break; }
        catch { if (i >= 5) break; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
      }
      if (!alive) return;
      setUid(u); setMe(p); setReady(true);
    };

    if (DATA_SOURCE === 'mock') {
      const sync = () => { const u = getCurrentUid(); setEmail(u ? mockEmailOf(u) : null); load(u); };
      sync();
      window.addEventListener(DB_EVENT, sync);
      return () => { alive = false; window.removeEventListener(DB_EVENT, sync); };
    }

    // Supabase : session persistée dans le navigateur + temps réel
    subscribeRealtime();
    let current: string | null = null;
    supabase().auth.getSession().then(({ data }) => {
      current = data.session?.user.id ?? null; setEmail(data.session?.user.email ?? null); load(current);
    });
    const { data: sub } = supabase().auth.onAuthStateChange((_evt, session) => {
      current = session?.user.id ?? null; setEmail(session?.user.email ?? null);
      load(current);
    });
    // statut du compte (ex. accepté par l'admin) mis à jour en direct
    const sync = () => load(current);
    window.addEventListener(DB_EVENT, sync);
    return () => { alive = false; sub.subscription.unsubscribe(); window.removeEventListener(DB_EVENT, sync); };
  }, []);

  const value: Session = {
    ready, uid, me, email,
    signInAs: id => setCurrentUid(id),
    signOut: async () => {
      if (DATA_SOURCE === 'mock') setCurrentUid(null);
      else {
        // cet appareil ne doit plus recevoir les notifs du compte qu'on quitte
        await disablePush().catch(() => {});
        await supabase().auth.signOut();
      }
    },
    signIn: async (email, password) => {
      const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(authMessage(error.message));
    },
    signUp: async (displayName, email, password) => {
      const { data, error } = await supabase().auth.signUp({
        email: email.trim(), password, options: { data: { display_name: displayName.trim() } },
      });
      if (error) throw new Error(authMessage(error.message));
      if (!data.session) throw new Error('Compte créé, mais la confirmation par email est activée dans Supabase : désactive « Confirm email ».');
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
