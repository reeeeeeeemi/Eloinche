'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Croix } from '@/components/Croix';
import { teamNames } from '@/components/GameCard';
import { Header } from '@/components/Header';
import { LineChart } from '@/components/LineChart';
import { PrisesTable } from '@/components/PrisesTable';
import { api } from '@/lib/data';
import { STATUS, fmtDate, signed, timeLeft } from '@/lib/format';
import { ATOUTS, beloteLabel, CROIX_MAX, contratLabel, croix, isFinished, isReussi, perdantCroix } from '@/lib/scoring';
import { useSession } from '@/lib/session';
import type { Team } from '@/lib/types';
import { useData } from '@/lib/useData';
import { awaitsMe, missingOverride } from '@/lib/validation';

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { uid } = useSession();
  const { data: g, loading } = useData(() => api.getGame(id), [id]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Header back title="Partie" />;
  if (!g) {
    return (<><Header back title="Partie" /><main className="main"><div className="empty">Cette partie n’existe plus.</div></main></>);
  }

  const me = g.players.find(p => p.profile_id === uid);
  const creatorTeam = g.players.find(p => p.profile_id === g.created_by)?.team;
  const isCreator = g.created_by === uid;
  const pending = g.status === 'en_attente';
  const finished = isFinished(g);
  const cx = croix(g.rounds);
  const perdant = perdantCroix(g.rounds);
  const st = STATUS[g.status];
  const nameOf = (pid?: string | null) => g.players.find(p => p.profile_id === pid)?.display_name ?? '';

  async function run(fn: () => Promise<void>, after?: () => void) {
    setBusy(true); setErr(null);
    try { await fn(); after?.(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const cumA = [0], cumB = [0];
  g.rounds.forEach(r => { cumA.push(cumA.at(-1)! + r.score_a); cumB.push(cumB.at(-1)! + r.score_b); });

  const teamBlock = (t: Team) => (
    <div className={`gc-line ${g.winner === t ? 'win' : ''}`} style={{ fontSize: 20 }}>
      <span>{teamNames(g, t)} <Croix n={cx[t]} /></span>
      <span className="gc-score">{t === 'A' ? g.score_a : g.score_b}</span>
    </div>
  );

  return (
    <>
      <Header back title={fmtDate(g.created_at)} />
      <main className="main">
        <div className="card">
          <div className="gc-head">
            <span className="dot" style={{ background: st.color }} />
            <span className="gc-title">{g.group_id ? st.label : g.status === 'en_cours' ? 'Amicale · en cours' : 'Amicale'}</span>
            <span className="gc-date">{g.target} pts</span>
          </div>
          <div className="gc-body">{teamBlock('A')}{teamBlock('B')}</div>
          {perdant && (
            <p className="small muted card-pad" style={{ margin: 0, paddingTop: 0 }}>
              Perdue par {teamNames(g, perdant)} : {CROIX_MAX} capots non annoncés.
            </p>
          )}
        </div>

        {pending && (
          <div className="card card-pad">
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
              En attente de validation, automatique {timeLeft(g.validate_deadline!)} sans contestation
            </p>
            <p className="small muted" style={{ margin: 0 }}>
              Saisie par {nameOf(g.created_by)}. Elle est validée tout de suite si {creatorTeam === 'A' ? teamNames(g, 'B').replace(' - ', ' ou ') : teamNames(g, 'A').replace(' - ', ' ou ')} confirme.
            </p>
            <div className="confirm-list">
              {g.players.map(p => (
                <span key={p.profile_id} className={p.confirmed ? 'ok' : 'no'}>
                  {p.confirmed ? '✓' : '○'} {p.display_name}
                </span>
              ))}
            </div>
            {err && <p className="error">{err}</p>}
            {me && (
              <div className="btn-row" style={{ marginTop: 16 }}>
                {!me.confirmed && (
                  <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.confirmGame(g.id))}>Confirmer</button>
                )}
                {finished && (
                  <button className="btn btn-danger" disabled={busy}
                    onClick={() => confirm('Contester cette partie ? Elle ne comptera pas, sauf si les 3 autres joueurs confirment. Ta contestation sera visible sur ton profil.') && run(() => api.contestGame(g.id))}>
                    Contester
                  </button>
                )}
              </div>
            )}
            {!me && <p className="small muted" style={{ marginTop: 12 }}>Tu ne joues pas dans cette partie, seuls les joueurs peuvent la confirmer.</p>}
          </div>
        )}

        {g.status === 'contestee' && (
          <div className="card card-pad">
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Contestée par {nameOf(g.contested_by)}</p>
            <p className="small muted" style={{ margin: 0 }}>
              Elle ne compte pas pour l’instant. Elle sera quand même validée si les 3 autres joueurs confirment
              {missingOverride(g).length > 0 ? ` (encore ${missingOverride(g).map(p => p.display_name).join(', ')})` : ''}.
            </p>
            <div className="confirm-list">
              {g.players.filter(p => p.profile_id !== g.contested_by).map(p => (
                <span key={p.profile_id} className={p.confirmed ? 'ok' : 'no'}>
                  {p.confirmed ? '✓' : '○'} {p.display_name}
                </span>
              ))}
            </div>
            {err && <p className="error">{err}</p>}
            {awaitsMe(g, uid) && (
              <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={busy}
                onClick={() => run(() => api.confirmGame(g.id))}>Confirmer le résultat</button>
            )}
            {isCreator && <p className="small muted" style={{ marginBottom: 0 }}>Si la saisie est vraiment fausse, supprime-la et saisis-la à nouveau.</p>}
          </div>
        )}

        {g.status === 'validee' && (
          <div className="card">
            {g.players.map(p => (
              <div key={p.profile_id} className="lb-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                <span className="lb-name">{p.display_name}</span>
                <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.elo_before} → {p.elo_after}</span>
                <span className={(p.elo_delta ?? 0) >= 0 ? 'up' : 'down'} style={{ fontWeight: 700, minWidth: 44, textAlign: 'right' }}>
                  {signed(p.elo_delta ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}

        {g.rounds.length > 0 && (
          <div className="card card-pad">
            {g.rounds.length > 1 && (
              <div style={{ marginBottom: 18 }}>
                <LineChart zeroBased series={[
                  { name: teamNames(g, 'A'), color: '#12a9d6', values: cumA },
                  { name: teamNames(g, 'B'), color: '#6a4fc8', values: cumB },
                ]} />
              </div>
            )}
            <PrisesTable rounds={g.rounds} players={g.players.map(p => p.profile_id)} name={nameOf} />
          </div>
        )}

        <div className="card" style={{ padding: '4px 16px' }}>
          {g.rounds.map((r, i) => {
            const ok = isReussi(r);
            const cls = (t: Team) => !r.fausse_donne && r.preneur === t ? (ok ? 'win-c' : 'lose-c') : '';
            const atout = ATOUTS.find(a => a.key === r.atout)?.label;
            return (
              <div key={i} className="round-row">
                <span className={cls('A')}>{r.score_a}</span>
                <span className="n">{i + 1}</span>
                <span className={cls('B')}>{r.score_b}</span>
                <span className="meta">
                  {r.fausse_donne ? `Fausse donne ${teamNames(g, r.fausse_donne)}` : (
                    <>
                      {nameOf(r.preneur_id)} {contratLabel(r.contrat)}{atout ? ` ${atout}` : ''}
                      {r.coinche === 2 ? ', coinché' : r.coinche === 4 ? ', surcoinché' : ''}{beloteLabel(r)}{r.capot ? ', capot' : ''}
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {isCreator && g.status !== 'validee' && (
          <button className="btn btn-danger btn-block" disabled={busy}
            onClick={() => confirm('Supprimer définitivement cette partie ?') && run(() => api.deleteGame(g.id), () => router.replace('/historique'))}>
            Supprimer la partie
          </button>
        )}
      </main>
    </>
  );
}
