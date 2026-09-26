import { Container, FillGradient, Graphics, Text, type TextDropShadow } from 'pixi.js';
import type { GameState } from '../game-core/types';
import { leviathanProgress, leviathanThreshold, somniumVictoryThreshold } from '../game-core/rules';
import { Button } from './ui/Button';
import { COLOR, FONT_SERIF, PLAYER_COLOR, body } from './theme';

// The topbar has no opaque background any more (the board must stay visible through it), so its
// text needs its own contrast against whatever board art happens to sit behind it.
const TEXT_SHADOW: TextDropShadow = { color: 0x000000, blur: 3, distance: 1, angle: Math.PI / 2, alpha: 0.9 };

export const TOPBAR_HEIGHT = 66;
export const PLAYER_STRIP_HEIGHT = 68;
export const HUD_HEIGHT = TOPBAR_HEIGHT + PLAYER_STRIP_HEIGHT;

/** Top bar (brand/turn/resources), phase label, player strip, and the turn action button/victory banner. */
export class HudView {
  readonly topContainer = new Container();
  readonly actionContainer = new Container();
  readonly victoryContainer = new Container();

  private topbarBg = new Graphics();
  private turnText: Text;
  private resourcesText: Text;
  private playerStrip = new Container();
  private actionButton: Button;
  private prefsButton: Button;
  private quitButton: Button;
  private victoryBg = new Graphics();
  private victoryText: Text;
  private victorySubText: Text;
  private victoryHomeButton: Button;
  private width = 960;

  constructor(private onRoll: () => void, private onEndTurn: () => void, onQuit: () => void, onPreferences: () => void) {
    this.topContainer.addChild(this.topbarBg);

    const anchor = new Text({ text: '⚓', style: { fontSize: 22, fill: COLOR.goldBright, dropShadow: TEXT_SHADOW } });
    anchor.anchor.set(0, 0.5);
    anchor.position.set(24, TOPBAR_HEIGHT / 2);
    this.topContainer.addChild(anchor);

    const brand = new Text({ text: 'WIRAQOCHA', style: { fontFamily: FONT_SERIF, fontSize: 18, fontWeight: '700', fill: COLOR.goldBright, letterSpacing: 3, dropShadow: TEXT_SHADOW } });
    brand.anchor.set(0, 0.5);
    brand.position.set(54, TOPBAR_HEIGHT / 2 - 7);
    this.topContainer.addChild(brand);

    const tagline = new Text({ text: 'EXPEDITION PROTOCOL', style: { fontFamily: FONT_SERIF, fontSize: 8, fill: COLOR.goldDim, letterSpacing: 1.5, dropShadow: TEXT_SHADOW } });
    tagline.anchor.set(0, 0.5);
    tagline.position.set(55, TOPBAR_HEIGHT / 2 + 9);
    this.topContainer.addChild(tagline);

    this.turnText = new Text({ text: '', style: { fontFamily: FONT_SERIF, fontSize: 13, fill: COLOR.text, letterSpacing: 1, dropShadow: TEXT_SHADOW } });
    this.turnText.anchor.set(0.5, 0.5);
    this.topContainer.addChild(this.turnText);

    this.resourcesText = new Text({ text: '', style: { ...body, fontSize: 13, dropShadow: TEXT_SHADOW } });
    this.resourcesText.anchor.set(1, 0.5);
    this.topContainer.addChild(this.resourcesText);

    this.prefsButton = new Button({
      label: '⚙ Préférences', variant: 'secondary', height: 22, fontSize: 10,
      onClick: () => onPreferences(),
    });
    this.topContainer.addChild(this.prefsButton);

    this.quitButton = new Button({
      label: 'Quitter', variant: 'secondary', height: 22, fontSize: 10,
      onClick: () => {
        if (window.confirm('Quitter la partie en cours ? La progression sera perdue.')) onQuit();
      },
    });
    this.topContainer.addChild(this.quitButton);

    this.topContainer.addChild(this.playerStrip);

    this.actionButton = new Button({ label: '', width: 220, height: 48, variant: 'primary', onClick: () => this.handleAction() });
    this.actionContainer.addChild(this.actionButton);

    this.victoryContainer.addChild(this.victoryBg);
    this.victoryText = new Text({
      text: '',
      style: { fontFamily: FONT_SERIF, fontSize: 40, fontWeight: '700', fill: COLOR.goldBright, align: 'center', dropShadow: TEXT_SHADOW },
    });
    this.victoryText.anchor.set(0.5, 0.5);
    this.victoryContainer.addChild(this.victoryText);

    this.victorySubText = new Text({
      text: '', style: { ...body, fontSize: 16, align: 'center', dropShadow: TEXT_SHADOW },
    });
    this.victorySubText.anchor.set(0.5, 0.5);
    this.victoryContainer.addChild(this.victorySubText);

    this.victoryHomeButton = new Button({
      label: "RETOUR À L'ACCUEIL", variant: 'primary', height: 40, onClick: () => onQuit(),
    });
    this.victoryContainer.addChild(this.victoryHomeButton);
  }

  private lastPhase: GameState['phase'] | null = null;
  private handleAction() {
    if (this.lastPhase === 'preparation') this.onRoll();
    else if (this.lastPhase === 'actions') this.onEndTurn();
  }

  layout(width: number) {
    this.width = width;
    this.topbarBg.clear();
    // A soft top-to-bottom fade rather than a flat panel — the board stays visible through the topbar.
    const gradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      textureSpace: 'local',
      colorStops: [
        { offset: 0, color: 'rgba(6,12,15,0.55)' },
        { offset: 1, color: 'rgba(6,12,15,0)' },
      ],
    });
    this.topbarBg.rect(0, 0, width, TOPBAR_HEIGHT).fill(gradient);
    this.turnText.position.set(width / 2, TOPBAR_HEIGHT / 2);
    this.resourcesText.position.set(width - 24, TOPBAR_HEIGHT / 2 + 9);
    this.quitButton.position.set(width - 24 - this.quitButton.width2, 6);
    this.prefsButton.position.set(this.quitButton.x - 8 - this.prefsButton.width2, 6);
  }

  render(state: GameState) {
    const player = state.players.find((p) => p.id === state.activePlayerId)!;
    this.lastPhase = state.phase;
    this.turnText.text = `TOUR ${state.turn} • ${player.name.toUpperCase()}`;
    this.resourcesText.text = `💎 ${player.somnium}   ▣ ${player.resources}   ⚙ ${player.technologies.length}`;

    const somniumGoal = somniumVictoryThreshold(state.players.length);
    const leviathanGoal = leviathanThreshold(state.players.length);

    this.playerStrip.removeChildren();
    const y = TOPBAR_HEIGHT + 10;
    const buildCard = (p: (typeof state.players)[number]) => {
      const lev = leviathanProgress(p);
      return this.buildPlayerCard(
        p.id, p.name, !!p.isAI, p.somnium, somniumGoal, p.resources, lev, leviathanGoal, p.artifacts.length,
        p.id === state.activePlayerId,
      );
    };

    // Players 1-2 grow inward from the left edge (under the action panel column); with 3-4
    // players, 3-4 grow inward from the right edge (under the journal column) instead of
    // continuing rightward into the board, which is what pushed them over it before.
    let x = 24;
    for (const p of state.players.slice(0, 2)) {
      const card = buildCard(p);
      card.position.set(x, y);
      this.playerStrip.addChild(card);
      x += card.getLocalBounds().width + 8;
    }

    let rx = this.width - 24;
    for (const p of [...state.players.slice(2)].reverse()) {
      const card = buildCard(p);
      rx -= card.getLocalBounds().width;
      card.position.set(rx, y);
      this.playerStrip.addChild(card);
      rx -= 8;
    }

    if (state.phase === 'preparation') {
      this.actionButton.visible = true;
      this.victoryContainer.visible = false;
      this.actionButton.setLabel('🎲 LANCER LES DÉS');
    } else if (state.phase === 'actions') {
      this.actionButton.visible = true;
      this.victoryContainer.visible = false;
      this.actionButton.setLabel('FIN DU TOUR');
    } else {
      this.actionButton.visible = false;
      this.victoryContainer.visible = true;
      const winner = state.players.find((p) => p.id === state.winner);
      this.victoryText.text = `🏆 ${winner?.name ?? '?'} remporte la partie`;
      this.victorySubText.text = state.winMessage ?? '';
      this.victorySubText.visible = !!state.winMessage;

      const textGap = state.winMessage ? 14 : 0;
      const buttonGap = 28;
      const buttonHeight = this.victoryHomeButton.height2;
      const stackHeight = this.victoryText.height + textGap + this.victorySubText.height + buttonGap + buttonHeight;

      let y = -stackHeight / 2;
      this.victoryText.position.set(0, y + this.victoryText.height / 2);
      y += this.victoryText.height + textGap;
      this.victorySubText.position.set(0, y + this.victorySubText.height / 2);
      y += this.victorySubText.height + buttonGap;
      this.victoryHomeButton.position.set(-this.victoryHomeButton.width2 / 2, y);

      const w = Math.max(420, this.victoryText.width + 64, this.victorySubText.width + 64, this.victoryHomeButton.width2 + 64);
      const h = stackHeight + 48;
      this.victoryBg.clear();
      this.victoryBg.roundRect(-w / 2, -h / 2, w, h, 12).fill({ color: 0x173f43, alpha: 0.95 }).stroke({ width: 2, color: COLOR.cyan });
    }
  }

  private buildPlayerCard(
    id: string, name: string, isAI: boolean, somnium: number, somniumGoal: number, resources: number,
    lev: { resources: number; somnium: number }, leviathanGoal: { resources: number; somnium: number }, artifacts: number,
    isActive: boolean,
  ): Container {
    const c = new Container();
    const color = PLAYER_COLOR[id] ?? 0xffffff;
    const cardHeight = PLAYER_STRIP_HEIGHT - 8;

    const namePrefix = isAI ? '🤖 ' : '';

    // Split across two lines at full size, rather than one long line shrunk down to fit — a
    // single-line card was wide enough that a second or fourth player's card could spill out over
    // the board.
    const line1 = new Text({
      text: `${namePrefix}${name}   💎 ${somnium}/${somniumGoal}   ▣ ${resources}`,
      style: { ...body, fontSize: 13 },
    });
    line1.position.set(20, 7);
    const line2 = new Text({
      text: `🏛 ${lev.resources}/${leviathanGoal.resources}·${lev.somnium}/${leviathanGoal.somnium}   ☠ ${artifacts}/4`,
      style: { ...body, fontSize: 13 },
    });
    line2.position.set(20, 7 + line1.height + 2);

    const width = Math.max(line1.width, line2.width) + 32;
    const bg = new Graphics();
    bg.roundRect(0, 0, width, cardHeight, 8)
      .fill({ color: COLOR.panelBg, alpha: 0.9 })
      .stroke({ width: isActive ? 3 : 1, color, alpha: isActive ? 1 : 0.8 });
    const dot = new Graphics();
    dot.circle(11, cardHeight / 2, 4).fill({ color });
    c.addChild(bg, dot, line1, line2);
    return c;
  }
}
