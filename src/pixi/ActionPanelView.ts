import { Container, Graphics, Text } from 'pixi.js';
import type { GameAction, GameState, PawnState, PlayerId, TileState } from '../game-core/types';
import { technologyById, type TechCardId } from '../game-data/technologies';
import { baseCampNeedsPlacement, hasActiveTech, ZEPPELIN_LIKE } from '../game-core/rules';
import { Panel } from './ui/Panel';
import { ScrollContainer } from './ui/ScrollContainer';
import { Button } from './ui/Button';
import { Dropdown } from './ui/Dropdown';
import { TextBlock } from './ui/TextBlock';
import { COLOR, heading, subheading } from './theme';

export type InteractionMode = 'conquer' | 'defend' | 'psychic-probe' | 'death-ray' | 'transport-tunneler' | 'flying-fortress' | 'force-field';

const MODE_LABEL: Record<InteractionMode, string> = {
  conquer: 'conquérir',
  defend: 'défendre',
  'psychic-probe': 'sonde psychique',
  'death-ray': 'rayon de la mort',
  'transport-tunneler': 'tunnelier de transport',
  'flying-fortress': 'forteresse volante',
  'force-field': 'champ de force',
};

const pawnLabel: Record<string, string> = {
  'base-camp': 'Camp de Base',
  explorer: 'Explorateur',
  drilling: 'Forage',
  zeppelin: 'Zeppelin',
  'android-explorer': "Automate d'Exploration",
  juggernaut: 'Juggernaut',
  'mechanical-miner': 'Foreur Mécanique',
};

const pawnIcon: Record<string, string> = {
  'base-camp': '\u{1F3D5}️',
  explorer: '\u{1F9ED}',
  drilling: '⛏️',
  zeppelin: '\u{1F392}',
  'android-explorer': '\u{1F916}',
  juggernaut: '\u{1F6E1}️',
  'mechanical-miner': '⚙️',
};

function diceWereConsumed(before: GameState, after: GameState) {
  return before.dice.used.some((u, i) => !u && after.dice.used[i]);
}

function diceSelectionStatus(state: GameState, tile: TileState): { text: string; ok: boolean } {
  const values = state.selectedDice.map((i) => state.dice.values[i]).sort((a, b) => a - b);
  if (tile.conquestType === 'number') {
    const sum = values.reduce((s, v) => s + v, 0);
    const ok = sum === tile.conquest && (tile.conquest < 7 || values.length >= 2);
    return { text: `Dés sélectionnés : ${values.join(' + ') || '—'} = ${sum} (cible ${tile.conquest})`, ok };
  }
  const required = [...(tile.conquestDice ?? [])].sort((a, b) => a - b);
  const ok = values.length === required.length && values.every((v, i) => v === required[i]);
  return { text: `Dés sélectionnés : ${values.join('-') || '—'} (cible ${required.join('-')})`, ok };
}

function eligiblePawns(state: GameState, tile: TileState, playerId: PlayerId): PawnState[] {
  const defender = tile.pawnId ? state.pawns.find((p) => p.id === tile.pawnId) : undefined;
  const blocked = baseCampNeedsPlacement(state, state.players.find((p) => p.id === playerId)!);
  return state.pawns.filter((p) => {
    if (p.ownerId !== playerId || p.removed || p.tileId === 'cemetery' || p.tileId === 'destroyed') return false;
    if (blocked && p.type !== 'base-camp') return false;
    if (tile.mountain && !ZEPPELIN_LIKE.includes(p.type)) return false;
    if (defender && ZEPPELIN_LIKE.includes(defender.type) && !ZEPPELIN_LIKE.includes(p.type)) return false;
    return true;
  });
}

export interface ActionPanelCallbacks {
  dispatch: (a: GameAction) => GameState;
  setMode: (m: InteractionMode) => void;
  setPendingTileId: (id: string | null) => void;
  setPendingPawnId: (id: string | null) => void;
}

const PADDING = 16;
const ROW_H = 34;
const GAP = 8;

/** Sidebar panel driving conquest/defense/tech-market interactions. Rebuilds its content on every render() (immediate-mode, matching `BoardRenderer`). */
export class ActionPanelView {
  readonly container = new Container();
  private panel: Panel;
  private scroll: ScrollContainer;
  private overlayLayer: Container;
  private lastError: string | null = null;
  private innerWidth = 1;

  constructor(private callbacks: ActionPanelCallbacks, overlayLayer: Container) {
    this.overlayLayer = overlayLayer;
    this.panel = new Panel({ width: 1, height: 1 });
    this.container.addChild(this.panel);
    this.scroll = new ScrollContainer({ width: 1, height: 1 });
    this.scroll.position.set(PADDING, PADDING);
    this.container.addChild(this.scroll);
  }

  layout(width: number, height: number) {
    this.panel.resize(width, height);
    this.innerWidth = Math.max(1, width - PADDING * 2);
    this.scroll.resize(this.innerWidth, Math.max(1, height - PADDING * 2));
  }

  resetError() {
    this.lastError = null;
  }

  private cancelPending() {
    this.callbacks.setPendingTileId(null);
    this.callbacks.setPendingPawnId(null);
    this.callbacks.setMode('conquer');
    this.lastError = null;
  }

  render(state: GameState, mode: InteractionMode, pendingTileId: string | null, pendingPawnId: string | null) {
    const content = this.scroll.content;
    content.removeChildren();
    const w = this.innerWidth;
    let y = 0;
    const push = (view: Container, gap = GAP) => {
      view.position.set(0, y);
      content.addChild(view);
      y += view.getLocalBounds().height + gap;
    };
    const pushHeading = (text: string) => push(new Text({ text, style: heading }), 14);
    const pushSubheading = (text: string) => push(new Text({ text, style: subheading }), 6);
    const pushHint = (text: string) => push(new TextBlock({ text, width: w }));

    const player = state.players.find((p) => p.id === state.activePlayerId)!;
    const pendingTile = pendingTileId ? state.tiles.find((t) => t.id === pendingTileId) : undefined;

    if (state.phase === 'finished') {
      pushHeading('ACTIONS');
      pushHint('Partie terminée.');
      this.scroll.refresh();
      return;
    }

    if (state.phase === 'preparation') {
      pushHeading('PHASE 1 — PRÉPARATION');

      const defended = state.tiles.filter((t) => t.ownerId === player.id && (t.defense ?? 0) > 0);
      const zeppelins = state.pawns.filter((p) => p.ownerId === player.id && ZEPPELIN_LIKE.includes(p.type) && p.tileId !== 'reserve' && p.tileId !== 'cemetery' && !p.removed);
      const replacements = state.pawns.filter((p) => p.ownerId === player.id && !ZEPPELIN_LIKE.includes(p.type) && !p.removed && p.tileId !== 'cemetery');
      const cemetery = state.pawns.filter((p) => p.ownerId === player.id && p.tileId === 'cemetery' && !p.removed);
      const canRecoveryWorkshop = hasActiveTech(state, player, 'recovery-workshop') && !state.turnUsed.recoveryWorkshop;

      if (defended.length > 0) {
        pushSubheading('Dés de défense en place');
        for (const t of defended) {
          push(this.actionRow(w, `${t.label} (${t.id}) — défense ${t.defense}`, 'Rappeler', false, () => this.callbacks.dispatch({ type: 'RECALL_DEFENSE', tileId: t.id })));
        }
        pushHint("Un dé laissé en place réduit d'autant votre prochain lancer.");
      }

      if (zeppelins.length > 0 && replacements.length > 0) {
        pushSubheading('Échanger un Zeppelin');
        for (const z of zeppelins) push(this.zeppelinSwapRow(w, z, replacements));
      }

      if (canRecoveryWorkshop && cemetery.length > 0) {
        pushSubheading('Atelier de Récupération (gratuit)');
        for (const p of cemetery) {
          push(this.actionRow(w, pawnLabel[p.type], 'Récupérer', false, () => this.callbacks.dispatch({ type: 'USE_RECOVERY_WORKSHOP', pawnId: p.id })));
        }
      }

      pushHint('Lancez les dés pour passer en Phase 2 (Actions).');
      this.scroll.refresh();
      return;
    }

    // state.phase === 'actions'
    pushHeading('PHASE 2 — ACTIONS');
    const baseCampBlocked = baseCampNeedsPlacement(state, player);
    const cemetery = state.pawns.filter((p) => p.ownerId === player.id && p.tileId === 'cemetery' && !p.removed);
    const ownFlyingFortress = state.tiles.find((t) => t.flyingFortress && t.ownerId === player.id);
    const defenderOfPending = pendingTile?.pawnId ? state.pawns.find((p) => p.id === pendingTile.pawnId) : undefined;

    if (baseCampBlocked) {
      pushHint("Replacez d'abord votre Camp de Base (choisissez ce pion, puis un territoire).");
    }

    pushSubheading('Mode');
    const modeRow = new Container();
    const conquerBtn = new Button({ label: 'Conquérir', height: 28, variant: 'secondary', active: mode === 'conquer', onClick: () => this.cancelPending() });
    modeRow.addChild(conquerBtn);
    const defendBtn = new Button({ label: 'Défendre', height: 28, variant: 'secondary', active: mode === 'defend', disabled: baseCampBlocked, onClick: () => { this.callbacks.setMode('defend'); this.callbacks.setPendingTileId(null); this.lastError = null; } });
    defendBtn.position.set(conquerBtn.width2 + 8, 0);
    modeRow.addChild(defendBtn);
    push(modeRow);
    if (mode !== 'conquer' && mode !== 'defend') {
      pushHint(`Mode « ${MODE_LABEL[mode]} » actif : cliquez la tuile ciblée sur le plateau.`);
      push(new Button({ label: 'annuler', variant: 'link', onClick: () => this.cancelPending() }));
    }

    if (mode === 'conquer' && pendingTile) {
      push(this.buildConquerBox(w, state, player.id, pendingTile, pendingPawnId, defenderOfPending));
    }

    if (mode === 'defend' && pendingTile) {
      push(this.buildDefendBox(w, state, pendingTile));
    }

    pushSubheading('Autres actions');
    push(this.actionRow(w, 'Sacrifier un Somnium pour un dé', 'Sacrifier', player.somnium < 1 || state.turnUsed.somniumSacrifice, () => this.callbacks.dispatch({ type: 'SACRIFICE_SOMNIUM' })));
    if (player.technologies.includes('android-factory')) {
      push(this.actionRow(w, "Manufacture d'Androïdes (3 Ressources)", 'Utiliser', player.resources < 3 || state.turnUsed.androidFactory, () => this.callbacks.dispatch({ type: 'USE_ANDROID_FACTORY' })));
    }
    for (const p of cemetery) {
      push(this.actionRow(w, `Racheter ${pawnLabel[p.type]} (3 Ressources)`, 'Racheter', player.resources < 3 || state.turnUsed.cemeteryRecovery, () => this.callbacks.dispatch({ type: 'RECOVER_FROM_CEMETERY', pawnId: p.id })));
    }
    if (hasActiveTech(state, player, 'psychic-probe') && !state.turnUsed.psychicProbe) {
      push(this.actionRow(w, 'Sonde Psychique', 'Cibler une défense adverse', false, () => { this.callbacks.setMode('psychic-probe'); this.lastError = null; }));
    }
    if (player.technologies.includes('death-ray') && !player.deathRayUsed) {
      push(this.actionRow(w, 'Rayon de la Mort (1x/partie)', 'Cibler un territoire', false, () => { this.callbacks.setMode('death-ray'); this.lastError = null; }));
    }
    if (hasActiveTech(state, player, 'transport-tunneller')) {
      push(this.actionRow(w, 'Tunnelier de Transport', 'Cibler un Camp de Base', false, () => { this.callbacks.setMode('transport-tunneler'); this.lastError = null; }));
    }
    if (player.technologies.includes('flying-fortress') && !state.turnUsed.flyingFortressMove) {
      push(this.actionRow(w, `${ownFlyingFortress ? 'Déplacer' : 'Placer'} la Forteresse Volante`, 'Choisir un territoire', false, () => { this.callbacks.setMode('flying-fortress'); this.lastError = null; }));
    }

    pushSubheading('Marché des Technologies');
    for (const id of state.techMarket) {
      const def = technologyById.get(id as TechCardId)!;
      const affordable = player.resources >= def.costResources && player.somnium >= def.costSomnium;
      const disabled = baseCampBlocked || state.turnUsed.buildTech || player.technologies.includes(id) || !affordable;
      push(this.techCard(w, def, disabled, () => {
        if (id === 'force-field') { this.callbacks.setMode('force-field'); this.lastError = null; return; }
        this.callbacks.dispatch({ type: 'BUILD_TECHNOLOGY', cardId: id });
      }));
    }

    this.scroll.refresh();
  }

  private actionRow(width: number, label: string, buttonLabel: string, disabled: boolean, onClick: () => void): Container {
    const row = new Container();
    const btn = new Button({ label: buttonLabel, height: 26, fontSize: 11, variant: 'secondary', disabled, onClick });
    const text = new TextBlock({ text: label, width: width - btn.width2 - 24, style: { fontSize: 11 } });
    const h = Math.max(ROW_H, text.height + 12);
    const bg = new Graphics();
    bg.roundRect(0, 0, width, h, 6).fill({ color: COLOR.panelBg }).stroke({ width: 1, color: COLOR.rowBorder });
    row.addChild(bg);
    text.position.set(10, (h - text.height) / 2);
    row.addChild(text);
    btn.position.set(width - btn.width2 - 8, (h - 26) / 2);
    row.addChild(btn);
    return row;
  }

  private zeppelinSwapRow(width: number, zeppelin: PawnState, replacements: PawnState[]): Container {
    const row = new Container();
    const h = ROW_H + 6;
    const bg = new Graphics();
    bg.roundRect(0, 0, width, h, 6).fill({ color: COLOR.panelBg }).stroke({ width: 1, color: COLOR.rowBorder });
    row.addChild(bg);

    const label = new TextBlock({ text: `Zeppelin sur ${zeppelin.tileId}`, width: width * 0.4, style: { fontSize: 11 } });
    label.position.set(10, (h - label.height) / 2);
    row.addChild(label);

    let chosen = '';
    const swapBtn = new Button({ label: 'Échanger', height: 26, fontSize: 11, variant: 'secondary', disabled: true, onClick: () => {
      if (!chosen) return;
      this.callbacks.dispatch({ type: 'REPLACE_ZEPPELIN', zeppelinPawnId: zeppelin.id, replacementPawnId: chosen });
    } });
    swapBtn.position.set(width - swapBtn.width2 - 8, (h - 26) / 2);

    const dropdown = new Dropdown({
      width: width * 0.38,
      height: 26,
      placeholder: 'Choisir un pion...',
      options: replacements.map((r) => ({ value: r.id, label: `${pawnLabel[r.type]} (${r.tileId === 'reserve' ? 'Réserve' : r.tileId})` })),
      overlayLayer: this.overlayLayer,
      onChange: (value) => { chosen = value; swapBtn.setDisabled(false); },
    });
    dropdown.position.set(width - swapBtn.width2 - dropdown.width - 16, (h - 26) / 2);

    row.addChild(dropdown, swapBtn);
    return row;
  }

  private buildConquerBox(w: number, state: GameState, playerId: PlayerId, pendingTile: TileState, pendingPawnId: string | null, defenderOfPending: PawnState | undefined): Container {
    const box = new Container();
    const bg = new Graphics();
    box.addChild(bg);
    let y = 10;

    const title = new Text({ text: `▼ Cible : ${pendingTile.label} (${pendingTile.id})`, style: subheading });
    title.position.set(10, y);
    box.addChild(title);
    y += title.height + 10;

    const chosenPawn = pendingPawnId ? state.pawns.find((p) => p.id === pendingPawnId) : undefined;

    if (!pendingPawnId) {
      const hint = new TextBlock({ text: 'Choisissez le pion qui tente la conquête :', width: w - 20 });
      hint.position.set(10, y);
      box.addChild(hint);
      y += hint.height + 6;

      const eligible = eligiblePawns(state, pendingTile, playerId);
      for (const p of eligible) {
        const row = this.actionRow(w - 20, `${pawnIcon[p.type]} ${pawnLabel[p.type]} — ${p.tileId === 'reserve' ? 'Réserve' : p.tileId}`, 'Choisir', false, () => this.callbacks.setPendingPawnId(p.id));
        row.position.set(10, y);
        box.addChild(row);
        y += row.getLocalBounds().height + 6;
      }
      if (eligible.length === 0) {
        const none = new TextBlock({ text: 'Aucun pion éligible ici (Montagne/Zeppelin, ou Camp de Base à replacer).', width: w - 20 });
        none.position.set(10, y);
        box.addChild(none);
        y += none.height + 6;
      }
    } else if (chosenPawn) {
      const chosenRow = new Container();
      const chosenBg = new Graphics();
      chosenBg.roundRect(0, 0, w - 20, 32, 6).fill({ color: 0x1c2a2c }).stroke({ width: 1, color: COLOR.cyan });
      chosenRow.addChild(chosenBg);
      const chosenLabel = new Text({ text: `${pawnIcon[chosenPawn.type]} ${pawnLabel[chosenPawn.type]} choisi`, style: { fontFamily: 'Arial, sans-serif', fontSize: 12, fill: COLOR.text } });
      chosenLabel.position.set(8, 16);
      chosenLabel.anchor.set(0, 0.5);
      chosenRow.addChild(chosenLabel);
      const changeBtn = new Button({ label: 'changer', variant: 'link', onClick: () => this.callbacks.setPendingPawnId(null) });
      changeBtn.position.set(w - 20 - changeBtn.width2 - 8, 16 - changeBtn.height2 / 2);
      chosenRow.addChild(changeBtn);
      chosenRow.position.set(10, y);
      box.addChild(chosenRow);
      y += 32 + 8;

      const diceStatus = diceSelectionStatus(state, pendingTile);
      const statusText = new TextBlock({ text: (diceStatus.ok ? '✓ ' : '') + diceStatus.text, width: w - 20, style: { fill: diceStatus.ok ? COLOR.ok : COLOR.warning } });
      statusText.position.set(10, y);
      box.addChild(statusText);
      y += statusText.height + 6;

      if (pendingTile.ownerId) {
        const hint = new TextBlock({ text: 'Territoire défendu : une défense doit en plus être battue avec un dé distinct.', width: w - 20 });
        hint.position.set(10, y);
        box.addChild(hint);
        y += hint.height + 6;
      }

      if (this.lastError) {
        const err = new TextBlock({ text: `⚠ ${this.lastError}`, width: w - 20, style: { fill: COLOR.error } });
        err.position.set(10, y);
        box.addChild(err);
        y += err.height + 6;
      }

      const btnRow = new Container();
      const conquerBtn = new Button({
        label: 'Conquérir', height: 30, variant: 'primary',
        onClick: () => {
          const next = this.callbacks.dispatch({ type: 'CONQUER', tileId: pendingTile.id, pawnId: pendingPawnId, mode: 'place' });
          if (diceWereConsumed(state, next)) this.cancelPending();
          else { this.lastError = next.log[0] ?? 'Action refusée.'; this.render(next, 'conquer', pendingTile.id, pendingPawnId); }
        },
      });
      btnRow.addChild(conquerBtn);
      if (pendingTile.ownerId && pendingTile.ownerId !== playerId && defenderOfPending?.type === 'base-camp') {
        const pillageBtn = new Button({
          label: 'Piller (sans capturer)', height: 30, variant: 'secondary',
          onClick: () => {
            const next = this.callbacks.dispatch({ type: 'CONQUER', tileId: pendingTile.id, pawnId: pendingPawnId, mode: 'pillage' });
            if (diceWereConsumed(state, next)) this.cancelPending();
            else { this.lastError = next.log[0] ?? 'Action refusée.'; this.render(next, 'conquer', pendingTile.id, pendingPawnId); }
          },
        });
        pillageBtn.position.set(conquerBtn.width2 + 8, 0);
        btnRow.addChild(pillageBtn);
      }
      btnRow.position.set(10, y);
      box.addChild(btnRow);
      y += 30 + 8;
    }

    const cancelBtn = new Button({ label: 'Annuler la sélection', variant: 'link', onClick: () => this.cancelPending() });
    cancelBtn.position.set(10, y);
    box.addChild(cancelBtn);
    y += cancelBtn.height2 + 10;

    bg.roundRect(0, 0, w, y, 8).fill({ color: 0x17240f, alpha: 0.13 }).stroke({ width: 1, color: COLOR.gold });
    return box;
  }

  private buildDefendBox(w: number, state: GameState, pendingTile: TileState): Container {
    const box = new Container();
    let y = 0;
    const title = new Text({ text: `Défendre ${pendingTile.label} (${pendingTile.id})`, style: subheading });
    title.position.set(0, y);
    box.addChild(title);
    y += title.height + 8;

    state.dice.values.forEach((v, i) => {
      if (state.dice.used[i]) return;
      const row = this.actionRow(w, `Dé disponible : ${v}`, `Placer le dé ${v}`, false, () => {
        this.callbacks.dispatch({ type: 'PLACE_DEFENSE', tileId: pendingTile.id, dieIndex: i });
        this.cancelPending();
      });
      row.position.set(0, y);
      box.addChild(row);
      y += row.getLocalBounds().height + 6;
    });

    const cancelBtn = new Button({ label: 'Annuler', height: 28, variant: 'secondary', onClick: () => this.cancelPending() });
    cancelBtn.position.set(0, y);
    box.addChild(cancelBtn);
    return box;
  }

  private techCard(w: number, def: { name: string; kind: string; description: string; costResources: number; costSomnium: number; id: string }, disabled: boolean, onClick: () => void): Container {
    const card = new Container();
    const bg = new Graphics();
    card.addChild(bg);
    let y = 10;

    const title = new Text({ text: def.name, style: { fontFamily: 'Arial, sans-serif', fontSize: 12, fontWeight: '700', fill: COLOR.text } });
    title.position.set(10, y);
    card.addChild(title);
    const kindTag = new Text({ text: def.kind === 'building' ? 'Bâtiment' : 'Invention', style: { fontFamily: 'Arial, sans-serif', fontSize: 9, fill: COLOR.cyanDim, letterSpacing: 1 } });
    kindTag.anchor.set(1, 0);
    kindTag.position.set(w - 10, y + 2);
    card.addChild(kindTag);
    y += title.height + 6;

    const desc = new TextBlock({ text: def.description, width: w - 20, style: { fontSize: 10.5, fill: COLOR.textDim } });
    desc.position.set(10, y);
    card.addChild(desc);
    y += desc.height + 6;

    const cost = new Text({ text: `Coût : ${def.costResources} Ressources${def.costSomnium ? ` + ${def.costSomnium} Somnium` : ''}`, style: { fontFamily: 'Arial, sans-serif', fontSize: 10.5, fill: COLOR.gold } });
    cost.position.set(10, y);
    card.addChild(cost);
    y += cost.height + 8;

    const btn = new Button({ label: def.id === 'force-field' ? 'Construire (choisir un territoire)' : 'Construire', width: w - 20, height: 30, fontSize: 11, variant: 'secondary', disabled, onClick });
    btn.position.set(10, y);
    card.addChild(btn);
    y += 30 + 10;

    bg.roundRect(0, 0, w, y, 8).fill({ color: COLOR.panelBg }).stroke({ width: 1, color: COLOR.rowBorder });
    return card;
  }
}
