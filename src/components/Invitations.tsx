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
    <div className="card card-pad">
      <h2 className="section-title" style={{ fontSize: 17 }}>Invitations ({invites.length})</h2>
      {err && <p className="error">{err}</p>}
      {invites.map(i => (
        <div key={i.id} className="req-row">
          <span>
            <span className="lb-name">{i.group_name}</span>
            <span className="lb-sub">Invité par {i.invited_by_name}</span>
          </span>
          <span className="req-actions">
            <button className="btn btn-soft" onClick={() => respond(i.id, i.group_id, false)}>Refuser</button>
            <button className="btn btn-primary" onClick={() => respond(i.id, i.group_id, true)}>Rejoindre</button>
          </span>
        </div>
      ))}
    </div>
  );
}
