'use client';
import { useState } from 'react';
import { LogOut, Plus, UserMinus, X } from 'lucide-react';
import { Header } from '@/components/Header';
import { Invitations } from '@/components/Invitations';
import { DATA_SOURCE, api } from '@/lib/data';
import { useGroup } from '@/lib/group';
import { useSession } from '@/lib/session';
import type { Group } from '@/lib/types';
import { useData } from '@/lib/useData';

/** Mes groupes : membres, invitations par email, création d'un groupe. */
export default function GroupesPage() {
  const { groups, invites, setGroup } = useGroup();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { setGroup(await api.createGroup(name)); setName(''); setCreating(false); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Header back title="Groupes" />
      <main className="main">
        <Invitations />
        {groups && groups.length === 0 && !invites?.length && (
          <p className="small muted" style={{ margin: '4px 4px 0' }}>
            Crée un groupe pour tes parties avec tes potes, ou demande à l’un d’eux de t’inviter avec l’email de ton compte
            (menu ⋮ en haut à droite).
          </p>
        )}
        {groups?.map(g => <GroupCard key={g.id} g={g} />)}

        {creating ? (
          <form className="card grp" onSubmit={create}>
            <div className="grp-head">
              <h2 className="grp-name">Nouveau groupe</h2>
              <button type="button" className="icon-act" aria-label="Annuler" onClick={() => { setCreating(false); setErr(null); }}><X size={18} /></button>
            </div>
            <div className="inline-form">
              <input className="input-sm" value={name} onChange={e => setName(e.target.value)} maxLength={40} autoFocus
                placeholder="Nom du groupe" aria-label="Nom du groupe" />
              <button className="btn-sm" disabled={!name.trim() || busy}>Créer</button>
            </div>
            {err && <p className="error">{err}</p>}
            <p className="hint">Chaque groupe a son propre classement : tout le monde y démarre à 1000.</p>
          </form>
        ) : (
          <button className="add-btn" onClick={() => setCreating(true)}><Plus size={17} /> Créer un groupe</button>
        )}
      </main>
    </>
  );
}

function GroupCard({ g }: { g: Group }) {
  const { uid } = useSession();
  const { group, setGroup } = useGroup();
  const { data: players } = useData(() => api.getPlayers(g.id), [g.id]);
  const { data: pending } = useData(() => api.getInvites(g.id), [g.id]);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const owner = g.created_by === uid;
  const current = group?.id === g.id;
  const ownerName = players?.find(p => p.id === g.created_by)?.display_name;

  async function run(fn: () => Promise<void>, ok?: string) {
    setMsg(null);
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const to = email.trim();
    await run(async () => { await api.inviteToGroup(g.id, to); setEmail(''); setInviting(false); },
      `Invitation envoyée à ${to}.`);
  }

  return (
    <div className="card grp">
      <div className="grp-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="grp-name">{g.name}</h2>
          <p className="grp-meta">
            {players ? `${players.length} membre${players.length > 1 ? 's' : ''}` : '…'}
            {owner ? ' · créé par toi' : ownerName ? ` · créé par ${ownerName}` : ''}
          </p>
        </div>
        {current
          ? <span className="grp-state">Affiché</span>
          : <button className="link-btn" onClick={() => setGroup(g.id)}>Afficher</button>}
      </div>

      <ul className="members">
        {players?.map(p => (
          <li key={p.id} className="member">
            <span className="avatar" aria-hidden>{p.display_name.slice(0, 1).toUpperCase()}</span>
            <span className="member-name">
              {p.display_name}{p.id === uid && <span className="muted"> (toi)</span>}
            </span>
            <span className="member-elo">{p.elo}</span>
            {p.id === uid && !owner && (
              <button className="icon-act" aria-label={`Quitter ${g.name}`} title="Quitter le groupe"
                onClick={() => confirm(`Quitter le groupe ${g.name} ? Ton Elo dans ce groupe sera perdu.`) && run(() => api.removeMember(g.id, p.id))}>
                <LogOut size={16} />
              </button>
            )}
            {owner && p.id !== uid && (
              <button className="icon-act" aria-label={`Retirer ${p.display_name}`} title="Retirer du groupe"
                onClick={() => confirm(`Retirer ${p.display_name} du groupe ${g.name} ?`) && run(() => api.removeMember(g.id, p.id))}>
                <UserMinus size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {!!pending?.length && (
        <div className="pending">
          <span className="hint" style={{ margin: 0 }}>En attente :</span>
          {pending.map(i => (
            <span key={i.id} className="invite-pill">
              {i.email}
              <button aria-label={`Annuler l’invitation de ${i.email}`} onClick={() => run(() => api.cancelInvite(i.id))}><X size={13} /></button>
            </span>
          ))}
        </div>
      )}

      {inviting ? (
        <form onSubmit={invite} className="invite-box">
          <div className="inline-form">
            <input className="input-sm" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus
              placeholder="Email de son compte" aria-label={`Email à inviter dans ${g.name}`} />
            <button className="btn-sm" disabled={!email.includes('@')}>Inviter</button>
            <button type="button" className="icon-act" aria-label="Fermer" onClick={() => { setInviting(false); setMsg(null); }}><X size={18} /></button>
          </div>
          <p className="hint">
            Ton pote trouve son email dans le menu ⋮ en haut à droite. Pas encore de compte ? L’invitation l’attendra.
            {DATA_SOURCE === 'mock' && ' Mode local : prénom@exemple.fr (ex. ines@exemple.fr).'}
          </p>
        </form>
      ) : (
        <button className="link-btn" style={{ marginTop: 10 }} onClick={() => { setInviting(true); setMsg(null); }}>
          <Plus size={16} /> Inviter un joueur
        </button>
      )}
      {msg && <p className={msg.ok ? 'hint ok-msg' : 'error'}>{msg.text}</p>}
    </div>
  );
}
