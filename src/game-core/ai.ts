import type {
  GameAction, GameState, PawnState, PawnType, PlayerId, PlayerState, StealTarget, TileState,
} from './types';
import { TECH_UTILITY, technologyById, type TechCardDef, type TechCardId } from '../game-data/technologies';
import {
  EXPLORER_LIKE, FORAGE_LIKE, ZEPPELIN_LIKE, baseCampNeedsPlacement, effectiveDefenses,
  findConquestDiceSubset, hasActiveTech, isAdjacent, legalConquestTargets, leviathanProgress,
  leviathanThreshold, somniumVictoryThreshold,
} from './rules';

// ---------------------------------------------------------------------------
// Candidate model
//
// `chooseNextAction` is the sole export: a pure function of `state`, with no memory of its own.
// It is re-invoked after every single action the AI dispatches, so it always recomputes its whole
// view of the turn from scratch. The one invariant every scoring function below must respect:
// none of them may read `state.selectedDice` — see the "multi-tick continuity" note below for why.
// ---------------------------------------------------------------------------

interface DiceAttemptCandidate {
  kind: 'dice-attempt';
  score: number;
  /** Winning subset of dice indices, as found by `findConquestDiceSubset` — never invented. */
  diceSubset: number[];
  pawnType?: PawnType;
  finalAction: GameAction;
  label: string;
}

interface SimpleCandidate {
  kind: 'simple';
  score: number;
  action: GameAction;
  label: string;
}

type Candidate = DiceAttemptCandidate | SimpleCandidate;

// ---------------------------------------------------------------------------
// Score weights (tune here)
// ---------------------------------------------------------------------------

const TILE_BASE_SCORE = 10;
// Resources fuel the "accumulate resources to buy Technology cards" strategy (and ADJUST_DIE,
// Android Factory, cemetery buy-backs) — weighted so the best resource tiles (2/turn) compete
// with a Filon de Somnium, not get lost next to it.
const RESOURCE_WEIGHT = 4;
const VILLAGE_WEIGHT = 12;
const SOMNIUM_VEIN_WEIGHT = 8;
const FORAGE_SOMNIUM_VEIN_BONUS = 4;
const DICE_COST_PENALTY = 2;

const ARTIFACT_BONUS = 60;
// A Ruines-on-Montagne artifact can only ever be conquered by a Zeppelin (the mountain-ground
// rule), but only an Explorer-like pawn actually picks up the artifact on conquest — so taking it
// with a Zeppelin is a necessary staging move, later finished with a REPLACE_ZEPPELIN swap (see
// `findArtifactZeppelinSwap`). Smaller than ARTIFACT_BONUS since the artifact isn't secured yet.
const MOUNTAIN_ARTIFACT_STAGING_BONUS = 30;
const WINNING_MOVE_SCORE = 100000;
const BASE_CAMP_CAPTURE_BONUS = 45;
const ENEMY_TILE_CAPTURE_BONUS = 12;

const PILLAGE_BASE_BONUS = 30;
const ARTIFACT_STEAL_BONUS = 40;
// The engine hands over the defender's single most valuable Invention (see `resolvePillage`),
// never a random or arbitrary one — so this is a multiplier on that card's own TECH_UTILITY,
// not a flat bonus, matching what will actually be received.
const INVENTION_STEAL_WEIGHT = 1.2;
const SOMNIUM_STEAL_BONUS = 10;
const TUNNELER_BONUS = 15;

const DEFENSE_BASE_SCORE = 6;
const DEFENSE_THREAT_WEIGHT = 4;

const TECH_COST_WEIGHT = 2;
const LEVIATHAN_PROGRESS_WEIGHT = 8;

const SACRIFICE_BASE = 4;
const SACRIFICE_MISSING_DICE_WEIGHT = 3;
const SACRIFICE_NEAR_VICTORY_PENALTY = 15;

const ANDROID_FACTORY_BASE = 5;
const ANDROID_FACTORY_MISSING_DICE_WEIGHT = 3;

const RECOVER_BASE = 8;

const PSYCHIC_PROBE_BASE = 9;
const PSYCHIC_PROBE_TARGET_WEIGHT = 0.3;

const FLYING_FORTRESS_BASE = 7;
const FLYING_FORTRESS_WEIGHT = 0.3;

const BATTLE_EXOSKELETON_BASE = 3;
const BATTLE_EXOSKELETON_WEIGHT = 0.5;

const ADJUST_DIE_BASE = 2;
const ADJUST_DIE_WEIGHT = 0.35;

// Deliberately low — only ever chosen as a last resort ahead of ending the turn empty-handed,
// never over a real, scored action.
const RUINS_REROLL_SCORE = 1;

const PAWN_UTILITY: Record<PawnType, number> = {
  'base-camp': 30,
  explorer: 12,
  drilling: 15,
  zeppelin: 12,
  'android-explorer': 14,
  juggernaut: 14,
  'mechanical-miner': 17,
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function tileBaseValue(tile: TileState): number {
  let value = TILE_BASE_SCORE + tile.resources * RESOURCE_WEIGHT + tile.dieBonus * VILLAGE_WEIGHT;
  if (tile.terrain === 'somnium-vein') value += SOMNIUM_VEIN_WEIGHT;
  return value;
}

function isUnclaimedArtifact(state: GameState, tile: TileState): boolean {
  return !!tile.artifact && !state.treasureLost && !state.players.some(p => p.artifacts.includes(tile.artifact!));
}

function isAdjacentToOpponent(state: GameState, tile: TileState, playerId: PlayerId): boolean {
  return state.tiles.some(t => !!t.ownerId && t.ownerId !== playerId && isAdjacent(tile, t));
}

function bestStealTarget(state: GameState, tile: TileState): StealTarget | undefined {
  const defender = state.players.find(p => p.id === tile.ownerId);
  if (!defender) return undefined;
  if (defender.artifacts.length > 0) return 'artifact';
  if (defender.technologies.some(id => technologyById.get(id as TechCardId)?.kind === 'invention')) return 'invention';
  if (defender.somnium > 0) return 'somnium';
  return undefined;
}

/** Mirrors the engine's own pick in `resolvePillage`: the highest-`TECH_UTILITY` Invention the defender holds. */
function bestInventionUtility(defender: PlayerState): number {
  const inventions = defender.technologies.filter(id => technologyById.get(id as TechCardId)?.kind === 'invention');
  return inventions.reduce((best, id) => Math.max(best, TECH_UTILITY[id as TechCardId] ?? 0), 0);
}

function stealBonus(player: PlayerState, defender: PlayerState, steal: StealTarget): number {
  if (steal === 'artifact') return player.artifacts.length === 3 ? WINNING_MOVE_SCORE : ARTIFACT_STEAL_BONUS;
  if (steal === 'invention') return INVENTION_STEAL_WEIGHT * bestInventionUtility(defender);
  return SOMNIUM_STEAL_BONUS;
}

function scoreConquestPlace(state: GameState, player: PlayerState, tile: TileState, pawn: PawnState, diceCost: number): number {
  let score = tileBaseValue(tile) - diceCost * DICE_COST_PENALTY;
  if (tile.terrain === 'somnium-vein' && FORAGE_LIKE.includes(pawn.type)) score += FORAGE_SOMNIUM_VEIN_BONUS;
  if (isUnclaimedArtifact(state, tile) && EXPLORER_LIKE.includes(pawn.type)) {
    score += player.artifacts.length === 3 ? WINNING_MOVE_SCORE : ARTIFACT_BONUS;
  } else if (isUnclaimedArtifact(state, tile) && tile.mountain && ZEPPELIN_LIKE.includes(pawn.type)) {
    score += MOUNTAIN_ARTIFACT_STAGING_BONUS;
  }
  if (tile.ownerId && tile.ownerId !== player.id) {
    const defenderPawn = tile.pawnId ? state.pawns.find(p => p.id === tile.pawnId) : undefined;
    score += defenderPawn?.type === 'base-camp' ? BASE_CAMP_CAPTURE_BONUS : ENEMY_TILE_CAPTURE_BONUS;
  }
  return score;
}

function scoreConquestPillage(state: GameState, player: PlayerState, tile: TileState, steal: StealTarget, diceCost: number): number {
  const defender = state.players.find(p => p.id === tile.ownerId)!;
  return PILLAGE_BASE_BONUS + stealBonus(player, defender, steal) - diceCost * DICE_COST_PENALTY;
}

// ---------------------------------------------------------------------------
// Candidate generation, by category
// ---------------------------------------------------------------------------

function addConquestCandidates(
  state: GameState, player: PlayerState, unusedDice: { index: number; value: number }[], out: Candidate[],
) {
  const ownPawns = state.pawns.filter(p => p.ownerId === player.id && !p.removed && p.tileId !== 'cemetery');

  for (const tile of state.tiles) {
    if (tile.ownerId === player.id) continue;
    const defenseValues = effectiveDefenses(state, tile);

    for (const pawn of ownPawns) {
      if (legalConquestTargets(state, player, tile, pawn, 'place')) {
        const subset = findConquestDiceSubset(tile, unusedDice, defenseValues);
        if (subset) {
          out.push({
            kind: 'dice-attempt',
            score: scoreConquestPlace(state, player, tile, pawn, subset.length),
            diceSubset: subset,
            pawnType: pawn.type,
            finalAction: { type: 'CONQUER', tileId: tile.id, pawnId: pawn.id, mode: 'place' },
            label: `place:${tile.id}:${pawn.id}`,
          });
        }
      }

      if (legalConquestTargets(state, player, tile, pawn, 'pillage')) {
        const steal = bestStealTarget(state, tile);
        if (steal) {
          const subset = findConquestDiceSubset(tile, unusedDice, defenseValues);
          if (subset) {
            out.push({
              kind: 'dice-attempt',
              score: scoreConquestPillage(state, player, tile, steal, subset.length),
              diceSubset: subset,
              pawnType: pawn.type,
              finalAction: { type: 'CONQUER', tileId: tile.id, pawnId: pawn.id, mode: 'pillage', steal },
              label: `pillage:${tile.id}:${pawn.id}`,
            });
          }
        }
      }
    }

    // Transport Tunneller: pillages a Camp de Base while ignoring its defense entirely.
    if (hasActiveTech(state, player, 'transport-tunneller') && tile.ownerId && tile.ownerId !== player.id) {
      const defenderPawn = tile.pawnId ? state.pawns.find(p => p.id === tile.pawnId) : undefined;
      if (defenderPawn?.type === 'base-camp') {
        const steal = bestStealTarget(state, tile);
        if (steal) {
          const subset = findConquestDiceSubset(tile, unusedDice, []);
          if (subset) {
            out.push({
              kind: 'dice-attempt',
              score: scoreConquestPillage(state, player, tile, steal, subset.length) + TUNNELER_BONUS,
              diceSubset: subset,
              finalAction: { type: 'USE_TRANSPORT_TUNNELER', tileId: tile.id, steal },
              label: `tunnel:${tile.id}`,
            });
          }
        }
      }
    }
  }
}

function addDefenseCandidates(
  state: GameState, player: PlayerState, unusedDice: { index: number; value: number }[], out: Candidate[],
) {
  if (unusedDice.length === 0) return;
  const ownTiles = state.tiles.filter(t => t.ownerId === player.id);
  for (const tile of ownTiles) {
    const defenderIsBaseCamp = tile.pawnId ? state.pawns.find(p => p.id === tile.pawnId)?.type === 'base-camp' : false;
    const threat = (isAdjacentToOpponent(state, tile, player.id) ? 1 : 0.3) + (tile.dieBonus > 0 ? 0.5 : 0);
    for (const { index, value } of unusedDice) {
      if (defenderIsBaseCamp && value <= 5) continue; // a die <=5 can't improve on the natural 5 defense
      if ((tile.defense ?? 0) >= value) continue; // never downgrade an existing defense
      out.push({
        kind: 'simple',
        score: DEFENSE_BASE_SCORE + threat * DEFENSE_THREAT_WEIGHT,
        action: { type: 'PLACE_DEFENSE', tileId: tile.id, dieIndex: index },
        label: `defend:${tile.id}:${index}`,
      });
    }
  }
}

function bestOwnTileForForceField(state: GameState, player: PlayerState): TileState | undefined {
  const candidates = state.tiles.filter(t => t.ownerId === player.id && !t.forceField);
  if (!candidates.length) return undefined;
  return candidates.reduce((best, t) => (tileBaseValue(t) > tileBaseValue(best) ? t : best));
}

function leviathanProgressBonus(state: GameState, player: PlayerState, def: TechCardDef): number {
  const progress = leviathanProgress(player);
  const totalResources = progress.resources + def.costResources;
  const totalSomnium = progress.somnium + def.costSomnium;
  const t = leviathanThreshold(state.players.length);
  if (totalResources >= t.resources && totalSomnium >= t.somnium) return WINNING_MOVE_SCORE;
  return LEVIATHAN_PROGRESS_WEIGHT;
}

function addTechnologyCandidates(state: GameState, player: PlayerState, out: Candidate[]) {
  if (state.turnUsed.buildTech) return;
  for (const cardId of state.techMarket) {
    if (player.technologies.includes(cardId)) continue;
    const def = technologyById.get(cardId as TechCardId);
    if (!def) continue;
    if (player.resources < def.costResources || player.somnium < def.costSomnium) continue;

    let tileId: string | undefined;
    if (def.id === 'force-field') {
      const tile = bestOwnTileForForceField(state, player);
      if (!tile) continue;
      tileId = tile.id;
    }

    const utility = TECH_UTILITY[cardId as TechCardId] ?? 10;
    const cost = def.costResources + def.costSomnium * 2;
    out.push({
      kind: 'simple',
      score: utility - cost * TECH_COST_WEIGHT + leviathanProgressBonus(state, player, def),
      action: { type: 'BUILD_TECHNOLOGY', cardId, tileId },
      label: `build:${cardId}`,
    });
  }
}

function addSacrificeSomniumCandidate(
  state: GameState, player: PlayerState, unusedDice: { index: number; value: number }[], out: Candidate[],
) {
  if (state.turnUsed.somniumSacrifice || player.somnium < 1) return;
  const threshold = somniumVictoryThreshold(state.players.length);
  const nearVictory = player.somnium >= threshold - 2;
  out.push({
    kind: 'simple',
    score: SACRIFICE_BASE + Math.max(0, 3 - unusedDice.length) * SACRIFICE_MISSING_DICE_WEIGHT
      - (nearVictory ? SACRIFICE_NEAR_VICTORY_PENALTY : 0),
    action: { type: 'SACRIFICE_SOMNIUM' },
    label: 'sacrifice-somnium',
  });
}

function addAndroidFactoryCandidate(
  state: GameState, player: PlayerState, unusedDice: { index: number; value: number }[], out: Candidate[],
) {
  if (!player.technologies.includes('android-factory') || state.turnUsed.androidFactory || player.resources < 3) return;
  out.push({
    kind: 'simple',
    score: ANDROID_FACTORY_BASE + Math.max(0, 3 - unusedDice.length) * ANDROID_FACTORY_MISSING_DICE_WEIGHT,
    action: { type: 'USE_ANDROID_FACTORY' },
    label: 'android-factory',
  });
}

function addRecoverFromCemeteryCandidates(state: GameState, player: PlayerState, out: Candidate[]) {
  if (state.turnUsed.cemeteryRecovery || player.resources < 3) return;
  const cemeteryPawns = state.pawns.filter(p => p.ownerId === player.id && p.tileId === 'cemetery' && !p.removed);
  for (const pawn of cemeteryPawns) {
    out.push({
      kind: 'simple',
      score: RECOVER_BASE + (PAWN_UTILITY[pawn.type] ?? 10),
      action: { type: 'RECOVER_FROM_CEMETERY', pawnId: pawn.id },
      label: `recover:${pawn.id}`,
    });
  }
}

function addPsychicProbeCandidate(state: GameState, player: PlayerState, out: Candidate[]) {
  if (!hasActiveTech(state, player, 'psychic-probe') || state.turnUsed.psychicProbe) return;
  let best: TileState | undefined;
  let bestValue = -Infinity;
  for (const tile of state.tiles) {
    if (!tile.ownerId || tile.ownerId === player.id) continue;
    if (effectiveDefenses(state, tile).length === 0) continue;
    const value = tileBaseValue(tile);
    if (value > bestValue) { bestValue = value; best = tile; }
  }
  if (!best) return;
  out.push({
    kind: 'simple',
    score: PSYCHIC_PROBE_BASE + bestValue * PSYCHIC_PROBE_TARGET_WEIGHT,
    action: { type: 'USE_PSYCHIC_PROBE', tileId: best.id },
    label: `probe:${best.id}`,
  });
}

function addFlyingFortressCandidate(state: GameState, player: PlayerState, out: Candidate[]) {
  if (!player.technologies.includes('flying-fortress') || state.turnUsed.flyingFortressMove) return;
  const ownTiles = state.tiles.filter(t => t.ownerId === player.id);
  const current = ownTiles.find(t => t.flyingFortress);

  let best: TileState | undefined;
  let bestValue = -Infinity;
  for (const tile of ownTiles) {
    if (tile.flyingFortress) continue;
    const value = tileBaseValue(tile) + (isAdjacentToOpponent(state, tile, player.id) ? 15 : 0);
    if (value > bestValue) { bestValue = value; best = tile; }
  }
  if (!best) return;
  if (current && tileBaseValue(current) >= bestValue) return; // already on the best tile

  out.push({
    kind: 'simple',
    score: FLYING_FORTRESS_BASE + bestValue * FLYING_FORTRESS_WEIGHT,
    action: { type: 'MOVE_FLYING_FORTRESS', tileId: best.id },
    label: `fortress:${best.id}`,
  });
}

/**
 * Battle Exoskeleton turns one unused die into a 5. Rather than re-deriving conquest feasibility
 * in parallel, this looks for a tile that's unreachable with the current dice pool but *would*
 * become reachable if one specific die were a 5 — using the exact same `findConquestDiceSubset`
 * the conquest candidates use, just against a hypothetical dice pool.
 */
function addBattleExoskeletonCandidate(
  state: GameState, player: PlayerState, unusedDice: { index: number; value: number }[], out: Candidate[],
) {
  if (!hasActiveTech(state, player, 'battle-exoskeleton') || state.turnUsed.battleExoskeleton || unusedDice.length === 0) return;
  const ownPawns = state.pawns.filter(p => p.ownerId === player.id && !p.removed && p.tileId !== 'cemetery');

  let bestValue = -Infinity;
  let bestDieIndex: number | undefined;
  let bestLabel = '';

  for (const { index: dieIndex, value: dieValue } of unusedDice) {
    if (dieValue === 5) continue;
    const boosted = unusedDice.map(d => (d.index === dieIndex ? { index: dieIndex, value: 5 } : d));

    for (const tile of state.tiles) {
      if (tile.ownerId === player.id) continue;
      if (!ownPawns.some(p => legalConquestTargets(state, player, tile, p, 'place'))) continue;
      const defenseValues = effectiveDefenses(state, tile);
      if (findConquestDiceSubset(tile, unusedDice, defenseValues)) continue; // already reachable, no boost needed
      const subset = findConquestDiceSubset(tile, boosted, defenseValues);
      if (!subset || !subset.includes(dieIndex)) continue;

      const value = tileBaseValue(tile);
      if (value > bestValue) { bestValue = value; bestDieIndex = dieIndex; bestLabel = tile.id; }
    }
  }

  if (bestDieIndex === undefined) return;
  out.push({
    kind: 'simple',
    score: BATTLE_EXOSKELETON_BASE + bestValue * BATTLE_EXOSKELETON_WEIGHT,
    action: { type: 'USE_BATTLE_EXOSKELETON', dieIndex: bestDieIndex },
    label: `exoskeleton:${bestLabel}`,
  });
}

/**
 * Same idea as Battle Exoskeleton, but for spending 2 Resources to nudge one unused die by ±1
 * (`ADJUST_DIE`) — repeatable (no per-turn limit, no Technology needed), so a single call only
 * ever proposes one step; if that's still not enough to reach a tile, the next tick's fresh
 * candidate search naturally proposes the following step once the die has actually changed.
 */
function addAdjustDieCandidates(
  state: GameState, player: PlayerState, unusedDice: { index: number; value: number }[], out: Candidate[],
) {
  if (player.resources < 2 || unusedDice.length === 0) return;
  const ownPawns = state.pawns.filter(p => p.ownerId === player.id && !p.removed && p.tileId !== 'cemetery');

  let bestValue = -Infinity;
  let bestDieIndex: number | undefined;
  let bestDelta: 1 | -1 | undefined;
  let bestLabel = '';

  for (const { index: dieIndex, value: dieValue } of unusedDice) {
    for (const delta of [1, -1] as const) {
      const nextValue = dieValue + delta;
      if (nextValue < 1) continue;
      const adjusted = unusedDice.map(d => (d.index === dieIndex ? { index: dieIndex, value: nextValue } : d));

      for (const tile of state.tiles) {
        if (tile.ownerId === player.id) continue;
        if (!ownPawns.some(p => legalConquestTargets(state, player, tile, p, 'place'))) continue;
        const defenseValues = effectiveDefenses(state, tile);
        if (findConquestDiceSubset(tile, unusedDice, defenseValues)) continue; // already reachable, no need to spend
        const subset = findConquestDiceSubset(tile, adjusted, defenseValues);
        if (!subset || !subset.includes(dieIndex)) continue;

        const value = tileBaseValue(tile);
        if (value > bestValue) { bestValue = value; bestDieIndex = dieIndex; bestDelta = delta; bestLabel = tile.id; }
      }
    }
  }

  if (bestDieIndex === undefined || bestDelta === undefined) return;
  out.push({
    kind: 'simple',
    score: ADJUST_DIE_BASE + bestValue * ADJUST_DIE_WEIGHT,
    action: { type: 'ADJUST_DIE', index: bestDieIndex, delta: bestDelta },
    label: `adjust:${bestLabel}`,
  });
}

/**
 * Ruines rerolls are free and limited in count (`turnUsed.ruinsCapacity`) — always worth trying
 * before giving up on the turn, so this is scored just above 0 (below every real action, but
 * above the implicit END_TURN fallback).
 */
function addRuinsRerollCandidate(
  state: GameState, unusedDice: { index: number; value: number }[], out: Candidate[],
) {
  if (state.turnUsed.ruinsRerolls >= state.turnUsed.ruinsCapacity || unusedDice.length === 0) return;
  out.push({
    kind: 'simple',
    score: RUINS_REROLL_SCORE,
    action: { type: 'REROLL_DIE', index: unusedDice[0].index },
    label: 'reroll',
  });
}

function buildCandidates(state: GameState, player: PlayerState): Candidate[] {
  const unusedDice = state.dice.values
    .map((value, index) => ({ index, value }))
    .filter(({ index }) => !state.dice.used[index]);

  const candidates: Candidate[] = [];
  addConquestCandidates(state, player, unusedDice, candidates);

  if (baseCampNeedsPlacement(state, player)) {
    // Nothing else is worth doing until the Camp de Base is back on the board — every other
    // action category below is deliberately skipped this tick. Free/repeatable dice-shaping
    // (rerolls, resource-adjustments) still applies: it can be what unlocks a placement at all.
    const baseCampOnly = candidates.filter((c): c is DiceAttemptCandidate => c.kind === 'dice-attempt' && c.pawnType === 'base-camp');
    addAdjustDieCandidates(state, player, unusedDice, baseCampOnly);
    addRuinsRerollCandidate(state, unusedDice, baseCampOnly);
    return baseCampOnly;
  }

  addDefenseCandidates(state, player, unusedDice, candidates);
  addTechnologyCandidates(state, player, candidates);
  addSacrificeSomniumCandidate(state, player, unusedDice, candidates);
  addAndroidFactoryCandidate(state, player, unusedDice, candidates);
  addRecoverFromCemeteryCandidates(state, player, candidates);
  addPsychicProbeCandidate(state, player, candidates);
  addFlyingFortressCandidate(state, player, candidates);
  addBattleExoskeletonCandidate(state, player, unusedDice, candidates);
  addAdjustDieCandidates(state, player, unusedDice, candidates);
  addRuinsRerollCandidate(state, unusedDice, candidates);
  // Rayon de la Mort is deliberately never proposed: it is a one-shot, irreversible, board-wide
  // effect (can permanently destroy an Artefact) that is too situational to score safely with a
  // greedy per-tick heuristic — left out of the v1 AI on purpose.

  return candidates;
}

/**
 * A Ruines-on-Montagne artifact can only be conquered with a Zeppelin (mountain-ground rule), but
 * only an Explorer-like pawn actually collects an artifact — so the second half of that combo is
 * swapping the Zeppelin standing on it for a reserve Explorer via REPLACE_ZEPPELIN, which
 * (per the engine) also collects the artifact on the swap itself. Only ever swaps in a pawn
 * that's still in Réserve, so it never abandons a tile a board pawn is usefully holding.
 */
function findArtifactZeppelinSwap(state: GameState, player: PlayerState): GameAction | undefined {
  const zepPawns = state.pawns.filter(
    p => p.ownerId === player.id && ZEPPELIN_LIKE.includes(p.type) && p.tileId !== 'reserve' && p.tileId !== 'cemetery' && !p.removed,
  );
  const replacement = state.pawns.find(p => p.ownerId === player.id && EXPLORER_LIKE.includes(p.type) && p.tileId === 'reserve');
  if (!replacement) return undefined;

  for (const zep of zepPawns) {
    const tile = state.tiles.find(t => t.pawnId === zep.id);
    if (tile && isUnclaimedArtifact(state, tile)) {
      return { type: 'REPLACE_ZEPPELIN', zeppelinPawnId: zep.id, replacementPawnId: replacement.id };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Picks the single next action for the active (AI) player, given the current state. Stateless by
 * design: it is called again after every action it causes to be dispatched, and always
 * recomputes its whole view of the turn from `state` alone.
 *
 * Multi-tick continuity: conquering (or Transport Tunnelling) needs one or more `SELECT_DIE`
 * ticks before the final action. While `state.selectedDice` is non-empty, only candidates whose
 * winning dice subset is a superset of the current selection are considered — this is only a
 * stable, non-oscillating choice because no scoring function above ever reads
 * `state.selectedDice`. Do not add one that does.
 */
export function chooseNextAction(state: GameState): GameAction {
  const player = state.players.find(p => p.id === state.activePlayerId)!;

  if (state.phase === 'preparation') {
    if (hasActiveTech(state, player, 'recovery-workshop') && !state.turnUsed.recoveryWorkshop) {
      const pawn = state.pawns.find(p => p.ownerId === player.id && p.tileId === 'cemetery' && !p.removed);
      if (pawn) return { type: 'USE_RECOVERY_WORKSHOP', pawnId: pawn.id };
    }
    const zeppelinSwap = findArtifactZeppelinSwap(state, player);
    if (zeppelinSwap) return zeppelinSwap;
    return { type: 'ROLL_DICE' };
  }

  if (state.phase !== 'actions') return { type: 'END_TURN' };

  const candidates = buildCandidates(state, player);
  candidates.sort((a, b) => (b.score - a.score) || a.label.localeCompare(b.label));

  if (state.selectedDice.length > 0) {
    const survivors = candidates.filter(
      (c): c is DiceAttemptCandidate => c.kind === 'dice-attempt' && state.selectedDice.every(i => c.diceSubset.includes(i)),
    );
    if (survivors.length > 0) {
      const best = survivors[0];
      if (best.diceSubset.length === state.selectedDice.length) return best.finalAction;
      const nextIndex = best.diceSubset.find(i => !state.selectedDice.includes(i))!;
      return { type: 'SELECT_DIE', index: nextIndex };
    }
    // Safety net for an unreachable case (see the continuity contract above): unwind one die at a
    // time rather than get stuck.
    return { type: 'SELECT_DIE', index: state.selectedDice[0] };
  }

  const top = candidates[0];
  if (!top || top.score <= 0) return { type: 'END_TURN' };
  if (top.kind === 'dice-attempt') {
    if (top.diceSubset.length === 0) return top.finalAction;
    return { type: 'SELECT_DIE', index: top.diceSubset[0] };
  }
  return top.action;
}
