import type {
  GameAction, GameState, PawnState, PawnType, PlayerId, PlayerState, StealTarget, TileState,
} from './types';
import { TECHNOLOGIES, TECH_UTILITY, technologyById, type TechCardId } from '../game-data/technologies';
import {
  EXPLORER_LIKE, FORAGE_LIKE, ZEPPELIN_LIKE, baseCampNeedsPlacement, baseDefenseValue,
  conquestSatisfied, describeAttempt, effectiveDefenses, hasActiveTech, leviathanProgress,
  leviathanThreshold, ownsAdjacentTile, resolveDiceAttempt, somniumVictoryThreshold,
} from './rules';

const ALL_PLAYER_IDS: PlayerId[] = ['albion', 'helios', 'meridian', 'valhalla'];

function rollDie() { return Math.floor(Math.random() * 6) + 1; }

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class GameEngine {
  constructor(public state: GameState) {}

  dispatch(action: GameAction) {
    switch (action.type) {
      case 'ROLL_DICE': return this.rollDice();
      case 'SELECT_DIE': return this.selectDie(action.index);
      case 'CONQUER': return this.conquer(action.tileId, action.pawnId, action.mode ?? 'place', action.steal);
      case 'PLACE_DEFENSE': return this.placeDefense(action.tileId, action.dieIndex);
      case 'RECALL_DEFENSE': return this.recallDefense(action.tileId);
      case 'REROLL_DIE': return this.rerollDie(action.index);
      case 'ADJUST_DIE': return this.adjustDie(action.index, action.delta);
      case 'SACRIFICE_SOMNIUM': return this.sacrificeSomnium();
      case 'RECOVER_FROM_CEMETERY': return this.recoverFromCemetery(action.pawnId);
      case 'REPLACE_ZEPPELIN': return this.replaceZeppelin(action.zeppelinPawnId, action.replacementPawnId);
      case 'BUILD_TECHNOLOGY': return this.buildTechnology(action.cardId, action.tileId);
      case 'USE_ANDROID_FACTORY': return this.useAndroidFactory();
      case 'USE_RECOVERY_WORKSHOP': return this.useRecoveryWorkshop(action.pawnId);
      case 'USE_BATTLE_EXOSKELETON': return this.useBattleExoskeleton(action.dieIndex);
      case 'USE_DEATH_RAY': return this.useDeathRay(action.tileId);
      case 'USE_PSYCHIC_PROBE': return this.usePsychicProbe(action.tileId);
      case 'USE_TRANSPORT_TUNNELER': return this.useTransportTunneler(action.tileId, action.steal);
      case 'MOVE_FLYING_FORTRESS': return this.moveFlyingFortress(action.tileId);
      case 'END_TURN': return this.endTurn();
    }
  }

  private player() { return this.state.players.find(p => p.id === this.state.activePlayerId)!; }
  private log(message: string) { this.state.log = [message, ...this.state.log].slice(0, 16); }

  // ---------------------------------------------------------------- Phase 1

  private rollDice() {
    if (this.state.phase !== 'preparation') return;
    const player = this.player();

    // A Sonde Psychique effect lapses at the start of the defender's own next turn.
    for (const t of this.state.tiles) if (t.ownerId === player.id) t.psychicProbed = false;

    const keptDefense = this.state.tiles.filter(t => t.ownerId === player.id && (t.defense ?? 0) > 0).length;
    const villageBonus = this.state.tiles.filter(t => t.ownerId === player.id).reduce((n, t) => n + t.dieBonus, 0);
    const count = Math.max(1, 3 + villageBonus - keptDefense);

    this.state.dice = { values: Array.from({ length: count }, rollDie), used: Array(count).fill(false) };
    this.state.selectedDice = [];

    // Phase 1: resource harvest — granted regardless of Camp de Base status. Storage is only
    // capped back down to 3 at the end of the turn (endTurn), so a turn can temporarily exceed it
    // (e.g. to afford a 4-cost Technology) between harvest and the turn's end.
    const baseResources = this.state.tiles.filter(t => t.ownerId === player.id).reduce((s, t) => s + t.resources, 0);
    const productionTanksBonus = hasActiveTech(this.state, player, 'production-tanks') ? 2 : 0;
    player.resources += baseResources + productionTanksBonus;

    const ruinsCapacity = this.state.tiles.filter(t => t.ownerId === player.id && t.terrain === 'ruins' && t.pawnId).length;
    this.state.turnUsed = {
      somniumSacrifice: false, cemeteryRecovery: false, androidFactory: false, recoveryWorkshop: false,
      battleExoskeleton: false, buildTech: false, flyingFortressMove: false, psychicProbe: false,
      ruinsRerolls: 0, ruinsCapacity,
    };

    this.state.phase = 'actions';
    this.log(`${player.name} lance ${count} dés : ${this.state.dice.values.join(' · ')}`);
  }

  private replaceZeppelin(zeppelinPawnId: string, replacementPawnId: string) {
    const player = this.player();
    if (this.state.phase !== 'preparation') return;
    const zep = this.state.pawns.find(p => p.id === zeppelinPawnId && p.ownerId === player.id && ZEPPELIN_LIKE.includes(p.type));
    if (!zep || zep.tileId === 'reserve' || zep.tileId === 'cemetery') return;
    const zepTile = this.state.tiles.find(t => t.pawnId === zep.id);
    if (!zepTile) return;
    const repl = this.state.pawns.find(p => p.id === replacementPawnId && p.ownerId === player.id && !ZEPPELIN_LIKE.includes(p.type) && !p.removed && p.tileId !== 'cemetery');
    if (!repl) return;

    const replSourceTile = this.state.tiles.find(t => t.pawnId === repl.id);
    if (replSourceTile) {
      // A territory is only controlled while occupied — moving the pawn away frees it again.
      replSourceTile.pawnId = undefined;
      replSourceTile.ownerId = undefined;
      replSourceTile.defense = undefined;
      replSourceTile.forceField = false;
      replSourceTile.flyingFortress = false;
      replSourceTile.psychicProbed = false;
    }

    zep.tileId = 'reserve';
    zepTile.pawnId = repl.id;
    repl.tileId = zepTile.id;

    this.log(`${player.name} remplace un Zeppelin par ${repl.type} sur ${zepTile.id}.`);

    // Swapping in an Explorer onto a still-hidden Ruines' Artefact counts as
    // exploring it for the first time, same as conquering it with one would.
    if (zepTile.artifact && EXPLORER_LIKE.includes(repl.type) && !this.state.treasureLost
      && !this.state.players.some(p => p.artifacts.includes(zepTile.artifact!))) {
      player.artifacts.push(zepTile.artifact);
      this.log(`Artefact ${zepTile.artifact} découvert !`);
      if (player.artifacts.length >= 4) this.finish(player.id, 'Victoire : les 4 Artefacts sont réunis.');
    }
  }

  private useRecoveryWorkshop(pawnId: string) {
    const player = this.player();
    if (this.state.phase !== 'preparation') return;
    if (!hasActiveTech(this.state, player, 'recovery-workshop')) return;
    if (this.state.turnUsed.recoveryWorkshop) return;
    const pawn = this.state.pawns.find(p => p.id === pawnId && p.ownerId === player.id && p.tileId === 'cemetery' && !p.removed);
    if (!pawn) return;
    pawn.tileId = 'reserve';
    this.state.turnUsed.recoveryWorkshop = true;
    this.log(`${player.name} récupère gratuitement un ${pawn.type} grâce à l'Atelier de Récupération.`);
  }

  // ------------------------------------------------------------- Dice pool

  private selectDie(index: number) {
    if (this.state.phase !== 'actions' || this.state.dice.used[index]) return;
    const pos = this.state.selectedDice.indexOf(index);
    if (pos >= 0) this.state.selectedDice.splice(pos, 1); else this.state.selectedDice.push(index);
  }

  private rerollDie(index: number) {
    const player = this.player();
    if (this.state.phase !== 'actions' || this.state.dice.used[index]) return;
    if (this.state.turnUsed.ruinsRerolls >= this.state.turnUsed.ruinsCapacity) { this.log('Plus de relance de Ruines disponible ce tour.'); return; }
    this.state.turnUsed.ruinsRerolls += 1;
    this.state.dice.values[index] = rollDie();
    this.log(`${player.name} relance un dé grâce aux Ruines : ${this.state.dice.values[index]}.`);
  }

  private adjustDie(index: number, delta: 1 | -1) {
    const player = this.player();
    if (this.state.phase !== 'actions' || this.state.dice.used[index]) return;
    const next = this.state.dice.values[index] + delta;
    if (next < 1) return;
    if (player.resources < 2) { this.log('Pas assez de cubes de Ressources (2 requis).'); return; }
    player.resources -= 2;
    this.state.dice.values[index] = next;
    this.log(`${player.name} dépense 2 cubes de Ressources : dé -> ${next}.`);
  }

  private sacrificeSomnium() {
    const player = this.player();
    if (this.state.phase !== 'actions') return;
    if (this.state.turnUsed.somniumSacrifice) { this.log('Déjà sacrifié un cristal ce tour.'); return; }
    if (player.somnium < 1) { this.log('Pas de cristal de Somnium à sacrifier.'); return; }
    player.somnium -= 1;
    this.state.turnUsed.somniumSacrifice = true;
    this.state.dice.values.push(rollDie());
    this.state.dice.used.push(false);
    this.log(`${player.name} sacrifie un cristal de Somnium pour un dé supplémentaire.`);
  }

  private useAndroidFactory() {
    const player = this.player();
    if (this.state.phase !== 'actions') return;
    if (!player.technologies.includes('android-factory')) return;
    if (this.state.turnUsed.androidFactory) { this.log('Manufacture déjà utilisée ce tour.'); return; }
    if (player.resources < 3) { this.log('Pas assez de Ressources (3 requis).'); return; }
    player.resources -= 3;
    this.state.turnUsed.androidFactory = true;
    this.state.dice.values.push(rollDie());
    this.state.dice.used.push(false);
    this.log(`${player.name} utilise la Manufacture d'Androïdes pour un dé supplémentaire.`);
  }

  private useBattleExoskeleton(dieIndex: number) {
    const player = this.player();
    if (this.state.phase !== 'actions') return;
    if (!hasActiveTech(this.state, player, 'battle-exoskeleton')) return;
    if (this.state.turnUsed.battleExoskeleton) { this.log('Exosquelette déjà utilisé ce tour.'); return; }
    if (this.state.dice.used[dieIndex]) return;
    this.state.dice.values[dieIndex] = 5;
    this.state.turnUsed.battleExoskeleton = true;
    this.log(`${player.name} transforme un dé en 5 grâce à l'Exosquelette de Combat.`);
  }

  // --------------------------------------------------------------- Defense

  private placeDefense(tileId: string, dieIndex: number) {
    const player = this.player();
    if (this.state.phase !== 'actions') return;
    if (baseCampNeedsPlacement(this.state, player)) { this.log('Vous devez d\'abord replacer votre Camp de Base.'); return; }
    const tile = this.state.tiles.find(t => t.id === tileId);
    if (!tile || tile.ownerId !== player.id) { this.log('Vous ne pouvez placer un dé de défense que sur l\'un de vos territoires.'); return; }
    if (this.state.dice.used[dieIndex]) { this.log('Ce dé a déjà été utilisé.'); return; }
    tile.defense = this.state.dice.values[dieIndex];
    this.state.dice.used[dieIndex] = true;
    this.log(`Défense ${tile.defense} placée sur ${tile.id}.`);
  }

  private recallDefense(tileId: string) {
    const player = this.player();
    if (this.state.phase !== 'preparation') return;
    const tile = this.state.tiles.find(t => t.id === tileId);
    if (!tile || tile.ownerId !== player.id || !tile.defense) return;
    tile.defense = undefined;
    this.log(`${player.name} rappelle le dé de défense de ${tile.id} (relancé ce tour).`);
  }

  // -------------------------------------------------------------- Conquest

  private conquer(tileId: string, pawnId: string, mode: 'place' | 'pillage', steal?: StealTarget) {
    const tile = this.state.tiles.find(t => t.id === tileId);
    const player = this.player();
    if (!tile) return;
    if (tile.terrain === 'machine-cemetery') return;
    if (tile.devastated) { this.log('Ce territoire est dévasté : il ne peut plus jamais être conquis.'); return; }
    if (tile.forceField) { this.log('Ce territoire est protégé par un Champ de Force : imprenable tant que son occupant ne le quitte pas.'); return; }
    if (tile.ownerId === player.id) { this.log('Vous contrôlez déjà ce territoire.'); return; }

    const pawn = this.state.pawns.find(p => p.id === pawnId && p.ownerId === player.id && !p.removed && p.tileId !== 'cemetery');
    if (!pawn) { this.log('Ce pion est indisponible (détruit ou au Cimetière).'); return; }

    const baseCampBlocked = baseCampNeedsPlacement(this.state, player);
    if (baseCampBlocked && pawn.type !== 'base-camp') { this.log('Vous devez d\'abord replacer votre Camp de Base.'); return; }

    const isZeppelinLike = ZEPPELIN_LIKE.includes(pawn.type);
    if (tile.mountain && !isZeppelinLike) { this.log('Seul un Zeppelin peut conquérir une tuile en sol Montagne.'); return; }

    const defenderPawn = tile.pawnId ? this.state.pawns.find(p => p.id === tile.pawnId) : undefined;
    if (defenderPawn && ZEPPELIN_LIKE.includes(defenderPawn.type) && !isZeppelinLike) { this.log('Seul un Zeppelin peut affronter un autre Zeppelin.'); return; }

    const isPillage = mode === 'pillage';
    if (isPillage && defenderPawn?.type !== 'base-camp') { this.log('Le pillage ne peut cibler qu\'un Camp de Base.'); return; }

    if (!isPillage) {
      const usesReserve = pawn.tileId === 'reserve';
      if (usesReserve) {
        const hasAnyBoardPawn = this.state.pawns.some(p => p.ownerId === player.id && p.tileId !== 'reserve' && p.tileId !== 'cemetery' && !p.removed);
        if (hasAnyBoardPawn && !ownsAdjacentTile(this.state, tile, player.id)) {
          this.log('Un pion de Réserve ne peut être posé que sur un territoire adjacent à l\'un des vôtres.');
          return;
        }
      }
    }

    const values = this.state.selectedDice.map(i => this.state.dice.values[i]);
    const defenseValues = effectiveDefenses(this.state, tile);
    if (!resolveDiceAttempt(tile, values, defenseValues)) {
      this.log(`Conquête refusée : ${describeAttempt(tile, values, defenseValues)}`);
      return;
    }

    this.state.selectedDice.forEach(i => this.state.dice.used[i] = true);
    this.state.selectedDice = [];

    if (isPillage) { this.resolvePillage(tile, player, steal); return; }
    this.resolveDestroy(tile, pawn, player);
  }

  private resolveDestroy(tile: TileState, pawn: PawnState, player: PlayerState) {
    const defenderPawn = tile.pawnId ? this.state.pawns.find(p => p.id === tile.pawnId) : undefined;
    if (defenderPawn) defenderPawn.tileId = defenderPawn.type === 'base-camp' ? 'reserve' : 'cemetery';

    if (tile.forceField) { tile.forceField = false; this.log('Le Champ de Force est détruit avec le territoire.'); }
    if (tile.flyingFortress) { tile.flyingFortress = false; this.log('La Forteresse Volante retourne en Réserve de son propriétaire.'); }
    tile.defense = undefined;
    tile.psychicProbed = false;

    const sourceTile = this.state.tiles.find(t => t.pawnId === pawn.id);
    if (sourceTile) {
      if (sourceTile.forceField) { sourceTile.forceField = false; this.log('En quittant le territoire, le Champ de Force y est abandonné.'); }
      // A territory is only controlled while occupied — moving the pawn away frees it again.
      sourceTile.pawnId = undefined;
      sourceTile.ownerId = undefined;
      sourceTile.defense = undefined;
      sourceTile.flyingFortress = false;
      sourceTile.psychicProbed = false;
      this.log(`${sourceTile.label} ${sourceTile.id} redevient libre.`);
    }
    pawn.tileId = tile.id;
    tile.pawnId = pawn.id;
    tile.ownerId = player.id;

    this.log(`${player.name} conquiert ${tile.label} ${tile.id}.`);

    if (tile.artifact && EXPLORER_LIKE.includes(pawn.type) && !this.state.treasureLost
      && !this.state.players.some(p => p.artifacts.includes(tile.artifact!))) {
      player.artifacts.push(tile.artifact);
      this.log(`Artefact ${tile.artifact} découvert !`);
    }
    if (!this.state.treasureLost && player.artifacts.length >= 4) this.finish(player.id, 'Victoire : les 4 Artefacts sont réunis.');
  }

  private resolvePillage(tile: TileState, attacker: PlayerState, steal?: StealTarget) {
    const defender = this.state.players.find(p => p.id === tile.ownerId)!;
    const available: StealTarget[] = [];
    if (defender.somnium > 0) available.push('somnium');
    if (defender.technologies.some(id => technologyById.get(id as TechCardId)?.kind === 'invention')) available.push('invention');
    if (defender.artifacts.length > 0) available.push('artifact');

    if (!available.length) { this.log(`${attacker.name} pille ${defender.name} mais ne trouve rien à voler.`); return; }
    const choice = steal && available.includes(steal) ? steal : available[0];

    if (choice === 'somnium') {
      defender.somnium -= 1;
      attacker.somnium += 1;
      this.log(`${attacker.name} vole un cristal de Somnium à ${defender.name}.`);
    } else if (choice === 'artifact') {
      const idx = Math.floor(Math.random() * defender.artifacts.length);
      const [artifactId] = defender.artifacts.splice(idx, 1);
      attacker.artifacts.push(artifactId);
      this.log(`${attacker.name} vole l'Artefact ${artifactId} à ${defender.name}.`);
      if (!this.state.treasureLost && attacker.artifacts.length >= 4) this.finish(attacker.id, 'Victoire : les 4 Artefacts sont réunis.');
    } else {
      // Neither the attacker nor the engine can target a specific card through the action — of the
      // defender's Inventions, the most valuable one (to the defender) is the one taken.
      const inventions = defender.technologies.filter(id => technologyById.get(id as TechCardId)?.kind === 'invention');
      const inventionId = inventions.reduce((best, id) => (
        (TECH_UTILITY[id as TechCardId] ?? 0) > (TECH_UTILITY[best as TechCardId] ?? 0) ? id : best
      ));
      defender.technologies = defender.technologies.filter(id => id !== inventionId);
      attacker.technologies.push(inventionId);
      attacker.techBuiltTurn[inventionId] = this.state.turn - 1;
      this.transferAssociatedPawn(inventionId, defender, attacker);
      this.log(`${attacker.name} vole la technologie « ${technologyById.get(inventionId as TechCardId)?.name ?? inventionId} » à ${defender.name}.`);
      this.checkLeviathanVictory(attacker);
    }
  }

  private transferAssociatedPawn(cardId: string, from: PlayerState, to: PlayerState) {
    const def = technologyById.get(cardId as TechCardId);
    if (!def?.pawnType) return;
    const pawn = this.state.pawns.find(p => p.ownerId === from.id && p.type === def.pawnType && !p.removed);
    if (!pawn) return;
    pawn.ownerId = to.id;
    const occupiedTile = this.state.tiles.find(t => t.pawnId === pawn.id);
    if (occupiedTile) {
      occupiedTile.ownerId = to.id;
      occupiedTile.defense = undefined;
      occupiedTile.psychicProbed = false;
      this.log(`${to.name} prend aussi le contrôle de ${occupiedTile.label} ${occupiedTile.id}.`);
    }
  }

  // --------------------------------------------------------- Cimetière

  private recoverFromCemetery(pawnId: string) {
    const player = this.player();
    if (this.state.phase !== 'actions') return;
    if (this.state.turnUsed.cemeteryRecovery) { this.log('Déjà racheté un pion ce tour.'); return; }
    const pawn = this.state.pawns.find(p => p.id === pawnId && p.ownerId === player.id && p.tileId === 'cemetery' && !p.removed);
    if (!pawn) return;
    if (player.resources < 3) { this.log('Pas assez de Ressources (3 requis).'); return; }
    player.resources -= 3;
    pawn.tileId = 'reserve';
    this.state.turnUsed.cemeteryRecovery = true;
    this.log(`${player.name} rachète un ${pawn.type} au Cimetière des Machines.`);
  }

  // ----------------------------------------------------- Cartes Technologie

  private buildTechnology(cardId: string, tileId?: string) {
    const player = this.player();
    if (this.state.phase !== 'actions' || baseCampNeedsPlacement(this.state, player)) return;
    if (this.state.turnUsed.buildTech) { this.log('Une seule construction par tour.'); return; }
    if (!this.state.techMarket.includes(cardId)) return;
    if (player.technologies.includes(cardId)) return;
    const def = technologyById.get(cardId as TechCardId);
    if (!def) return;
    if (player.resources < def.costResources || player.somnium < def.costSomnium) { this.log('Coût de construction non couvert.'); return; }

    if (def.id === 'force-field') {
      const tile = tileId ? this.state.tiles.find(t => t.id === tileId && t.ownerId === player.id) : undefined;
      if (!tile) { this.log('Choisissez un de vos territoires pour le Champ de Force.'); return; }
    }

    player.resources -= def.costResources;
    player.somnium -= def.costSomnium;
    player.technologies.push(cardId);
    player.techBuiltTurn[cardId] = this.state.turn;
    this.state.turnUsed.buildTech = true;

    this.state.techMarket = this.state.techMarket.filter(id => id !== cardId);
    const next = this.state.techDeck.shift();
    if (next) this.state.techMarket.push(next);

    if (def.pawnType) {
      this.state.pawns.push({ id: `${player.id}-${cardId}`, ownerId: player.id, type: def.pawnType, tileId: 'reserve' });
    }
    if (def.id === 'force-field' && tileId) {
      const tile = this.state.tiles.find(t => t.id === tileId);
      if (tile) tile.forceField = true;
    }

    this.log(`${player.name} construit ${def.name}.`);
    this.checkLeviathanVictory(player);
  }

  private checkLeviathanVictory(player: PlayerState) {
    const { resources: totalResources, somnium: totalSomnium } = leviathanProgress(player);
    const t = leviathanThreshold(this.state.players.length);
    if (totalResources >= t.resources && totalSomnium >= t.somnium) {
      this.finish(player.id, `Victoire : le Léviathan est construit (${totalResources} Ressources / ${totalSomnium} Somnium cumulés en Technologies).`);
    }
  }

  private usePsychicProbe(tileId: string) {
    const player = this.player();
    if (this.state.phase !== 'actions') return;
    if (!hasActiveTech(this.state, player, 'psychic-probe')) return;
    if (this.state.turnUsed.psychicProbe) { this.log('Sonde Psychique déjà utilisée ce tour.'); return; }
    const tile = this.state.tiles.find(t => t.id === tileId);
    if (!tile || !tile.ownerId || tile.ownerId === player.id) return;
    if (baseDefenseValue(this.state, tile) <= 0) { this.log('Ce territoire n\'a pas de défense à sonder.'); return; }
    tile.psychicProbed = true;
    this.state.turnUsed.psychicProbe = true;
    this.log(`${player.name} utilise la Sonde Psychique sur ${tile.id} : défense réduite à 1.`);
  }

  private useDeathRay(tileId: string) {
    const player = this.player();
    if (this.state.phase !== 'actions') return;
    if (!player.technologies.includes('death-ray') || player.deathRayUsed) return;
    const tile = this.state.tiles.find(t => t.id === tileId);
    if (!tile || tile.terrain === 'machine-cemetery') return;

    const pawn = tile.pawnId ? this.state.pawns.find(p => p.id === tile.pawnId) : undefined;
    if (pawn) {
      if (pawn.type === 'base-camp') pawn.tileId = 'reserve';
      else { pawn.removed = true; pawn.tileId = 'destroyed'; }
    }

    if (tile.artifact && !this.state.players.some(p => p.artifacts.includes(tile.artifact!))) {
      this.state.treasureLost = true;
      this.log('Le Rayon de la Mort a détruit un Artefact : le trésor de Wiraqocha est perdu à jamais !');
    }

    tile.ownerId = undefined;
    tile.pawnId = undefined;
    tile.defense = undefined;
    tile.forceField = false;
    tile.flyingFortress = false;
    tile.psychicProbed = false;
    tile.devastated = true;

    player.deathRayUsed = true;
    this.log(`${player.name} dévaste ${tile.label} ${tile.id} avec le Rayon de la Mort.`);
  }

  private useTransportTunneler(tileId: string, steal?: StealTarget) {
    const player = this.player();
    if (this.state.phase !== 'actions') return;
    if (!hasActiveTech(this.state, player, 'transport-tunneller')) return;
    const tile = this.state.tiles.find(t => t.id === tileId);
    if (!tile || !tile.ownerId || tile.ownerId === player.id) return;
    const defenderPawn = tile.pawnId ? this.state.pawns.find(p => p.id === tile.pawnId) : undefined;
    if (defenderPawn?.type !== 'base-camp') { this.log('Le Tunnelier de Transport ne cible que le Camp de Base.'); return; }

    const values = this.state.selectedDice.map(i => this.state.dice.values[i]);
    if (!conquestSatisfied(tile, values)) {
      this.log(`Conquête refusée : ${describeAttempt(tile, values, [])}`);
      return;
    }
    this.state.selectedDice.forEach(i => this.state.dice.used[i] = true);
    this.state.selectedDice = [];

    this.log(`${player.name} utilise le Tunnelier de Transport pour ignorer les défenses de ${tile.id}.`);
    this.resolvePillage(tile, player, steal);
  }

  private moveFlyingFortress(toTileId: string) {
    const player = this.player();
    if (this.state.phase !== 'actions') return;
    if (!player.technologies.includes('flying-fortress')) return;
    if (this.state.turnUsed.flyingFortressMove) { this.log('Forteresse Volante déjà déplacée ce tour.'); return; }
    const target = this.state.tiles.find(t => t.id === toTileId && t.ownerId === player.id);
    if (!target) return;
    const current = this.state.tiles.find(t => t.flyingFortress && t.ownerId === player.id);
    if (current) current.flyingFortress = false;
    target.flyingFortress = true;
    this.state.turnUsed.flyingFortressMove = true;
    this.log(`${player.name} ${current ? 'déplace' : 'installe'} la Forteresse Volante sur ${target.id}.`);
  }

  private nextPlayerId(current: PlayerId): PlayerId {
    const order = this.state.players.map(p => p.id);
    const idx = order.indexOf(current);
    return order[(idx + 1) % order.length];
  }

  // --------------------------------------------------------------- Phase 3

  private endTurn() {
    if (this.state.phase !== 'actions') return;
    const player = this.player();

    if (!baseCampNeedsPlacement(this.state, player)) {
      const isForageLike = (id?: string) => !!id && FORAGE_LIKE.includes(this.state.pawns.find(p => p.id === id)?.type as PawnType);
      const filonExtraction = this.state.tiles.filter(t => t.ownerId === player.id && t.terrain === 'somnium-vein' && isForageLike(t.pawnId)).length * 2;
      const normalExtraction = this.state.tiles.filter(t => t.ownerId === player.id && t.terrain !== 'somnium-vein' && t.terrain !== 'machine-cemetery' && isForageLike(t.pawnId)).length;
      const gained = Math.floor((filonExtraction + normalExtraction) / 2);
      if (gained > 0) { player.somnium += gained; this.log(`${player.name} récolte ${gained} cristal(aux) de Somnium.`); }
    } else {
      this.log(`${player.name} n'a pas replacé son Camp de Base : pas de récolte de Somnium.`);
    }

    if (player.somnium >= somniumVictoryThreshold(this.state.players.length)) {
      this.finish(player.id, `Victoire : ${player.somnium} Somnium.`);
      return;
    }

    // Resources can only ever be stored up to 3 — this is a storage cap enforced at the end of
    // the turn, not at harvest, so a turn can spend down a temporary surplus (e.g. a 4-cost Technology).
    if (player.resources > 3) {
      this.log(`${player.name} ne peut stocker que 3 Ressources : le surplus est perdu.`);
      player.resources = 3;
    }

    this.state.activePlayerId = this.nextPlayerId(player.id);
    this.state.turn += 1;
    this.state.phase = 'preparation';
    this.state.dice = { values: [], used: [] };
    this.state.selectedDice = [];
    this.log(`Tour ${this.state.turn} — ${this.state.activePlayerId.toUpperCase()}`);
  }

  private finish(playerId: PlayerId, message: string) {
    this.state.phase = 'finished';
    this.state.winner = playerId;
    this.state.winMessage = message;
    this.log(message);
  }
}

const PLAYER_NAMES: Record<PlayerId, string> = { albion: 'Albion', helios: 'Helios', meridian: 'Meridian', valhalla: 'Valhalla' };

export function createInitialState(
  tiles: GameState['tiles'], playerCount: 2 | 3 | 4 = 4, aiPlayerIds: PlayerId[] = [],
): GameState {
  const players: PlayerState[] = ALL_PLAYER_IDS.slice(0, playerCount).map(id => ({
    id, name: PLAYER_NAMES[id], resources: 2, somnium: 0, artifacts: [], technologies: [], techBuiltTurn: {},
    isAI: aiPlayerIds.includes(id),
  }));
  const pawns: PawnState[] = [];
  for (const player of players) {
    pawns.push({ id: `${player.id}-base`, ownerId: player.id, type: 'base-camp', tileId: 'reserve' });
    pawns.push({ id: `${player.id}-explorer-1`, ownerId: player.id, type: 'explorer', tileId: 'reserve' });
    pawns.push({ id: `${player.id}-explorer-2`, ownerId: player.id, type: 'explorer', tileId: 'reserve' });
    pawns.push({ id: `${player.id}-drilling-1`, ownerId: player.id, type: 'drilling', tileId: 'reserve' });
    pawns.push({ id: `${player.id}-drilling-2`, ownerId: player.id, type: 'drilling', tileId: 'reserve' });
    pawns.push({ id: `${player.id}-zeppelin-1`, ownerId: player.id, type: 'zeppelin', tileId: 'reserve' });
    pawns.push({ id: `${player.id}-zeppelin-2`, ownerId: player.id, type: 'zeppelin', tileId: 'reserve' });
  }

  const shuffledTech = shuffle(TECHNOLOGIES.map(t => t.id));
  const techMarket = shuffledTech.slice(0, 3);
  const techDeck = shuffledTech.slice(3);

  return {
    activePlayerId: 'albion',
    phase: 'preparation',
    turn: 1,
    players,
    tiles: structuredClone(tiles),
    pawns,
    dice: { values: [], used: [] },
    selectedDice: [],
    log: ['Préparation — lancez les dés pour commencer.'],
    techMarket,
    techDeck,
    treasureLost: false,
    turnUsed: {
      somniumSacrifice: false, cemeteryRecovery: false, androidFactory: false, recoveryWorkshop: false,
      battleExoskeleton: false, buildTech: false, flyingFortressMove: false, psychicProbe: false,
      ruinsRerolls: 0, ruinsCapacity: 0,
    },
  };
}
