import type { GameState } from '../game-core/types';
import { leviathanProgress, leviathanThreshold, somniumVictoryThreshold } from '../game-core/rules';

const colors: Record<string,string> = { albion:'#b74c32', helios:'#3f79a6', meridian:'#3d8a68', valhalla:'#b88b3d' };

export function Hud({ state, onRoll, onEndTurn }: { state: GameState; onRoll:()=>void; onEndTurn:()=>void }) {
  const player = state.players.find(p => p.id === state.activePlayerId)!;
  const somniumGoal = somniumVictoryThreshold(state.players.length);
  const leviathanGoal = leviathanThreshold(state.players.length);
  return <>
    <header className="topbar">
      <div className="brand"><span>⚓</span><strong>WIRAQOCHA</strong><small>EXPEDITION PROTOCOL</small></div>
      <div className="turn">TOUR {state.turn} <b>•</b> {player.name.toUpperCase()}</div>
      <div className="resources"><span>💎 {player.somnium}</span><span>▣ {player.resources}</span><span>⚙ {player.technologies.length}</span></div>
    </header>
    <div className="phase">{state.phase === 'preparation' ? 'PRÉPARATION' : state.phase === 'actions' ? 'ACTIONS' : state.phase === 'finished' ? 'PARTIE TERMINÉE' : 'FIN DU TOUR'}</div>
    <div className="player-strip">
      {state.players.map(p => {
        const lev = leviathanProgress(p);
        return <div key={p.id} className="player-card" style={{borderColor:colors[p.id]}}>
          <span className="dot" style={{background:colors[p.id]}} />{p.name}
          <b title="Somnium en réserve / seuil de victoire">💎 {p.somnium}/{somniumGoal}</b>
          <b title="Ressources en stock (plafonnées à 3 en fin de tour)">▣ {p.resources}</b>
          <b title="Progression Léviathan : Ressources+Somnium cumulés dépensés en Technologies / seuil de victoire">🏛 {lev.resources}/{leviathanGoal.resources} · {lev.somnium}/{leviathanGoal.somnium}</b>
          <b title="Artefacts réunis / victoire">☠ {p.artifacts.length}/4</b>
        </div>;
      })}
    </div>
    <div className="actions">
      {state.phase === 'preparation' && <button onClick={onRoll}>🎲 LANCER LES DÉS</button>}
      {state.phase === 'actions' && <button onClick={onEndTurn}>FIN DU TOUR</button>}
      {state.phase === 'finished' && <div className="victory">
        🏆 {state.players.find(p=>p.id===state.winner)?.name} remporte la partie
        {state.winMessage && <div className="victory-reason">{state.winMessage}</div>}
      </div>}
    </div>
  </>;
}
