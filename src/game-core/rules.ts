import type { GameState, PawnState, PawnType, PlayerId, PlayerState, TileState } from './types';
import { technologyById, type TechCardId } from '../game-data/technologies';

export const ZEPPELIN_LIKE: PawnType[] = ['zeppelin', 'juggernaut'];
export const FORAGE_LIKE: PawnType[] = ['drilling', 'mechanical-miner'];
export const EXPLORER_LIKE: PawnType[] = ['explorer', 'android-explorer'];

// Axial neighbor directions — adjacency is orientation-independent (flat-top / pointy-top
// only change the pixel projection, not which (q, r) pairs are neighbors).
const AXIAL_DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export function isAdjacent(a: { q: number; r: number }, b: { q: number; r: number }) {
  return AXIAL_DIRS.some(d => a.q + d.q === b.q && a.r + d.r === b.r);
}

export function ownsAdjacentTile(state: GameState, tile: TileState, playerId: PlayerId) {
  return state.tiles.some(t => t.ownerId === playerId && t.id !== tile.id && isAdjacent(tile, t));
}

export function baseCampNeedsPlacement(state: GameState, player: PlayerState) {
  const camp = state.pawns.find(p => p.ownerId === player.id && p.type === 'base-camp');
  return !camp || camp.tileId === 'reserve';
}

export function hasActiveTech(state: GameState, player: PlayerState, id: TechCardId) {
  return player.technologies.includes(id) && (player.techBuiltTurn[id] ?? 0) < state.turn;
}

export function baseDefenseValue(state: GameState, tile: TileState): number {
  const defender = tile.pawnId ? state.pawns.find(p => p.id === tile.pawnId) : undefined;
  const natural = defender?.type === 'base-camp' ? 5 : 0;
  const combined = Math.max(natural, tile.defense ?? 0);
  return tile.psychicProbed ? Math.min(combined, 1) : combined;
}

export function effectiveDefenses(state: GameState, tile: TileState): number[] {
  const base = baseDefenseValue(state, tile);
  if (base <= 0) return [];
  return tile.flyingFortress ? [base, base] : [base];
}

export function conquestSatisfied(tile: TileState, subset: number[]): boolean {
  if (tile.conquestType === 'number') {
    if (tile.conquest >= 7 && subset.length < 2) return false;
    return subset.reduce((s, v) => s + v, 0) === tile.conquest;
  }
  const required = [...(tile.conquestDice ?? [])].sort((a, b) => a - b);
  const got = [...subset].sort((a, b) => a - b);
  return required.length > 0 && got.length === required.length && got.every((v, i) => v === required[i]);
}

export function kCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = kCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = kCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

export function canBeatAll(beaters: number[], defenses: number[]): boolean {
  if (defenses.length === 1) return beaters[0] > defenses[0];
  const [b0, b1] = beaters, [d0, d1] = defenses;
  return (b0 > d0 && b1 > d1) || (b0 > d1 && b1 > d0);
}

export function resolveDiceAttempt(tile: TileState, values: number[], defenseValues: number[]): boolean {
  if (defenseValues.length === 0) return conquestSatisfied(tile, values);
  const need = defenseValues.length;
  if (values.length < need) return false;
  const indices = values.map((_, i) => i);
  for (const combo of kCombinations(indices, need)) {
    const beaters = combo.map(i => values[i]);
    if (!canBeatAll(beaters, defenseValues)) continue;
    const rest = values.filter((_, i) => !combo.includes(i));
    if (conquestSatisfied(tile, rest)) return true;
  }
  return false;
}

export function describeAttempt(tile: TileState, values: number[], defenseValues: number[]): string {
  const need = tile.conquestType === 'number' ? String(tile.conquest) : (tile.conquestDice ?? []).join('-');
  if (!values.length) return `aucun dé sélectionné (il faut ${need}${defenseValues.length ? ` + un dé de défense (>${defenseValues.join(', >')})` : ''})`;
  const got = values.join(' · ');
  if (defenseValues.length) return `${got} insuffisant face à ${need} + défense ${defenseValues.join(' et ')}`;
  return `${got} ≠ ${need}`;
}

/**
 * Every non-dice precondition `conquer()` checks before resolving the dice attempt itself —
 * shared with the AI controller so it can never propose a target the engine would silently reject.
 */
export function legalConquestTargets(
  state: GameState, player: PlayerState, tile: TileState, pawn: PawnState, mode: 'place' | 'pillage',
): boolean {
  if (tile.terrain === 'machine-cemetery') return false;
  if (tile.devastated) return false;
  if (tile.forceField) return false;
  if (tile.ownerId === player.id) return false;

  if (pawn.ownerId !== player.id || pawn.removed || pawn.tileId === 'cemetery') return false;

  const baseCampBlocked = baseCampNeedsPlacement(state, player);
  if (baseCampBlocked && pawn.type !== 'base-camp') return false;

  const isZeppelinLike = ZEPPELIN_LIKE.includes(pawn.type);
  if (tile.mountain && !isZeppelinLike) return false;

  const defenderPawn = tile.pawnId ? state.pawns.find(p => p.id === tile.pawnId) : undefined;
  if (defenderPawn && ZEPPELIN_LIKE.includes(defenderPawn.type) && !isZeppelinLike) return false;

  const isPillage = mode === 'pillage';
  if (isPillage && defenderPawn?.type !== 'base-camp') return false;

  if (!isPillage) {
    const usesReserve = pawn.tileId === 'reserve';
    if (usesReserve) {
      const hasAnyBoardPawn = state.pawns.some(p => p.ownerId === player.id && p.tileId !== 'reserve' && p.tileId !== 'cemetery' && !p.removed);
      if (hasAnyBoardPawn && !ownsAdjacentTile(state, tile, player.id)) return false;
    }
  }

  return true;
}

/**
 * Finds the smallest set of unused-dice indices that satisfies a tile's conquest requirement
 * (and beats its defenses, if any), reusing `resolveDiceAttempt` so it can never diverge from
 * what the engine itself would accept.
 */
export function findConquestDiceSubset(
  tile: TileState, availableDice: { index: number; value: number }[], defenseValues: number[],
): number[] | null {
  const MAX_POOL = 14; // perf guard against pathological dice pools — never reached in practice
  if (availableDice.length > MAX_POOL) return null;
  const minSize = defenseValues.length > 0 ? defenseValues.length + 1 : 1;
  for (let size = minSize; size <= availableDice.length; size++) {
    for (const combo of kCombinations(availableDice, size)) {
      if (resolveDiceAttempt(tile, combo.map(c => c.value), defenseValues)) {
        return combo.map(c => c.index);
      }
    }
  }
  return null;
}

export function affordableInventionOf(defender: PlayerState) {
  return defender.technologies.find(id => technologyById.get(id as TechCardId)?.kind === 'invention');
}

// ---------------------------------------------------------------------------
// Victory conditions — shared by the engine (to detect a win), the AI (to weigh progress toward
// one) and the Hud (to display each player's progress toward one).
// ---------------------------------------------------------------------------

const LEVIATHAN_THRESHOLDS: Record<number, { resources: number; somnium: number }> = {
  2: { resources: 21, somnium: 2 },
  3: { resources: 18, somnium: 2 },
  4: { resources: 15, somnium: 1 },
};

export function leviathanThreshold(playerCount: number) {
  return LEVIATHAN_THRESHOLDS[playerCount] ?? LEVIATHAN_THRESHOLDS[4];
}

/** Resources/Somnium spent building Technologies, cumulative — what actually counts toward the Léviathan victory, not current stock. */
export function leviathanProgress(player: PlayerState): { resources: number; somnium: number } {
  const resources = player.technologies.reduce((s, id) => s + (technologyById.get(id as TechCardId)?.costResources ?? 0), 0);
  const somnium = player.technologies.reduce((s, id) => s + (technologyById.get(id as TechCardId)?.costSomnium ?? 0), 0);
  return { resources, somnium };
}

const SOMNIUM_VICTORY_THRESHOLDS: Record<number, number> = { 2: 11, 3: 9, 4: 7 };

export function somniumVictoryThreshold(playerCount: number) {
  return SOMNIUM_VICTORY_THRESHOLDS[playerCount] ?? 7;
}
