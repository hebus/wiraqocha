import { useState } from 'react';
import type { PlayerId } from '../game-core/types';

const ALL_PLAYER_IDS: PlayerId[] = ['albion', 'helios', 'meridian', 'valhalla'];
const PLAYER_NAMES: Record<PlayerId, string> = { albion: 'Albion', helios: 'Helios', meridian: 'Meridian', valhalla: 'Valhalla' };

export function AISetupScreen({ playerCount, onConfirm }: { playerCount: 2 | 3 | 4; onConfirm: (aiPlayerIds: PlayerId[]) => void }) {
  const players = ALL_PLAYER_IDS.slice(0, playerCount);
  const [aiIds, setAiIds] = useState<PlayerId[]>([]);

  const toggle = (id: PlayerId) => {
    setAiIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  return (
    <div className="start-screen">
      <div className="start-card">
        <div className="start-brand">
          <span>⚓</span>
          <h1>WIRAQOCHA</h1>
          <p>EXPEDITION PROTOCOL</p>
        </div>
        <h2>Quels consortiums sont des IA ?</h2>
        <div className="start-options">
          {players.map((id) => (
            <label key={id} className="ai-setup-row">
              <span>{PLAYER_NAMES[id]}</span>
              <input type="checkbox" checked={aiIds.includes(id)} onChange={() => toggle(id)} />
              <span className="ai-setup-tag">{aiIds.includes(id) ? 'IA' : 'Humain'}</span>
            </label>
          ))}
        </div>
        <button className="start-option" style={{ marginTop: 18 }} onClick={() => onConfirm(aiIds)}>
          Commencer la partie
        </button>
        <p className="start-hint">Les consortiums non cochés restent joués en local (hotseat) par des humains.</p>
      </div>
    </div>
  );
}
