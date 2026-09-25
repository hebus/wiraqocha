import { Container, Graphics, Text } from 'pixi.js';
import { Button } from '../pixi/ui/Button';
import { COLOR, FONT_SERIF, hint } from '../pixi/theme';

const OPTIONS: Array<{ count: 2 | 3 | 4; label: string }> = [
  { count: 2, label: '2 JOUEURS' },
  { count: 3, label: '3 JOUEURS' },
  { count: 4, label: '4 JOUEURS' },
];

const CARD_WIDTH = 420;
const CARD_HEIGHT = 420;

/** Player-count picker — first screen of the game. */
export class StartScene {
  readonly container = new Container();
  private card = new Container();
  private cardBg = new Graphics();

  constructor(onStart: (count: 2 | 3 | 4) => void) {
    this.card.addChild(this.cardBg);
    this.cardBg.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 16)
      .fill({ color: COLOR.panelBgAlt, alpha: 0.96 })
      .stroke({ width: 1, color: COLOR.panelBorder });

    const anchor = new Text({ text: '⚓', style: { fontSize: 40, fill: COLOR.goldBright } });
    anchor.anchor.set(0.5);
    anchor.position.set(CARD_WIDTH / 2, 56);
    this.card.addChild(anchor);

    const title = new Text({ text: 'WIRAQOCHA', style: { fontFamily: FONT_SERIF, fontSize: 30, fontWeight: '700', fill: COLOR.goldBright, letterSpacing: 5 } });
    title.anchor.set(0.5);
    title.position.set(CARD_WIDTH / 2, 104);
    this.card.addChild(title);

    const subtitle = new Text({ text: 'EXPEDITION PROTOCOL', style: { fontFamily: FONT_SERIF, fontSize: 11, fill: COLOR.goldDim, letterSpacing: 3 } });
    subtitle.anchor.set(0.5);
    subtitle.position.set(CARD_WIDTH / 2, 130);
    this.card.addChild(subtitle);

    const heading = new Text({ text: 'NOMBRE DE JOUEURS', style: { fontFamily: FONT_SERIF, fontSize: 13, fontWeight: '700', fill: COLOR.gold, letterSpacing: 2 } });
    heading.anchor.set(0.5, 0);
    heading.position.set(CARD_WIDTH / 2, 172);
    this.card.addChild(heading);

    let y = 210;
    for (const opt of OPTIONS) {
      const button = new Button({ label: opt.label, width: CARD_WIDTH - 64, height: 52, variant: 'primary', onClick: () => onStart(opt.count) });
      button.position.set(32, y);
      this.card.addChild(button);
      y += 64;
    }

    const hintText = new Text({
      text: 'Chaque consortium (Albion, Helios, Meridian, Valhalla) est ajouté dans cet ordre.',
      style: { ...hint, wordWrapWidth: CARD_WIDTH - 64, align: 'center' },
    });
    hintText.anchor.set(0.5, 0);
    hintText.position.set(CARD_WIDTH / 2, y + 12);
    this.card.addChild(hintText);

    this.container.addChild(this.card);
    this.layout(window.innerWidth, window.innerHeight);
  }

  layout(width: number, height: number) {
    this.card.position.set((width - CARD_WIDTH) / 2, (height - CARD_HEIGHT) / 2);
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
