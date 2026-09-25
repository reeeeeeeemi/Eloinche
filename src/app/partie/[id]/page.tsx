'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChartLine, List, Pencil, Plus, SkipForward, Trash2, X } from 'lucide-react';
import { AjoutManche } from '@/components/AjoutManche';
import { Header } from '@/components/Header';
import { LineChart } from '@/components/LineChart';
import { PrisesTable } from '@/components/PrisesTable';
import { api } from '@/lib/data';
import { ATOUTS, contratLabel, fausseDonneRank, isFinished, isReussi } from '@/lib/scoring';
import { useSession } from '@/lib/session';
import { dealerOf, teamA, teamB } from '@/lib/table';
import type { Round } from '@/lib/types';
import { useData } from '@/lib/useData';

function DealerIcon() {
  return <span className="dealer" title="Distribue" aria-label="Distribue">🃏</span>;
}

export default function PartiePage() {
  const { id: gameId } = useParams<{ id: string }>();
  const router = useRouter();
  const { uid } = useSession();
  const { data: game, loading } = useData(() => api.getGame(gameId), [gameId]);
  const { data: profiles } = useData(() => api.getProfiles(), []);
  const [tab, setTab] = useState<'scores' | 'stats'>('scores');
  // feuille de saisie : ajout d'une manche, ou modification de la manche d'indice donné
  const [sheet, setSheet] = useState<null | { edit: number | null }>(null);
  const [sel, setSel] = useState<number | null>(null); // manche sélectionnée (barre d'actions)
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const over = game != null && game.status !== 'en_cours';

  // Partie terminée entre-temps (par un autre joueur) -> sa fiche dans l'historique
  useEffect(() => { if (over) router.replace(`/historique/${gameId}`); }, [over, gameId, router]);

  if (loading || over) return null;
  if (!game || !game.seats) {
    return (
      <>
        <Header title="Partie" />
        <main className="main">
          <div className="empty">
            Cette partie n’existe plus.
            <div style={{ marginTop: 18 }}>
              <Link href="/partie" className="btn btn-primary" style={{ display: 'inline-grid', placeItems: 'center' }}>Parties en cours</Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const name = (id: string) => profiles?.find(p => p.id === id)?.display_name ?? '…';
  const A = teamA(game), B = teamB(game);
  const t = { A: game.score_a, B: game.score_b };
  const finished = isFinished(t.A, t.B, game.target);
  const player = game.players.some(p => p.profile_id === uid);
  const leader = t.A >= t.B ? A : B;
  const dealer = dealerOf(game);
  const manche = game.rounds.length + 1;

  // cumul pour le graphe
  const cumA = [0], cumB = [0];
  game.rounds.forEach(r => { cumA.push(cumA.at(-1)! + r.score_a); cumB.push(cumB.at(-1)! + r.score_b); });

  const nameSlot = (id: string) => (
    <div className="sb-name">{dealer === id && <DealerIcon />}{name(id)}</div>
  );

  async function run(fn: () => Promise<void>) {
    setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  async function submit() {
    setSaving(true);
    await run(async () => {
      await api.finishGame(game!.id);
      router.replace(`/historique/${game!.id}`);
    });
    setSaving(false);
  }

  const addRound = (r: Round) => run(() => api.addRound(game.id, r));
  const updateRound = (i: number, r: Round) => run(() => api.updateRound(game.id, i, r));
  const deleteRound = (i: number) => run(() => api.deleteRound(game.id, i));
  const labelOf = (t: 'A' | 'B') => (t === 'A' ? A : B).map(name).join('/');

  return (
    <>
      <Header back="close" title={`${manche === 1 ? '1re' : `${manche}e`} manche | ${game.target} pts`}
        onBack={() => router.push('/partie')} alignLeft
        extra={player && !finished && (
          <button className="icon-btn" aria-label="Passer la donne"
            onClick={() => run(() => api.skipDealer(game.id))}>
            <SkipForward size={24} />
          </button>
        )} />
      <main className="main">
        <div className="scoreband">
          <div className="sb-team">
            {nameSlot(A[0])}
            <div className="sb-score">{t.A}</div>
            {nameSlot(A[1])}
          </div>
          <div className="sb-team">
            {nameSlot(B[0])}
            <div className="sb-score">{t.B}</div>
            {nameSlot(B[1])}
          </div>
        </div>

        {finished && (
          <div className="banner">
            <strong>{leader.map(name).join(' et ')} gagnent {Math.max(t.A, t.B)} à {Math.min(t.A, t.B)}</strong>
            <p className="small" style={{ margin: '-4px 0 14px' }}>
              La partie sera validée dès qu’un adversaire confirme, ou automatiquement dans 48 h sans contestation.
            </p>
            <button className="btn btn-primary btn-block" disabled={saving || !player} onClick={submit}>
              {saving ? 'Enregistrement…' : 'Enregistrer la partie'}
            </button>
          </div>
        )}

        {err && <p className="error">{err}</p>}
        {!player && <p className="small muted">Tu ne joues pas dans cette partie : lecture seule.</p>}


        {tab === 'scores' && (
          <div>
            {game.rounds.length === 0 && <div className="empty">Ajoute la première manche avec le bouton +.</div>}
            {game.rounds.map((r, i) => {
              const ok = isReussi(r);
              const cls = (team: 'A' | 'B') => !r.fausse_donne && r.preneur === team ? (ok ? 'win-c' : 'lose-c') : '';
              const atout = ATOUTS.find(a => a.key === r.atout)?.label;
              const rank = r.fausse_donne ? fausseDonneRank(game.rounds, i) : 0;
              return (
                sel === i ? (
                  <div key={i} className="round-actions">
                    <button onClick={() => setSheet({ edit: i })}><Pencil size={22} />Modifier</button>
                    <button onClick={() => {
                      if (confirm(`Supprimer la manche ${i + 1} ?`)) { deleteRound(i); setSel(null); }
                    }}><Trash2 size={22} />Supprimer</button>
                    <button aria-label="Fermer" onClick={() => setSel(null)}><X size={24} /></button>
                  </div>
                ) : (
                  <button key={i} className="round-row" disabled={!player} onClick={() => setSel(i)}>
                    <span className={cls('A')}>{r.score_a}</span>
                    <span className="n">{i + 1}</span>
                    <span className={cls('B')}>{r.score_b}</span>
                    <span className="meta">
                      {r.fausse_donne ? (
                        <>Fausse donne {labelOf(r.fausse_donne)} ({rank === 1 ? '1re' : `${rank}e`}){rank >= 2 ? ', 160 pour l’adversaire' : ''}</>
                      ) : (
                        <>
                          {r.preneur_id ? name(r.preneur_id) : ''} {contratLabel(r.contrat)}{atout ? ` ${atout}` : ''}
                          {r.coinche === 2 ? ', coinché' : r.coinche === 4 ? ', surcoinché' : ''}{r.belote ? ', belote' : ''}{r.capot ? ', capot' : ''}
                        </>
                      )}
                    </span>
                  </button>
                )
              );
            })}
            {player && game.rounds.length > 0 && (
              <p className="small muted" style={{ textAlign: 'center' }}>Touche une manche pour la modifier ou la supprimer.</p>
            )}
          </div>
        )}

        {tab === 'stats' && (
          <div className="card card-pad">
            <LineChart zeroBased series={[
              { name: A.map(name).join('/'), color: '#12a9d6', values: cumA },
              { name: B.map(name).join('/'), color: '#6a4fc8', values: cumB },
            ]} />
            <div style={{ marginTop: 18 }}>
              <PrisesTable rounds={game.rounds} players={game.seats} name={name} />
            </div>
          </div>
        )}
      </main>

      <nav className="nav game-nav" aria-label="Vues de la partie">
        <div className="nav-inner">
          <button className={tab === 'scores' ? 'active' : ''} onClick={() => setTab('scores')}>
            <span className="pill"><List size={24} /></span>Scores
          </button>
          <div className="fab-slot" />
          <button className={tab === 'stats' ? 'active' : ''} onClick={() => { setTab('stats'); setSel(null); }}>
            <span className="pill"><ChartLine size={24} /></span>Stats
          </button>
        </div>
      </nav>

      {!finished && player && (
        <button className="fab" aria-label="Ajouter une manche" onClick={() => { setSel(null); setSheet({ edit: null }); }}><Plus size={32} /></button>
      )}

      {sheet && (
        <AjoutManche teamA={A} teamB={B} name={name}
          initial={sheet.edit !== null ? game.rounds[sheet.edit] : undefined}
          onClose={() => setSheet(null)}
          fdBefore={{
            A: game.rounds.slice(0, sheet.edit ?? game.rounds.length).filter(r => r.fausse_donne === 'A').length,
            B: game.rounds.slice(0, sheet.edit ?? game.rounds.length).filter(r => r.fausse_donne === 'B').length,
          }}
          onSave={r => {
            if (sheet.edit !== null) { updateRound(sheet.edit, r); setSel(null); } else addRound(r);
            setSheet(null);
          }} />
      )}
    </>
  );
}
