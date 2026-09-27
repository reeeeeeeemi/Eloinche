'use client';
import { useState } from 'react';
import { api } from '@/lib/data';
import { useGroup } from '@/lib/group';

/** Invitations reçues : rejoindre ou refuser. Rien si aucune. */
export function Invitations() {
  const { invites, setGroup } = useGroup();
  const [err, setErr] = useState<string | null>(null);
  if (!invites?.length) return null;

  async function respond(id: string, groupId: string, accept: boolean) {
    setErr(null);
    try {
      await api.respondInvite(id, accept);
      if (accept) setGroup(groupId);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div className="card grp invites">
      <h2 className="grp-name">Invitation{invites.length > 1 ? 's' : ''}</h2>
      {err && <p className="error">{err}</p>}
      <ul className="members">
        {invites.map(i => (
          <li key={i.id} className="member">
            <span className="member-name" style={{ whiteSpace: 'normal' }}>
              {i.group_name}
              <span className="grp-meta" style={{ display: 'block' }}>de {i.invited_by_name}</span>
            </span>
            <button className="link-btn" style={{ color: 'var(--muted)', marginRight: 8 }} onClick={() => respond(i.id, i.group_id, false)}>Refuser</button>
            <button className="btn-sm" style={{ height: 36 }} onClick={() => respond(i.id, i.group_id, true)}>Rejoindre</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
