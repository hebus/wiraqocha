import type { PawnType } from '../game-core/types';

export type TechCardId =
  | 'android-factory'
  | 'flying-fortress'
  | 'force-field'
  | 'recovery-workshop'
  | 'battle-exoskeleton'
  | 'death-ray'
  | 'juggernaut'
  | 'android-explorer'
  | 'mechanical-miner'
  | 'production-tanks'
  | 'psychic-probe'
  | 'transport-tunneller';

export type TechKind = 'building' | 'invention';

export interface TechCardDef {
  id: TechCardId;
  name: string;
  kind: TechKind;
  /** Coûts approximatifs (Ressources/Somnium) — le livret de règles ne donne pas les
   * valeurs imprimées sur les cartes physiques (uniquement un pictogramme). À ajuster
   * si besoin en comparant aux cartes réelles. */
  costResources: number;
  costSomnium: number;
  description: string;
  /** Pion en bois blanc associé, ajouté en Réserve à la construction. */
  pawnType?: PawnType;
}

export const TECHNOLOGIES: TechCardDef[] = [
  {
    id: 'android-factory',
    name: 'Manufacture d\'Androïdes',
    kind: 'building',
    costResources: 3,
    costSomnium: 0,
    description: 'Une fois par tour, dépensez 3 cubes de Ressources pour lancer un dé supplémentaire.',
  },
  {
    id: 'flying-fortress',
    name: 'Forteresse Volante',
    kind: 'invention',
    costResources: 3,
    costSomnium: 1,
    description: 'Place un jeton sur un de vos territoires : sa défense est dupliquée. Déplaçable une fois par tour.',
  },
  {
    id: 'force-field',
    name: 'Champ de Force',
    kind: 'invention',
    costResources: 4,
    costSomnium: 1,
    description: 'Rend un de vos territoires imprenable tant que le pion qui l\'occupe n\'est pas déplacé.',
  },
  {
    id: 'recovery-workshop',
    name: 'Atelier de Récupération',
    kind: 'building',
    costResources: 2,
    costSomnium: 0,
    description: 'Récupère gratuitement un pion au Cimetière des Machines, une fois par tour (à partir du tour suivant sa construction).',
  },
  {
    id: 'battle-exoskeleton',
    name: 'Exosquelette de Combat',
    kind: 'invention',
    costResources: 2,
    costSomnium: 1,
    description: 'Une fois par tour, transforme un dé non utilisé en 5.',
  },
  {
    id: 'death-ray',
    name: 'Rayon de la Mort',
    kind: 'invention',
    costResources: 4,
    costSomnium: 2,
    description: 'Une seule fois par partie : dévaste un territoire, le rendant définitivement imprenable.',
  },
  {
    id: 'juggernaut',
    name: 'Juggernaut',
    kind: 'invention',
    costResources: 3,
    costSomnium: 1,
    description: 'Pion Zeppelin supplémentaire : peut conquérir les Montagnes et affronter d\'autres Zeppelins.',
    pawnType: 'juggernaut',
  },
  {
    id: 'android-explorer',
    name: 'Automate d\'Exploration',
    kind: 'invention',
    costResources: 3,
    costSomnium: 1,
    description: 'Pion Explorateur supplémentaire : peut récupérer les Artefacts dans les Ruines.',
    pawnType: 'android-explorer',
  },
  {
    id: 'mechanical-miner',
    name: 'Foreur Mécanique',
    kind: 'invention',
    costResources: 3,
    costSomnium: 1,
    description: 'Pion Forage supplémentaire : peut extraire du Somnium en Phase 3.',
    pawnType: 'mechanical-miner',
  },
  {
    id: 'production-tanks',
    name: 'Cuves de Production',
    kind: 'building',
    costResources: 3,
    costSomnium: 0,
    description: '+2 cubes de Ressources chaque tour en Phase 1, à partir du tour suivant sa construction.',
  },
  {
    id: 'psychic-probe',
    name: 'Sonde Psychique',
    kind: 'invention',
    costResources: 2,
    costSomnium: 1,
    description: 'Une fois par tour, transforme le dé de défense d\'un adversaire en 1.',
  },
  {
    id: 'transport-tunneller',
    name: 'Tunnelier de Transport',
    kind: 'building',
    costResources: 4,
    costSomnium: 1,
    description: 'Attaque un Camp de Base adverse en ignorant toutes ses défenses (vol uniquement, pas de capture).',
  },
];

export const technologyById = new Map(TECHNOLOGIES.map((t) => [t.id, t]));

/**
 * A rough, hand-tuned "how good is this card" weight — used by the AI to prioritize which
 * Technology to build, and by the engine to pick which of a pillaged player's several Inventions
 * gets stolen (the most valuable one to the *victim*, since neither a human nor the AI can target
 * a specific card through the CONQUER/pillage action, only the 'invention' category).
 */
export const TECH_UTILITY: Record<TechCardId, number> = {
  'android-factory': 18,
  'flying-fortress': 15,
  'force-field': 15,
  'recovery-workshop': 14,
  'battle-exoskeleton': 12,
  'death-ray': 10,
  juggernaut: 20,
  'android-explorer': 20,
  'mechanical-miner': 20,
  'production-tanks': 16,
  'psychic-probe': 10,
  'transport-tunneller': 17,
};
