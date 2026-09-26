import { Container, Text } from 'pixi.js';
import type { GameAction, GameState } from '../game-core/types';
import { GameEngine } from '../game-core/engine';
import { chooseNextAction } from '../game-core/ai';
import { Store } from '../state/store';
import { HudView, HUD_HEIGHT } from '../pixi/HudView';
import { BoardView } from '../pixi/BoardView';
import { DiceTrayView } from '../pixi/DiceTrayView';
import { ActionPanelView, type InteractionMode } from '../pixi/ActionPanelView';
import { LogPanelView } from '../pixi/LogPanelView';
import { hint as hintStyle } from '../pixi/theme';

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

const GAP = 12;
const SIDE_PANEL_WIDTH = 340;
const LOG_PANEL_WIDTH = 260;
const JOURNAL_HEIGHT = 300;
// Fixed height reserved for the dice row (die + its tool buttons below), so the turn button right
// under it never shifts position depending on whether dice are currently showing. Tall enough for
// the widest per-die tool stack (adjust/adjust/reroll/exoskeleton).
const DICE_ROW_RESERVED_HEIGHT = 78;

/** Top-level game screen: composes Hud/Board/DiceTray/ActionPanel/LogPanel, owns the interaction mode and the AI turn scheduler. */
export class GameScene {
  readonly container = new Container();
  private overlayLayer = new Container();

  private hud: HudView;
  private board: BoardView;
  private diceTray: DiceTrayView;
  private actionPanel: ActionPanelView;
  private logPanel: LogPanelView;
  private hintText: Text;

  private mode: InteractionMode = 'conquer';
  private pendingTileId: string | null = null;
  private pendingPawnId: string | null = null;

  private screenWidth = 1;
  private screenHeight = 1;

  private aiTicksThisTurn = 0;
  private aiTurnKey: string | null = null;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private store: Store<GameState>, private onQuit: () => void) {
    this.hud = new HudView(
      () => this.dispatch({ type: 'ROLL_DICE' }),
      () => { this.dispatch({ type: 'END_TURN' }); this.mode = 'conquer'; this.pendingTileId = null; this.pendingPawnId = null; this.actionPanel.resetError(); this.renderAll(); },
      () => this.onQuit(),
    );
    this.board = new BoardView((id) => this.onTile(id));
    this.diceTray = new DiceTrayView((a) => this.guardedDispatch(a));
    this.actionPanel = new ActionPanelView({
      dispatch: (a) => this.guardedDispatch(a),
      setMode: (m) => this.setMode(m),
      setPendingTileId: (id) => this.setPendingTileId(id),
      setPendingPawnId: (id) => this.setPendingPawnId(id),
    }, this.overlayLayer);
    this.logPanel = new LogPanelView();

    this.hintText = new Text({ text: '', style: { ...hintStyle, wordWrap: false, align: 'center' } });
    this.hintText.anchor.set(0.5, 0);

    // Board first (bottom of the stack) so it fills the whole screen behind every floating HUD panel.
    // The journal only ever shows a handful of lines (the engine caps it at 16), so it doesn't need
    // the side column's full height — the dice tray and turn button float, unboxed, below it.
    this.container.addChild(
      this.board.container,
      this.hud.topContainer,
      this.actionPanel.container,
      this.logPanel.container,
      this.diceTray.container,
      this.hud.actionContainer,
      this.hintText,
      this.hud.victoryContainer,
      this.overlayLayer,
    );

    this.store.subscribe((state) => {
      this.renderAll();
      this.scheduleAiTickIfNeeded(state);
    });

    this.layout(window.innerWidth, window.innerHeight);
    this.board.mount(this.store.state).then(() => this.renderAll());
    this.scheduleAiTickIfNeeded(this.store.state);
  }

  layout(width: number, height: number) {
    this.screenWidth = width;
    this.screenHeight = height;
    this.hud.layout(width);

    // Actions on the left, journal on the right — bookending the board, which fits and centers
    // itself in the gap left between them (the board still covers the full screen, so panning
    // can slide it under either panel).
    this.board.layout(0, 0, width, height, GAP + SIDE_PANEL_WIDTH + GAP, LOG_PANEL_WIDTH + GAP * 2);

    const sideY = HUD_HEIGHT + GAP;
    const sideHeight = Math.max(200, height - HUD_HEIGHT - GAP * 2);
    this.actionPanel.container.position.set(GAP, sideY);
    this.actionPanel.layout(SIDE_PANEL_WIDTH, sideHeight);

    const rightX = width - LOG_PANEL_WIDTH - GAP;
    const journalHeight = Math.min(JOURNAL_HEIGHT, sideHeight * 0.6);
    this.logPanel.container.position.set(rightX, sideY);
    this.logPanel.layout(LOG_PANEL_WIDTH, journalHeight);

    this.renderAll();
  }

  private setMode(m: InteractionMode) {
    this.mode = m;
    this.actionPanel.resetError();
    this.renderAll();
  }

  private setPendingTileId(id: string | null) {
    this.pendingTileId = id;
    this.actionPanel.resetError();
    this.renderAll();
  }

  private setPendingPawnId(id: string | null) {
    this.pendingPawnId = id;
    this.actionPanel.resetError();
    this.renderAll();
  }

  private isAITurn(state: GameState): boolean {
    const activePlayer = state.players.find((p) => p.id === state.activePlayerId)!;
    return !!activePlayer.isAI && state.phase !== 'finished';
  }

  private dispatch = (action: GameAction): GameState => {
    const engine = new GameEngine(this.store.state);
    engine.dispatch(action);
    const next = structuredClone(engine.state);
    this.store.set(next);
    return next;
  };

  // Passed to human-facing controls so a click during the AI's turn can never mutate game state.
  private guardedDispatch = (action: GameAction): GameState => {
    const state = this.store.state;
    return this.isAITurn(state) ? state : this.dispatch(action);
  };

  private onTile(tileId: string) {
    const state = this.store.state;
    if (this.isAITurn(state)) return;
    if (state.phase !== 'actions') return;
    const tile = state.tiles.find((t) => t.id === tileId);
    if (!tile) return;
    const isOwn = tile.ownerId === state.activePlayerId;

    if (this.mode === 'conquer') {
      if (isOwn || tile.terrain === 'machine-cemetery' || tile.devastated) return;
      this.setPendingTileId(tileId);
      this.setPendingPawnId(null);
      return;
    }
    if (this.mode === 'defend') {
      if (isOwn) this.setPendingTileId(tileId);
      return;
    }
    if (this.mode === 'psychic-probe') {
      if (!isOwn && tile.ownerId) this.dispatch({ type: 'USE_PSYCHIC_PROBE', tileId });
      this.setMode('conquer');
      return;
    }
    if (this.mode === 'death-ray') {
      if (tile.terrain !== 'machine-cemetery') this.dispatch({ type: 'USE_DEATH_RAY', tileId });
      this.setMode('conquer');
      return;
    }
    if (this.mode === 'transport-tunneler') {
      if (!isOwn && tile.ownerId) this.dispatch({ type: 'USE_TRANSPORT_TUNNELER', tileId });
      this.setMode('conquer');
      return;
    }
    if (this.mode === 'flying-fortress') {
      if (isOwn) this.dispatch({ type: 'MOVE_FLYING_FORTRESS', tileId });
      this.setMode('conquer');
      return;
    }
    if (this.mode === 'force-field') {
      if (isOwn) this.dispatch({ type: 'BUILD_TECHNOLOGY', cardId: 'force-field', tileId });
      this.setMode('conquer');
    }
  }

  private scheduleAiTickIfNeeded(state: GameState) {
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    const activePlayer = state.players.find((p) => p.id === state.activePlayerId);
    if (!activePlayer?.isAI || state.phase === 'finished') return;

    const turnKey = `${state.turn}-${state.activePlayerId}`;
    if (this.aiTurnKey !== turnKey) {
      this.aiTurnKey = turnKey;
      this.aiTicksThisTurn = 0;
    }

    this.aiTimer = setTimeout(() => {
      this.aiTicksThisTurn += 1;
      const action: GameAction = this.aiTicksThisTurn > AI_MAX_TICKS_PER_TURN
        ? { type: 'END_TURN' }
        : chooseNextAction(state);
      const engine = new GameEngine(state);
      engine.dispatch(action);
      this.store.set(structuredClone(engine.state));
    }, AI_TICK_DELAY_MS + Math.random() * AI_TICK_DELAY_JITTER_MS);
  }

  private renderAll() {
    const state = this.store.state;
    this.hud.render(state);
    this.board.render(state, this.pendingTileId);
    this.diceTray.render(state);
    this.actionPanel.render(state, this.mode, this.pendingTileId, this.pendingPawnId);
    this.logPanel.render(state.log);

    this.hintText.text = HINTS[this.mode];

    this.repositionDynamicElements();
  }

  private repositionDynamicElements() {
    // Centered in the same gap between the action panel and the journal that the board itself
    // fits and centers into (see layout()'s board.layout() insets).
    const insetLeft = GAP + SIDE_PANEL_WIDTH + GAP;
    const insetRight = LOG_PANEL_WIDTH + GAP * 2;
    const centerX = insetLeft + (this.screenWidth - insetLeft - insetRight) / 2;
    this.hintText.position.set(centerX, this.screenHeight - 24 - (this.hintText.height || 16));
    this.hud.victoryContainer.position.set(this.screenWidth / 2, this.screenHeight / 2);

    // Dice tray + turn button, stacked and anchored to the bottom-right corner, unboxed.
    const bottomMargin = 28;
    const actionBtnHeight = this.hud.actionContainer.getLocalBounds().height || 48;
    const actionBtnY = this.screenHeight - bottomMargin - actionBtnHeight;
    const diceAreaY = actionBtnY - 16 - DICE_ROW_RESERVED_HEIGHT;

    // Right-aligned to the screen edge rather than centered in a fixed-width area: with several
    // dice each showing 3-4 tool buttons, the tray can get wider than any fixed budget, and a
    // fixed-width center would push its far edge off-screen. Growing left from a fixed right edge
    // instead means it's never clipped, just spills a bit further over the board when it's wide.
    const rightEdge = this.screenWidth - GAP;
    const diceWidth = this.diceTray.container.getLocalBounds().width;
    this.diceTray.container.position.set(rightEdge - diceWidth, diceAreaY);
    const actionBtnWidth = this.hud.actionContainer.getLocalBounds().width;
    this.hud.actionContainer.position.set(rightEdge - actionBtnWidth, actionBtnY);
  }

  destroy() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.container.destroy({ children: true });
  }
}
