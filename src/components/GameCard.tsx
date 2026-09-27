'use client';
import Link from 'next/link';
import type { GameWithPlayers, Team } from '@/lib/types';
import { STATUS, fmtDate, signed, timeLeft } from '@/lib/format';
import { awaitsMe } from '@/lib/validation';

export function teamNames(g: GameWithPlayers, t: Team) {
  return g.players.filter(p => p.team === t).map(p => p.display_name).join(' - ');
}

/** groupName : affiché quand on a plusieurs groupes et que la liste les mélange. */
export function GameCard({ g, uid, groupName }: { g: GameWithPlayers; uid: string | null; groupName?: string }) {
  const st = STATUS[g.status];
  const todo = awaitsMe(g, uid);
  const deltaOf = (t: Team) => g.players.find(p => p.team === t)?.elo_delta ?? null;

  const line = (t: Team) => {
    const d = deltaOf(t);
    return (
      <div className={`gc-line ${g.winner === t ? 'win' : ''}`}>
        <span>{teamNames(g, t)}{d != null && (
          <span className={d >= 0 ? 'up' : 'down'} style={{ fontSize: 13, fontWeight: 600, marginLeft: 8 }}>{signed(d)}</span>
        )}</span>
        <span className="gc-score">{t === 'A' ? g.score_a : g.score_b}</span>
      </div>
    );
  };

  return (
    <Link href={g.status === 'en_cours' ? `/partie/${g.id}` : `/historique/${g.id}`} className="card" style={{ display: 'block' }}>
      <div className="gc-head">
        <span className="dot" style={{ background: st.color }} aria-label={st.label} />
        <span className="gc-title">
          {g.status === 'en_cours' ? `En cours · ${g.target} pts` : g.group_id ? 'Coinche' : 'Amicale'}
          {g.status === 'en_cours' && !g.group_id && <span className="muted"> · amicale</span>}
          {groupName && <span className="muted"> · {groupName}</span>}
        </span>
        <span className="gc-date">{fmtDate(g.created_at)}</span>
      </div>
      <div className="gc-body">{line('A')}{line('B')}</div>
      {g.status === 'en_attente' && (
        <div className={`gc-foot ${todo ? 'todo' : ''}`}>
          {todo ? 'À toi de confirmer ou contester' : `Validation automatique ${timeLeft(g.validate_deadline!)}`}
        </div>
      )}
      {g.status === 'en_cours' && (
        <div className="gc-foot">{g.rounds.length} manche{g.rounds.length > 1 ? 's' : ''} jouée{g.rounds.length > 1 ? 's' : ''}</div>
      )}
      {g.status === 'contestee' && (
        <div className={`gc-foot ${todo ? 'todo' : ''}`}>
          {todo ? 'Contestée : confirme si le résultat est juste' : `Contestée par ${g.players.find(p => p.profile_id === g.contested_by)?.display_name ?? '?'}, ne compte pas pour l’instant`}
        </div>
      )}
    </Link>
  );
}
