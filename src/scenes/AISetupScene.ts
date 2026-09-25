import { Container, Graphics, Text } from 'pixi.js';
import { Button } from '../pixi/ui/Button';
import { ToggleButton } from '../pixi/ui/ToggleButton';
import { COLOR, FONT_SERIF, hint } from '../pixi/theme';
import type { PlayerId } from '../game-core/types';

const ALL_PLAYER_IDS: PlayerId[] = ['albion', 'helios', 'meridian', 'valhalla'];
const PLAYER_NAMES: Record<PlayerId, string> = { albion: 'Albion', helios: 'Helios', meridian: 'Meridian', valhalla: 'Valhalla' };

const CARD_WIDTH = 420;

/** AI/human toggle screen shown after player-count selection. */
export class AISetupScene {
  readonly container = new Container();
  private card = new Container();
  private cardBg = new Graphics();
  private aiIds = new Set<PlayerId>();
  private cardHeight: number;

  constructor(playerCount: 2 | 3 | 4, onConfirm: (aiIds: PlayerId[]) => void) {
    const players = ALL_PLAYER_IDS.slice(0, playerCount);
    this.cardHeight = 300 + players.length * 56;

    this.card.addChild(this.cardBg);

    const anchor = new Text({ text: '⚓', style: { fontSize: 40, fill: COLOR.goldBright } });
    anchor.anchor.set(0.5);
    anchor.position.set(CARD_WIDTH / 2, 56);
    this.card.addChild(anchor);

    const title = new Text({ text: 'WIRAQOCHA', style: { fontFamily: FONT_SERIF, fontSize: 30, fontWeight: '700', fill: COLOR.goldBright, letterSpacing: 5 } });
    title.anchor.set(0.5);
    title.position.set(CARD_WIDTH / 2, 104);
    this.card.addChild(title);

    const heading = new Text({ text: 'QUELS CONSORTIUMS SONT DES IA ?', style: { fontFamily: FONT_SERIF, fontSize: 13, fontWeight: '700', fill: COLOR.gold, letterSpacing: 1, align: 'center' } });
    heading.anchor.set(0.5, 0);
    heading.position.set(CARD_WIDTH / 2, 140);
    this.card.addChild(heading);

    let y = 190;
    for (const id of players) {
      const toggle = new ToggleButton({
        label: PLAYER_NAMES[id],
        width: CARD_WIDTH - 64,
        height: 44,
        checked: false,
        onLabel: 'IA',
        offLabel: 'HUMAIN',
        onChange: (checked) => { if (checked) this.aiIds.add(id); else this.aiIds.delete(id); },
      });
      toggle.position.set(32, y);
      this.card.addChild(toggle);
      y += 56;
    }

    const confirm = new Button({
      label: 'COMMENCER LA PARTIE',
      width: CARD_WIDTH - 64,
      height: 52,
      variant: 'primary',
      onClick: () => onConfirm([...this.aiIds]),
    });
    confirm.position.set(32, y + 8);
    this.card.addChild(confirm);

    const hintText = new Text({
      text: 'Les consortiums non cochés restent joués en local (hotseat) par des humains.',
      style: { ...hint, wordWrapWidth: CARD_WIDTH - 64, align: 'center' },
    });
    hintText.anchor.set(0.5, 0);
    hintText.position.set(CARD_WIDTH / 2, y + 70);
    this.card.addChild(hintText);

    this.cardBg.roundRect(0, 0, CARD_WIDTH, this.cardHeight, 16)
      .fill({ color: COLOR.panelBgAlt, alpha: 0.96 })
      .stroke({ width: 1, color: COLOR.panelBorder });

    this.container.addChild(this.card);
    this.layout(window.innerWidth, window.innerHeight);
  }

  layout(width: number, height: number) {
    this.card.position.set((width - CARD_WIDTH) / 2, (height - this.cardHeight) / 2);
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
