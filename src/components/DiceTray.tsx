import type { GameAction, GameState } from '../game-core/types';

export function DiceTray({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  if (!state.dice.values.length) return null;
  const player = state.players.find((p) => p.id === state.activePlayerId)!;
  const canAdjust = player.resources >= 2;
  const canReroll = state.turnUsed.ruinsRerolls < state.turnUsed.ruinsCapacity;
  const canExoskeleton = player.technologies.includes('battle-exoskeleton')
    && (player.techBuiltTurn['battle-exoskeleton'] ?? 0) < state.turn
    && !state.turnUsed.battleExoskeleton;

  return <div className="dice-tray">
    {state.dice.values.map((v, i) => (
      <div key={i} className="die-slot">
        <button
          className={state.selectedDice.includes(i) ? 'die selected' : 'die'}
          disabled={state.dice.used[i]}
          onClick={() => dispatch({ type: 'SELECT_DIE', index: i })}
        >{v}</button>
        {!state.dice.used[i] && <div className="die-tools">
          <button type="button" title="Dépenser 2 Ressources : -1" disabled={!canAdjust || v <= 1} onClick={() => dispatch({ type: 'ADJUST_DIE', index: i, delta: -1 })}>−</button>
          <button type="button" title="Dépenser 2 Ressources : +1" disabled={!canAdjust} onClick={() => dispatch({ type: 'ADJUST_DIE', index: i, delta: 1 })}>+</button>
          {canReroll && <button type="button" title="Relancer (Ruines)" onClick={() => dispatch({ type: 'REROLL_DIE', index: i })}>↻</button>}
          {canExoskeleton && <button type="button" title="Exosquelette de Combat : -> 5" onClick={() => dispatch({ type: 'USE_BATTLE_EXOSKELETON', dieIndex: i })}>⚙5</button>}
        </div>}
      </div>
    ))}
  </div>;
}
