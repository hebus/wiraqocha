import type { TileState } from '../game-core/types';

// Board generation follows the rulebook's "Mise en place" (p.14):
// - 22 hexagonal Territoire tiles are shuffled and laid out into the fixed valley
//   shape (5 pointy-top rows: 4, 5, 4, 5, 4 tiles) — matching the terrain art's
//   native pointy-top hex crop, so tiles need no rotation.
// - 1 Cimetière des Machines tile sits at its own fixed spot right after (to the
//   right of) the last tile of row 3; it is never part of the shuffle and can
//   never be conquered.
// - Of the 22 tiles: 12 are identified by a number from 1 to 12 (reached by
//   summing dice), and 10 by a dice combination — a double (2 dice of the same
//   value) or a suite (a run of consecutive values) — reached with the exact
//   number of dice indicated.
// - 4 of those 10 "combination" tiles are Temples (Ruines), each hiding one of
//   the four Artefact tokens; the remaining 6 are Villages (+1 die in Phase I).
// - Every tile also has a ground: Jungle or Montagne. The ground is independent
//   of the tile's feature (a Village, Temple or Filon can sit on either) and is
//   what the "only Zeppelins may enter/leave Montagne" rule actually keys off —
//   tracked on TileState.mountain rather than inferred from `terrain`, since
//   `terrain` picks the art/label (Village/Ruines/Filon) and both grounds are
//   possible for those.
// - Of the 12 numbered tiles: 8 are plain Jungle (Resource cubes in Phase I —
//   1 each, except the 7 tile which gives 2), 3 are Filons de Somnium (direct
//   Extraction bonus — 2 on Jungle ground, 1 on Montagne ground), and 1 is a
//   special Montagne tile that also yields 1 Resource cube.

export const CEMETERY_POSITION = { q: 3, r: 2 };

export const cemeteryTile: TileState = {
  id: 'cemetery',
  q: CEMETERY_POSITION.q,
  r: CEMETERY_POSITION.r,
  terrain: 'machine-cemetery',
  label: 'CIMETIÈRE DES MACHINES',
  conquest: 0,
  conquestType: 'number',
  resources: 0,
  dieBonus: 0,
  mountain: false
};

// The 22 valley slots, in the exact shape printed in the rulebook: five
// pointy-top rows (r = 0..4) of 4, 5, 4, 5, 4 hexagons, centered on one another
// so the 5-tile rows overhang symmetrically on both sides of the 4-tile rows
// (rather than starting at the same q, which would drift them rightward). The
// Cimetière des Machines sits at (3, 2), right after row 3's last tile (2, 2).
const positions: Array<{ q: number; r: number }> = [
  { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 },
  { q: -1, r: 1 }, { q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: 1 }, { q: 3, r: 1 },
  { q: -1, r: 2 }, { q: 0, r: 2 }, { q: 1, r: 2 }, { q: 2, r: 2 },
  { q: -2, r: 3 }, { q: -1, r: 3 }, { q: 0, r: 3 }, { q: 1, r: 3 }, { q: 2, r: 3 },
  { q: -2, r: 4 }, { q: -1, r: 4 }, { q: 0, r: 4 }, { q: 1, r: 4 }
];

type DeckTile = Omit<TileState, 'q' | 'r'>;

// The 22 official territory tiles (deck order is irrelevant — generateBoard shuffles it).
const tileDeck: DeckTile[] = [
  // 12 numbered territories (1 to 12)
  { id:'n01', terrain:'jungle', label:'JUNGLE', conquest:1, conquestType:'number', resources:1, dieBonus:0, mountain:false },
  { id:'n02', terrain:'jungle', label:'JUNGLE', conquest:2, conquestType:'number', resources:1, dieBonus:0, mountain:false },
  { id:'n03', terrain:'jungle', label:'JUNGLE', conquest:3, conquestType:'number', resources:1, dieBonus:0, mountain:false },
  { id:'n04', terrain:'jungle', label:'JUNGLE', conquest:4, conquestType:'number', resources:1, dieBonus:0, mountain:false },
  { id:'n05', terrain:'jungle', label:'JUNGLE', conquest:5, conquestType:'number', resources:1, dieBonus:0, mountain:false },
  { id:'n06', terrain:'jungle', label:'JUNGLE', conquest:6, conquestType:'number', resources:1, dieBonus:0, mountain:false },
  { id:'n07', terrain:'jungle', label:'JUNGLE', conquest:7, conquestType:'number', resources:2, dieBonus:0, mountain:false },
  { id:'n08', terrain:'jungle', label:'JUNGLE', conquest:8, conquestType:'number', resources:1, dieBonus:0, mountain:false },
  { id:'n09', terrain:'somnium-vein', label:'FILON DE SOMNIUM', conquest:9, conquestType:'number', resources:0, dieBonus:0, mountain:false },
  { id:'n10', terrain:'somnium-vein', label:'FILON DE SOMNIUM', conquest:10, conquestType:'number', resources:0, dieBonus:0, mountain:false },
  { id:'n11', terrain:'somnium-vein', label:'FILON DE SOMNIUM (MONTAGNE)', conquest:11, conquestType:'number', resources:0, dieBonus:0, mountain:true },
  { id:'n12', terrain:'mountain', label:'MONTAGNE', conquest:12, conquestType:'number', resources:1, dieBonus:0, mountain:true },

  // 4 Temples (Ruines), each guarding one Artefact — combination tiles (double)
  { id:'ru1', terrain:'ruins', label:'RUINES', conquest:2, conquestType:'double', conquestDice:[1,1], resources:0, dieBonus:0, mountain:false, artifact:1 },
  { id:'ru2', terrain:'ruins', label:'RUINES', conquest:6, conquestType:'double', conquestDice:[3,3], resources:0, dieBonus:0, mountain:false, artifact:2 },
  { id:'ru3', terrain:'ruins', label:'RUINES (MONTAGNE)', conquest:8, conquestType:'double', conquestDice:[4,4], resources:0, dieBonus:0, mountain:true, artifact:3 },
  { id:'ru4', terrain:'ruins', label:'RUINES', conquest:4, conquestType:'double', conquestDice:[2,2], resources:0, dieBonus:0, mountain:false, artifact:4 },

  // 6 Villages (+1 die in Phase I) — combination tiles (double or suite)
  { id:'vi1', terrain:'village', label:'VILLAGE (MONTAGNE)', conquest:12, conquestType:'suite', conquestDice:[3,4,5], resources:0, dieBonus:1, mountain:true },
  { id:'vi2', terrain:'village', label:'VILLAGE', conquest:10, conquestType:'double', conquestDice:[5,5], resources:0, dieBonus:1, mountain:false },
  { id:'vi3', terrain:'village', label:'VILLAGE', conquest:12, conquestType:'double', conquestDice:[6,6], resources:0, dieBonus:1, mountain:false },
  { id:'vi4', terrain:'village', label:'VILLAGE (MONTAGNE)', conquest:15, conquestType:'suite', conquestDice:[4,5,6], resources:0, dieBonus:1, mountain:true },
  { id:'vi5', terrain:'village', label:'VILLAGE (MONTAGNE)', conquest:9, conquestType:'suite', conquestDice:[2,3,4], resources:0, dieBonus:1, mountain:true },
  { id:'vi6', terrain:'village', label:'VILLAGE (MONTAGNE)', conquest:6, conquestType:'suite', conquestDice:[1,2,3], resources:0, dieBonus:1, mountain:true }
];

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Shuffles the 22 official territory tiles into the fixed valley shape, plus the fixed Cimetière des Machines. */
export function generateBoard(): TileState[] {
  const shuffled = shuffle(tileDeck);
  const tiles = positions.map((pos, i) => ({ ...shuffled[i], ...pos }));
  return [cemeteryTile, ...tiles];
}

// The layout recommended by the rulebook for first games (p.14 diagram), kept
// as a fixed, non-random alternative to generateBoard().
const recommendedOrder = [
  'ru1', 'vi1', 'n11',
  'vi2', 'vi3', 'n05', 'n01', 'n02',
  'ru2', 'n09', 'n07', 'n08', 'n12',
  'ru3', 'n04', 'n06', 'n03', 'vi4',
  'vi5', 'n10', 'vi6', 'ru4'
];

export const recommendedBoard: TileState[] = [
  cemeteryTile,
  ...recommendedOrder.map((id, i) => ({ ...tileDeck.find(t => t.id === id)!, ...positions[i] }))
];
