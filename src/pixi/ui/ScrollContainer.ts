import { Container, FederatedWheelEvent, Graphics, type FederatedPointerEvent } from 'pixi.js';

export interface ScrollContainerOptions {
  width: number;
  height: number;
}

/** A masked viewport with a scrollable `content` container inside — wheel + drag-to-scroll, clamped to content height. */
export class ScrollContainer extends Container {
  readonly content = new Container();
  private mask_ = new Graphics();
  private w: number;
  private h: number;
  private dragging = false;
  private dragStartY = 0;
  private scrollStartY = 0;

  constructor(opts: ScrollContainerOptions) {
    super();
    this.w = opts.width;
    this.h = opts.height;
    this.addChild(this.mask_);
    this.addChild(this.content);
    this.mask = this.mask_;
    this.redrawMask();

    this.eventMode = 'static';
    this.hitArea = { contains: (x: number, y: number) => x >= 0 && x <= this.w && y >= 0 && y <= this.h };
    this.on('wheel', (e: FederatedWheelEvent) => {
      e.stopPropagation();
      this.scrollBy(-e.deltaY);
    });
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      this.dragging = true;
      this.dragStartY = e.global.y;
      this.scrollStartY = this.content.y;
    });
    this.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (!this.dragging) return;
      this.setScrollY(this.scrollStartY + (e.global.y - this.dragStartY));
    });
    const stop = () => { this.dragging = false; };
    this.on('pointerup', stop);
    this.on('pointerupoutside', stop);
  }

  resize(width: number, height: number) {
    this.w = width;
    this.h = height;
    this.redrawMask();
    this.clampScroll();
  }

  /** Call after mutating `content`'s children to keep the scroll position within bounds. */
  refresh() {
    this.clampScroll();
  }

  private scrollBy(delta: number) {
    this.setScrollY(this.content.y + delta);
  }

  private setScrollY(y: number) {
    this.content.y = y;
    this.clampScroll();
  }

  private clampScroll() {
    const contentHeight = this.content.getLocalBounds().height;
    const minY = Math.min(0, this.h - contentHeight - 8);
    this.content.y = Math.max(minY, Math.min(0, this.content.y));
  }

  private redrawMask() {
    this.mask_.clear();
    this.mask_.rect(0, 0, this.w, this.h).fill({ color: 0xffffff });
  }
}
