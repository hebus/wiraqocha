export type PlayerId = 'albion' | 'helios' | 'meridian' | 'valhalla';
export type PawnType = 'base-camp' | 'explorer' | 'drilling' | 'zeppelin' | 'android-explorer' | 'juggernaut' | 'mechanical-miner';
export type Terrain = 'jungle' | 'ruins' | 'mountain' | 'somnium-vein' | 'machine-cemetery' | 'village';

export interface PawnState {
  id: string;
  ownerId: PlayerId;
  type: PawnType;
  /** A real tile id, or the sentinels 'reserve' / 'cemetery'. */
  tileId: string;
  /** Permanently removed from the game (Rayon de la Mort) — never returns to reserve or cemetery. */
  removed?: boolean;
}

export type ConquestType = 'number' | 'double' | 'suite';

export interface TileState {
  id: string;
  q: number;
  r: number;
  terrain: Terrain;
  label: string;
  /** Sum of dice required for a 'number' tile; sum of conquestDice otherwise (display/log fallback). */
  conquest: number;
  conquestType: ConquestType;
  /** Exact dice values required, in order, for 'double' (e.g. [6,6]) and 'suite' (e.g. [4,5,6]) tiles. */
  conquestDice?: number[];
  resources: number;
  dieBonus: number;
  /** Ground: true when this tile sits on Montagne ground — only Zeppelins may enter/leave it,
   * regardless of its terrain "feature" (a Village, Temple or Filon can sit on Montagne ground too). */
  mountain: boolean;
  artifact?: number;
  ownerId?: PlayerId;
  pawnId?: string;
  /** A single die placed in defense (distinct from a Camp de Base's natural 5). */
  defense?: number;
  /** Champ de Force — this tile can no longer be conquered while true. */
  forceField?: boolean;
  /** Forteresse Volante — duplicates this tile's defense value. */
  flyingFortress?: boolean;
  /** Rayon de la Mort — permanently unconquerable, cleared of owner/pawn. */
  devastated?: boolean;
  /** Sonde Psychique — this tile's defense is temporarily reduced to 1, until the owner's next roll. */
  psychicProbed?: boolean;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  resources: number;
  somnium: number;
  artifacts: number[];
  /** Built Technology card ids. */
  technologies: string[];
  /** Turn number each Technology card was built on — some effects only kick in the following turn. */
  techBuiltTurn: Record<string, number>;
  /** Rayon de la Mort can only ever be used once, for the whole game. */
  deathRayUsed?: boolean;
  /** True when this player's turns are driven by the AI controller instead of a human. */
  isAI?: boolean;
}

export interface DiceState {
  values: number[];
  used: boolean[];
}

export interface TurnUsage {
  somniumSacrifice: boolean;
  cemeteryRecovery: boolean;
  androidFactory: boolean;
  recoveryWorkshop: boolean;
  battleExoskeleton: boolean;
  buildTech: boolean;
  flyingFortressMove: boolean;
  psychicProbe: boolean;
  ruinsRerolls: number;
  ruinsCapacity: number;
}

export interface GameState {
  activePlayerId: PlayerId;
  phase: 'preparation' | 'actions' | 'finished';
  turn: number;
  players: PlayerState[];
  tiles: TileState[];
  pawns: PawnState[];
  dice: DiceState;
  selectedDice: number[];
  log: string[];
  winner?: PlayerId;
  /** The exact victory-condition message logged when the game ended — shown in the victory banner. */
  winMessage?: string;
  /** Technology market: 3 cards currently revealed, and the shuffled remainder of the deck. */
  techMarket: string[];
  techDeck: string[];
  /** Set once an unclaimed Artefact is destroyed by the Rayon de la Mort — the "4 Artefacts" victory becomes impossible. */
  treasureLost?: boolean;
  turnUsed: TurnUsage;
}

export type StealTarget = 'somnium' | 'invention' | 'artifact';

export type GameAction =
  | { type: 'ROLL_DICE' }
  | { type: 'SELECT_DIE'; index: number }
  | { type: 'CONQUER'; tileId: string; pawnId: string; mode?: 'place' | 'pillage'; steal?: StealTarget }
  | { type: 'PLACE_DEFENSE'; tileId: string; dieIndex: number }
  | { type: 'RECALL_DEFENSE'; tileId: string }
  | { type: 'REROLL_DIE'; index: number }
  | { type: 'ADJUST_DIE'; index: number; delta: 1 | -1 }
  | { type: 'SACRIFICE_SOMNIUM' }
  | { type: 'RECOVER_FROM_CEMETERY'; pawnId: string }
  | { type: 'REPLACE_ZEPPELIN'; zeppelinPawnId: string; replacementPawnId: string }
  | { type: 'BUILD_TECHNOLOGY'; cardId: string; tileId?: string }
  | { type: 'USE_ANDROID_FACTORY' }
  | { type: 'USE_RECOVERY_WORKSHOP'; pawnId: string }
  | { type: 'USE_BATTLE_EXOSKELETON'; dieIndex: number }
  | { type: 'USE_DEATH_RAY'; tileId: string }
  | { type: 'USE_PSYCHIC_PROBE'; tileId: string }
  | { type: 'USE_TRANSPORT_TUNNELER'; tileId: string; steal?: StealTarget }
  | { type: 'MOVE_FLYING_FORTRESS'; tileId: string }
  | { type: 'END_TURN' };
