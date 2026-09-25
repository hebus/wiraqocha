import { Container, Graphics, Text } from 'pixi.js';
import type { GameState } from '../game-core/types';
import { leviathanProgress, leviathanThreshold, somniumVictoryThreshold } from '../game-core/rules';
import { Button } from './ui/Button';
import { COLOR, FONT_SERIF, PLAYER_COLOR, body } from './theme';

export const TOPBAR_HEIGHT = 66;
export const PLAYER_STRIP_HEIGHT = 46;
export const HUD_HEIGHT = TOPBAR_HEIGHT + PLAYER_STRIP_HEIGHT;

const PHASE_LABEL: Record<GameState['phase'], string> = {
  preparation: 'PRÉPARATION',
  actions: 'ACTIONS',
  finished: 'PARTIE TERMINÉE',
};

/** Top bar (brand/turn/resources), phase label, player strip, and the turn action button/victory banner. */
export class HudView {
  readonly topContainer = new Container();
  readonly actionContainer = new Container();

  private topbarBg = new Graphics();
  private turnText: Text;
  private resourcesText: Text;
  private phaseText: Text;
  private playerStrip = new Container();
  private actionButton: Button;
  private victoryBg = new Graphics();
  private victoryText: Text;
  private width = 960;

  constructor(private onRoll: () => void, private onEndTurn: () => void) {
    this.topContainer.addChild(this.topbarBg);

    const anchor = new Text({ text: '⚓', style: { fontSize: 22, fill: COLOR.goldBright } });
    anchor.anchor.set(0, 0.5);
    anchor.position.set(24, TOPBAR_HEIGHT / 2);
    this.topContainer.addChild(anchor);

    const brand = new Text({ text: 'WIRAQOCHA', style: { fontFamily: FONT_SERIF, fontSize: 18, fontWeight: '700', fill: COLOR.goldBright, letterSpacing: 3 } });
    brand.anchor.set(0, 0.5);
    brand.position.set(54, TOPBAR_HEIGHT / 2 - 7);
    this.topContainer.addChild(brand);

    const tagline = new Text({ text: 'EXPEDITION PROTOCOL', style: { fontFamily: FONT_SERIF, fontSize: 8, fill: COLOR.goldDim, letterSpacing: 1.5 } });
    tagline.anchor.set(0, 0.5);
    tagline.position.set(55, TOPBAR_HEIGHT / 2 + 9);
    this.topContainer.addChild(tagline);

    this.turnText = new Text({ text: '', style: { fontFamily: FONT_SERIF, fontSize: 13, fill: COLOR.text, letterSpacing: 1 } });
    this.turnText.anchor.set(0.5, 0.5);
    this.topContainer.addChild(this.turnText);

    this.resourcesText = new Text({ text: '', style: { ...body, fontSize: 13 } });
    this.resourcesText.anchor.set(1, 0.5);
    this.topContainer.addChild(this.resourcesText);

    this.phaseText = new Text({ text: '', style: { fontFamily: 'Arial, sans-serif', fontSize: 10, fill: COLOR.cyan, letterSpacing: 2 } });
    this.phaseText.position.set(24, TOPBAR_HEIGHT + 4);
    this.topContainer.addChild(this.phaseText);

    this.topContainer.addChild(this.playerStrip);

    this.actionButton = new Button({ label: '', width: 220, height: 48, variant: 'primary', onClick: () => this.handleAction() });
    this.actionContainer.addChild(this.actionButton);

    this.actionContainer.addChild(this.victoryBg);
    this.victoryText = new Text({ text: '', style: { ...body, fontSize: 13, align: 'center' }, });
    this.victoryText.anchor.set(0.5, 0);
    this.actionContainer.addChild(this.victoryText);
  }

  private lastPhase: GameState['phase'] | null = null;
  private handleAction() {
    if (this.lastPhase === 'preparation') this.onRoll();
    else if (this.lastPhase === 'actions') this.onEndTurn();
  }

  layout(width: number) {
    this.width = width;
    this.topbarBg.clear();
    this.topbarBg.rect(0, 0, width, TOPBAR_HEIGHT).fill({ color: 0x0b1417, alpha: 0.92 });
    this.turnText.position.set(width / 2, TOPBAR_HEIGHT / 2);
    this.resourcesText.position.set(width - 24, TOPBAR_HEIGHT / 2);
  }

  render(state: GameState) {
    const player = state.players.find((p) => p.id === state.activePlayerId)!;
    this.lastPhase = state.phase;
    this.turnText.text = `TOUR ${state.turn} • ${player.name.toUpperCase()}`;
    this.resourcesText.text = `💎 ${player.somnium}   ▣ ${player.resources}   ⚙ ${player.technologies.length}`;
    this.phaseText.text = PHASE_LABEL[state.phase];

    const somniumGoal = somniumVictoryThreshold(state.players.length);
    const leviathanGoal = leviathanThreshold(state.players.length);

    this.playerStrip.removeChildren();
    let x = 24;
    const y = TOPBAR_HEIGHT + 20;
    for (const p of state.players) {
      const lev = leviathanProgress(p);
      const card = this.buildPlayerCard(p.id, p.name, p.somnium, somniumGoal, p.resources, lev, leviathanGoal, p.artifacts.length);
      card.position.set(x, y);
      this.playerStrip.addChild(card);
      x += card.getLocalBounds().width + 8;
    }

    if (state.phase === 'preparation') {
      this.actionButton.visible = true;
      this.victoryBg.visible = false;
      this.victoryText.visible = false;
      this.actionButton.setLabel('🎲 LANCER LES DÉS');
    } else if (state.phase === 'actions') {
      this.actionButton.visible = true;
      this.victoryBg.visible = false;
      this.victoryText.visible = false;
      this.actionButton.setLabel('FIN DU TOUR');
    } else {
      this.actionButton.visible = false;
      this.victoryBg.visible = true;
      this.victoryText.visible = true;
      const winner = state.players.find((p) => p.id === state.winner);
      this.victoryText.text = `🏆 ${winner?.name ?? '?'} remporte la partie` + (state.winMessage ? `\n${state.winMessage}` : '');
      const w = Math.max(260, this.victoryText.width + 32);
      const h = this.victoryText.height + 24;
      this.victoryBg.clear();
      this.victoryBg.roundRect(-w / 2, 0, w, h, 8).fill({ color: 0x173f43, alpha: 0.95 }).stroke({ width: 1, color: COLOR.cyan });
      this.victoryText.position.set(0, 12);
    }
  }

  private buildPlayerCard(
    id: string, name: string, somnium: number, somniumGoal: number, resources: number,
    lev: { resources: number; somnium: number }, leviathanGoal: { resources: number; somnium: number }, artifacts: number,
  ): Container {
    const c = new Container();
    const color = PLAYER_COLOR[id] ?? 0xffffff;
    const label = new Text({
      text: `${name}   💎 ${somnium}/${somniumGoal}   ▣ ${resources}   🏛 ${lev.resources}/${leviathanGoal.resources}·${lev.somnium}/${leviathanGoal.somnium}   ☠ ${artifacts}/4`,
      style: { ...body, fontSize: 11 },
    });
    label.position.set(20, 8);
    const bg = new Graphics();
    bg.roundRect(0, 0, label.width + 32, PLAYER_STRIP_HEIGHT - 8, 8)
      .fill({ color: COLOR.panelBg, alpha: 0.9 })
      .stroke({ width: 1, color });
    const dot = new Graphics();
    dot.circle(11, (PLAYER_STRIP_HEIGHT - 8) / 2, 4).fill({ color });
    c.addChild(bg, dot, label);
    return c;
  }
}
