import { useState } from 'react';
import { generateBoard } from './game-data/board';
import { createInitialState, GameEngine } from './game-core/engine';
import GameView from './pixi/GameView';
import { Hud } from './components/Hud';
import { DiceTray } from './components/DiceTray';
import { LogPanel } from './components/LogPanel';
import { ActionPanel, type InteractionMode } from './components/ActionPanel';
import { StartScreen } from './components/StartScreen';
import type { GameAction, GameState } from './game-core/types';

const HINTS: Record<InteractionMode, string> = {
  conquer: "Cliquez un territoire libre ou adverse, puis choisissez le pion qui l'attaque.",
  defend: 'Cliquez un de vos territoires pour y placer un dé en défense.',
  'psychic-probe': 'Cliquez le territoire adverse à sonder.',
  'death-ray': 'Cliquez le territoire à dévaster (irréversible, 1x/partie).',
  'transport-tunneler': "Cliquez le Camp de Base adverse à percer (les défenses sont ignorées).",
  'flying-fortress': 'Cliquez un de vos territoires pour y installer/déplacer la Forteresse Volante.',
  'force-field': 'Cliquez un de vos territoires pour y construire le Champ de Force.',
};

export default function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [mode, setMode] = useState<InteractionMode>('conquer');
  const [pendingTileId, setPendingTileId] = useState<string | null>(null);
  const [pendingPawnId, setPendingPawnId] = useState<string | null>(null);

  if (!state) {
    return <StartScreen onStart={(count) => setState(createInitialState(generateBoard(), count))} />;
  }

  const engine = new GameEngine(state);
  const dispatch = (action: GameAction): GameState => {
    engine.dispatch(action);
    const next = structuredClone(engine.state);
    setState(next);
    return next;
  };

  const resetPending = () => { setPendingTileId(null); setPendingPawnId(null); };

  const onTile = (tileId: string) => {
    if (state.phase !== 'actions') return;
    const tile = state.tiles.find((t) => t.id === tileId);
    if (!tile) return;
    const isOwn = tile.ownerId === state.activePlayerId;

    if (mode === 'conquer') {
      if (isOwn || tile.terrain === 'machine-cemetery' || tile.devastated) return;
      setPendingTileId(tileId);
      setPendingPawnId(null);
      return;
    }
    if (mode === 'defend') {
      if (isOwn) setPendingTileId(tileId);
      return;
    }
    if (mode === 'psychic-probe') {
      if (!isOwn && tile.ownerId) dispatch({ type: 'USE_PSYCHIC_PROBE', tileId });
      setMode('conquer');
      return;
    }
    if (mode === 'death-ray') {
      if (tile.terrain !== 'machine-cemetery') dispatch({ type: 'USE_DEATH_RAY', tileId });
      setMode('conquer');
      return;
    }
    if (mode === 'transport-tunneler') {
      if (!isOwn && tile.ownerId) dispatch({ type: 'USE_TRANSPORT_TUNNELER', tileId });
      setMode('conquer');
      return;
    }
    if (mode === 'flying-fortress') {
      if (isOwn) dispatch({ type: 'MOVE_FLYING_FORTRESS', tileId });
      setMode('conquer');
      return;
    }
    if (mode === 'force-field') {
      if (isOwn) dispatch({ type: 'BUILD_TECHNOLOGY', cardId: 'force-field', tileId });
      setMode('conquer');
    }
  };

  return <div className="app-shell">
    <Hud
      state={state}
      onRoll={() => dispatch({ type: 'ROLL_DICE' })}
      onEndTurn={() => { dispatch({ type: 'END_TURN' }); resetPending(); setMode('conquer'); }}
    />
    <main className="game-layout">
      <section className="board-panel">
        <GameView state={state} onTile={onTile} selectedTileId={pendingTileId} />
        <DiceTray state={state} dispatch={dispatch} />
        <div className="hint">{HINTS[mode]}</div>
      </section>
      <div className="side-panel">
        <ActionPanel
          state={state}
          dispatch={dispatch}
          mode={mode}
          setMode={setMode}
          pendingTileId={pendingTileId}
          setPendingTileId={setPendingTileId}
          pendingPawnId={pendingPawnId}
          setPendingPawnId={setPendingPawnId}
        />
        <LogPanel log={state.log} />
      </div>
    </main>
    <footer>WIRAQOCHA • PIXIJS / REACT • V2 ASSETS • ART DIRECTION: VICTORIAN DIESELPUNK / ANDES</footer>
  </div>;
}
