'use client';
import { useState } from 'react';
import { api } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { useData } from '@/lib/useData';

/** Admin : comptes en attente (et refusés) à accepter ou refuser. */
export function JoinRequests() {
  const { data: reqs, error } = useData(() => api.listJoinRequests(), []);
  const [err, setErr] = useState<string | null>(null);
  const pending = (reqs ?? []).filter(r => r.status === 'en_attente');
  const refused = (reqs ?? []).filter(r => r.status === 'refuse');

  const decide = async (id: string, accept: boolean) => {
    setErr(null);
    try { await api.decideJoinRequest(id, accept); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const row = (r: (typeof pending)[number], actions: React.ReactNode) => (
    <div key={r.id} className="req-row">
      <span>
        <span className="lb-name">{r.display_name}</span>
        <span className="lb-sub">{r.email ?? 'email inconnu'} · {fmtDate(r.created_at)}</span>
      </span>
      <span className="req-actions">{actions}</span>
    </div>
  );

  return (
    <div className="card card-pad">
      <h2 className="section-title" style={{ fontSize: 17 }}>
        Demandes d’accès{pending.length ? ` (${pending.length})` : ''}
      </h2>
      {(error || err) && <p className="error">{error ?? err}</p>}
      {reqs && pending.length === 0 && <p className="small muted" style={{ margin: 0 }}>Aucune demande en attente.</p>}
      {pending.map(r => row(r, <>
        <button className="btn btn-soft" onClick={() => decide(r.id, false)}>Refuser</button>
        <button className="btn btn-primary" onClick={() => decide(r.id, true)}>Accepter</button>
      </>))}
      {refused.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="small muted">Refusés ({refused.length})</summary>
          {refused.map(r => row(r, <button className="btn btn-outline" onClick={() => decide(r.id, true)}>Accepter</button>))}
        </details>
      )}
    </div>
  );
}
