import { Container, Text } from 'pixi.js';
import { Panel } from './ui/Panel';
import { ScrollContainer } from './ui/ScrollContainer';
import { TextBlock } from './ui/TextBlock';
import { COLOR, heading } from './theme';

const PADDING = 16;
const TITLE_HEIGHT = 40;

/** Scrollable expedition log. The engine itself caps `state.log` to 16 entries, newest first. */
export class LogPanelView {
  readonly container = new Container();
  private panel: Panel;
  private titleText: Text;
  private scroll: ScrollContainer;
  private w = 0;
  private h = 0;

  constructor() {
    this.panel = new Panel({ width: 1, height: 1 });
    this.container.addChild(this.panel);
    this.titleText = new Text({ text: "JOURNAL D'EXPÉDITION", style: heading });
    this.titleText.position.set(PADDING, 14);
    this.container.addChild(this.titleText);
    this.scroll = new ScrollContainer({ width: 1, height: 1 });
    this.scroll.position.set(PADDING, TITLE_HEIGHT);
    this.container.addChild(this.scroll);
  }

  layout(width: number, height: number) {
    this.w = width;
    this.h = height;
    this.panel.resize(width, height);
    this.scroll.resize(width - PADDING * 2, Math.max(1, height - TITLE_HEIGHT - PADDING));
  }

  render(log: string[]) {
    this.scroll.content.removeChildren();
    let y = 0;
    for (const line of log) {
      const t = new TextBlock({ text: line, width: this.w - PADDING * 2, style: { fontSize: 11, fill: COLOR.text } });
      t.position.set(0, y);
      this.scroll.content.addChild(t);
      y += t.height + 8;
    }
    this.scroll.refresh();
  }
}
