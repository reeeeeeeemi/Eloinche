'use client';
import Link from 'next/link';
import { LineChart } from '@/components/LineChart';
import { api } from '@/lib/data';
import { BASE_ELO } from '@/lib/elo';
import { fmtDate, signed } from '@/lib/format';
import { useGroup } from '@/lib/group';
import { useData } from '@/lib/useData';

/** Fiche d'un joueur dans le groupe affiché. */
export function PlayerView({ id }: { id: string }) {
  const { group } = useGroup();
  const gid = group?.id;
  const { data: all } = useData(() => (gid ? api.getPlayers(gid) : Promise.resolve([])), [gid]);
  const { data: hist } = useData(() => (gid ? api.getEloHistory(gid, id) : Promise.resolve([])), [gid, id]);
  const { data: games } = useData(() => api.getGames(), []);
  const contests = (games ?? []).filter(g => g.group_id === gid && g.contested_by === id).length;
  const p = all?.find(x => x.id === id);

  if (!p) return all ? <div className="empty">Ce joueur ne fait pas partie du groupe {group?.name}.</div> : null;
  const rank = p.games_played > 0 ? (all ?? []).filter(x => x.games_played > 0).findIndex(x => x.id === p.id) + 1 : null;
  const best = hist?.length ? Math.max(BASE_ELO, ...hist.map(h => h.elo_after)) : BASE_ELO;

  return (
    <>
      <div className="card lb-hero">
        <div style={{ fontSize: 24, fontWeight: 600 }}>{p.display_name}</div>
        <div className="elo-big" style={{ marginTop: 14 }}>{p.elo}</div>
        <div className="muted small">{rank ? `${rank === 1 ? '1er' : `${rank}e`} au classement ${group?.name}` : `Pas encore classé dans ${group?.name}`}</div>
      </div>

      <div className="card card-pad">
        <table className="stats">
          <thead><tr><th style={{ textAlign: 'center' }}>Parties</th><th>Victoires</th><th>Défaites</th><th>Record</th><th>Contest.</th></tr></thead>
          <tbody><tr>
            <td style={{ textAlign: 'center' }}>{p.games_played}</td>
            <td className="win-c">{p.games_won}</td>
            <td className="lose-c">{p.games_lost}</td>
            <td>{best}</td>
            <td className={contests > 0 ? 'lose-c' : ''}>{contests}</td>
          </tr></tbody>
        </table>
      </div>

      {hist && hist.length > 0 && (
        <>
          <div className="card card-pad">
            <h2 className="section-title" style={{ fontSize: 16 }}>Évolution de l’Elo</h2>
            <LineChart series={[{ name: 'Elo', color: '#2f7f78', values: [BASE_ELO, ...hist.map(h => h.elo_after)] }]} height={180} />
          </div>
          <div className="card">
            {[...hist].reverse().map(h => (
              <Link key={h.game_id} href={`/historique/${h.game_id}`} className="lb-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                <span>{fmtDate(h.date)}</span>
                <span className="muted">{h.elo_after}</span>
                <span className={h.elo_delta >= 0 ? 'up' : 'down'} style={{ fontWeight: 700, minWidth: 44, textAlign: 'right' }}>{signed(h.elo_delta)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
