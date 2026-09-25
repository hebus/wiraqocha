import { Container, Graphics, type ContainerChild } from 'pixi.js';
import { COLOR } from '../theme';

export interface PanelOptions {
  width: number;
  height: number;
  radius?: number;
  fill?: number;
  border?: number;
}

/** A rounded-rect background panel; resize() redraws it in place, content is added by the caller. */
export class Panel extends Container {
  private bg = new Graphics();
  private opts: Required<PanelOptions>;

  constructor(opts: PanelOptions) {
    super();
    this.opts = { radius: 12, fill: COLOR.panelBgAlt, border: COLOR.panelBorder, ...opts };
    this.addChild(this.bg);
    this.redraw();
  }

  resize(width: number, height: number) {
    this.opts.width = width;
    this.opts.height = height;
    this.redraw();
  }

  private redraw() {
    this.bg.clear();
    this.bg.roundRect(0, 0, this.opts.width, this.opts.height, this.opts.radius)
      .fill({ color: this.opts.fill, alpha: 0.92 })
      .stroke({ width: 1, color: this.opts.border });
  }

  get panelWidth() { return this.opts.width; }
  get panelHeight() { return this.opts.height; }
}

/** Stacks `items` vertically inside `parent` starting at (x, y), separated by `gap`; returns the total height used. */
export function layoutColumn(items: ContainerChild[], x: number, y: number, gap: number): number {
  let cursorY = y;
  for (const item of items) {
    item.position.set(x, cursorY);
    cursorY += item.getLocalBounds().height + gap;
  }
  return cursorY - y - gap;
}
