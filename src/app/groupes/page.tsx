'use client';
import { useState } from 'react';
import { Header } from '@/components/Header';
import { Invitations } from '@/components/Invitations';
import { DATA_SOURCE, api } from '@/lib/data';
import { useGroup } from '@/lib/group';
import { useSession } from '@/lib/session';
import type { Group } from '@/lib/types';
import { useData } from '@/lib/useData';

/** Mes groupes : membres, invitations par email, création d'un groupe. */
export default function GroupesPage() {
  const { groups, invites } = useGroup();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { setGroup } = useGroup();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { setGroup(await api.createGroup(name)); setName(''); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Header back title="Groupes" />
      <main className="main">
        <Invitations />
        {groups && groups.length === 0 && !invites?.length && (
          <div className="card card-pad">
            <h2 className="section-title" style={{ fontSize: 17 }}>Bienvenue !</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Crée un groupe pour tes parties avec tes potes, ou demande à l’un d’eux de t’inviter
              avec l’email de ton compte.
            </p>
          </div>
        )}
        {groups?.map(g => <GroupCard key={g.id} g={g} />)}

        <form className="card card-pad" onSubmit={create}>
          <h2 className="section-title" style={{ fontSize: 17 }}>Créer un groupe</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={40}
              placeholder="Ex. Les coincheurs du jeudi" aria-label="Nom du groupe" />
            <button className="btn btn-primary" disabled={!name.trim() || busy}>Créer</button>
          </div>
          {err && <p className="error">{err}</p>}
          <p className="small muted" style={{ margin: '10px 0 0' }}>Chaque groupe a son propre classement : tout le monde y démarre à 1000.</p>
        </form>
      </main>
    </>
  );
}

function GroupCard({ g }: { g: Group }) {
  const { uid } = useSession();
  const { group, setGroup } = useGroup();
  const { data: players } = useData(() => api.getPlayers(g.id), [g.id]);
  const { data: pending } = useData(() => api.getInvites(g.id), [g.id]);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const owner = g.created_by === uid;
  const current = group?.id === g.id;

  async function run(fn: () => Promise<void>, ok?: string) {
    setMsg(null);
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const to = email.trim();
    await run(async () => { await api.inviteToGroup(g.id, to); setEmail(''); },
      `Invitation envoyée à ${to}. Elle apparaîtra dans son appli, même s’il crée son compte plus tard avec cet email.`);
  }

  return (
    <div className="card card-pad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <h2 className="section-title" style={{ fontSize: 17, margin: 0, flex: 1 }}>{g.name}</h2>
        {current
          ? <span className="mode-tag">Affiché</span>
          : <button className="btn btn-soft" style={{ minHeight: 34, padding: '0 12px', fontSize: 14 }} onClick={() => setGroup(g.id)}>Afficher</button>}
      </div>
      <p className="small muted" style={{ margin: '0 0 4px' }}>
        {players ? `${players.length} membre${players.length > 1 ? 's' : ''}` : '…'}
        {owner ? ' · tu l’as créé' : ''}
      </p>

      {players?.map(p => (
        <div key={p.id} className="req-row">
          <span>
            <span className="lb-name">{p.display_name}{p.id === g.created_by && <span className="muted"> (créateur)</span>}</span>
            <span className="lb-sub">{p.elo} Elo · {p.games_played} partie{p.games_played > 1 ? 's' : ''}</span>
          </span>
          <span className="req-actions">
            {p.id === uid && !owner && (
              <button className="btn btn-outline"
                onClick={() => confirm(`Quitter le groupe ${g.name} ? Ton Elo dans ce groupe sera perdu.`) && run(() => api.removeMember(g.id, p.id))}>
                Quitter
              </button>
            )}
            {owner && p.id !== uid && (
              <button className="btn btn-outline"
                onClick={() => confirm(`Retirer ${p.display_name} du groupe ${g.name} ?`) && run(() => api.removeMember(g.id, p.id))}>
                Retirer
              </button>
            )}
          </span>
        </div>
      ))}

      {!!pending?.length && (
        <>
          <p className="small muted" style={{ margin: '14px 0 0' }}>Invitations en attente</p>
          {pending.map(i => (
            <div key={i.id} className="req-row">
              <span className="lb-sub">{i.email}</span>
              <span className="req-actions">
                <button className="btn btn-outline" onClick={() => run(() => api.cancelInvite(i.id))}>Annuler</button>
              </span>
            </div>
          ))}
        </>
      )}

      <form onSubmit={invite} style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <input className="input" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email du compte à inviter" aria-label={`Inviter dans ${g.name}`} />
        <button className="btn btn-primary" disabled={!email.includes('@')}>Inviter</button>
      </form>
      {DATA_SOURCE === 'mock' && (
        <p className="small muted" style={{ margin: '8px 0 0' }}>Mode local : l’email d’un joueur de test est prénom@exemple.fr (ex. ines@exemple.fr).</p>
      )}
      {msg && <p className={msg.ok ? 'small muted' : 'error'} style={{ margin: '8px 0 0' }}>{msg.text}</p>}
    </div>
  );
}
