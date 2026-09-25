import { useEffect, useRef, useState } from 'react';
import { generateBoard } from './game-data/board';
import { createInitialState, GameEngine } from './game-core/engine';
import { chooseNextAction } from './game-core/ai';
import GameView from './pixi/GameView';
import { Hud } from './components/Hud';
import { DiceTray } from './components/DiceTray';
import { LogPanel } from './components/LogPanel';
import { ActionPanel, type InteractionMode } from './components/ActionPanel';
import { StartScreen } from './components/StartScreen';
import { AISetupScreen } from './components/AISetupScreen';
import type { GameAction, GameState, PlayerId } from './game-core/types';

const HINTS: Record<InteractionMode, string> = {
  conquer: "Cliquez un territoire libre ou adverse, puis choisissez le pion qui l'attaque.",
  defend: 'Cliquez un de vos territoires pour y placer un dé en défense.',
  'psychic-probe': 'Cliquez le territoire adverse à sonder.',
  'death-ray': 'Cliquez le territoire à dévaster (irréversible, 1x/partie).',
  'transport-tunneler': "Cliquez le Camp de Base adverse à percer (les défenses sont ignorées).",
  'flying-fortress': 'Cliquez un de vos territoires pour y installer/déplacer la Forteresse Volante.',
  'force-field': 'Cliquez un de vos territoires pour y construire le Champ de Force.',
};

// Hard safety net against any unforeseen AI loop — should never actually trigger (see ai.ts's
// multi-tick continuity contract), but forces a turn to end rather than hang forever.
const AI_MAX_TICKS_PER_TURN = 40;
const AI_TICK_DELAY_MS = 700;
const AI_TICK_DELAY_JITTER_MS = 200;

export default function App() {
  const [setupStep, setSetupStep] = useState<'count' | 'ai'>('count');
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(4);
  const [state, setState] = useState<GameState | null>(null);
  const [mode, setMode] = useState<InteractionMode>('conquer');
  const [pendingTileId, setPendingTileId] = useState<string | null>(null);
  const [pendingPawnId, setPendingPawnId] = useState<string | null>(null);
  const aiTicksThisTurn = useRef(0);
  const aiTurnKey = useRef<string | null>(null);

  // AI turn runner: declared unconditionally (hooks rule) even though it only ever acts once a
  // game is in progress and the active player is AI-controlled.
  useEffect(() => {
    if (!state) return;
    const activePlayer = state.players.find((p) => p.id === state.activePlayerId);
    if (!activePlayer?.isAI || state.phase === 'finished') return;

    const turnKey = `${state.turn}-${state.activePlayerId}`;
    if (aiTurnKey.current !== turnKey) {
      aiTurnKey.current = turnKey;
      aiTicksThisTurn.current = 0;
    }

    const timer = setTimeout(() => {
      aiTicksThisTurn.current += 1;
      const action: GameAction = aiTicksThisTurn.current > AI_MAX_TICKS_PER_TURN
        ? { type: 'END_TURN' }
        : chooseNextAction(state);
      const engine = new GameEngine(state);
      engine.dispatch(action);
      setState(structuredClone(engine.state));
    }, AI_TICK_DELAY_MS + Math.random() * AI_TICK_DELAY_JITTER_MS);

    return () => clearTimeout(timer);
  }, [state]);

  if (!state) {
    if (setupStep === 'count') {
      return <StartScreen onStart={(count) => { setPlayerCount(count); setSetupStep('ai'); }} />;
    }
    return <AISetupScreen
      playerCount={playerCount}
      onConfirm={(aiIds: PlayerId[]) => setState(createInitialState(generateBoard(), playerCount, aiIds))}
    />;
  }

  const activePlayer = state.players.find((p) => p.id === state.activePlayerId)!;
  const isAITurn = !!activePlayer.isAI && state.phase !== 'finished';

  const engine = new GameEngine(state);
  const dispatch = (action: GameAction): GameState => {
    engine.dispatch(action);
    const next = structuredClone(engine.state);
    setState(next);
    return next;
  };
  // Passed to human-facing controls so a click during the AI's turn can never mutate game state.
  const guardedDispatch = (action: GameAction): GameState => (isAITurn ? state : dispatch(action));

  const resetPending = () => { setPendingTileId(null); setPendingPawnId(null); };

  const onTile = (tileId: string) => {
    if (isAITurn) return;
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
      onRoll={() => guardedDispatch({ type: 'ROLL_DICE' })}
      onEndTurn={() => { guardedDispatch({ type: 'END_TURN' }); resetPending(); setMode('conquer'); }}
    />
    <main className="game-layout">
      <section className="board-panel">
        {isAITurn && <div className="ai-banner">🤖 {activePlayer.name} réfléchit…</div>}
        <GameView state={state} onTile={onTile} selectedTileId={pendingTileId} />
        <DiceTray state={state} dispatch={guardedDispatch} />
        <div className="hint">{HINTS[mode]}</div>
      </section>
      <div className="side-panel">
        <ActionPanel
          state={state}
          dispatch={guardedDispatch}
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
