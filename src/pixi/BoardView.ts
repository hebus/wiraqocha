import { Container, FederatedPointerEvent, FederatedWheelEvent, Graphics, Text } from 'pixi.js';
import type { GameState } from '../game-core/types';
import { BoardRenderer } from './BoardRenderer';
import { COLOR, FONT_SERIF } from './theme';

const MIN_SCALE = 0.35;
const MAX_SCALE = 3;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Board viewport: hosts `BoardRenderer` plus pan/zoom/fit, scoped to an arbitrary rect. */
export class BoardView {
  readonly container = new Container();
  private mask_ = new Graphics();
  private world = new Container();
  private board: BoardRenderer;
  private loadingText: Text;
  private ready = false;
  private lastState: GameState | null = null;

  private rectW = 1;
  private rectH = 1;
  private insetLeft = 0;
  private insetRight = 0;
  private interacted = false;
  private contentCenterY = 0;
  private contentWidth = 1;
  private contentHeight = 1;

  private dragging = false;
  private last = { x: 0, y: 0 };
  private lastTapTime = 0;

  constructor(onTile: (id: string) => void) {
    this.container.addChild(this.mask_);
    this.container.mask = this.mask_;
    this.container.addChild(this.world);

    this.board = new BoardRenderer(onTile);
    this.world.addChild(this.board.container);

    this.loadingText = new Text({ text: 'Chargement du plateau…', style: { fontFamily: FONT_SERIF, fontSize: 14, fill: COLOR.textDim } });
    this.loadingText.anchor.set(0.5);
    this.container.addChild(this.loadingText);

    this.container.eventMode = 'static';
    this.container.cursor = 'grab';
    this.container.on('pointerdown', (e: FederatedPointerEvent) => {
      this.dragging = true;
      this.last = { x: e.global.x, y: e.global.y };
      this.container.cursor = 'grabbing';
    });
    const stopDrag = () => { this.dragging = false; this.container.cursor = 'grab'; };
    this.container.on('pointerup', stopDrag);
    this.container.on('pointerupoutside', stopDrag);
    this.container.on('pointermove', (e: FederatedPointerEvent) => {
      if (!this.dragging) return;
      this.interacted = true;
      this.world.position.x += e.global.x - this.last.x;
      this.world.position.y += e.global.y - this.last.y;
      this.last = { x: e.global.x, y: e.global.y };
    });
    this.container.on('pointertap', () => {
      const now = performance.now();
      if (now - this.lastTapTime < 350) { this.interacted = false; this.fit(); }
      this.lastTapTime = now;
    });
    this.container.on('wheel', (e: FederatedWheelEvent) => {
      e.stopPropagation();
      this.interacted = true;
      const local = this.container.toLocal(e.global);
      const before = { x: (local.x - this.world.position.x) / this.world.scale.x, y: (local.y - this.world.position.y) / this.world.scale.y };
      const scale = clampScale(this.world.scale.x * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      this.world.scale.set(scale);
      this.world.position.set(local.x - before.x * scale, local.y - before.y * scale);
    });
  }

  async mount(initialState: GameState) {
    this.lastState = initialState;
    await this.board.loadAssets();
    this.ready = true;
    this.loadingText.visible = false;
    // Use the freshest known state (a dispatch may have landed while assets were loading), not the stale parameter.
    this.computeContentMetrics(this.lastState);
    this.fit();
  }

  private computeContentMetrics(state: GameState) {
    this.board.render(state, null);
    const boardBounds = this.board.container.getLocalBounds();
    this.contentCenterY = boardBounds.y + boardBounds.height / 2;
    this.contentWidth = boardBounds.width;
    this.contentHeight = boardBounds.height;
  }

  render(state: GameState, selectedTileId?: string | null) {
    this.lastState = state;
    if (!this.ready) return;
    this.board.render(state, selectedTileId);
  }

  /** `insetLeft`/`insetRight` describe the floating side panels (action panel / journal) — the board
   * itself still covers the full (x, y, width, height) rect (so panning can slide it under them),
   * but `fit()` sizes and centers its content in the gap those panels leave clear between them. */
  layout(x: number, y: number, width: number, height: number, insetLeft = 0, insetRight = 0) {
    this.container.position.set(x, y);
    this.rectW = width;
    this.rectH = height;
    this.insetLeft = insetLeft;
    this.insetRight = insetRight;
    this.mask_.clear();
    this.mask_.rect(0, 0, width, height).fill({ color: 0xffffff });
    this.loadingText.position.set(width / 2, height / 2);
    if (this.ready && !this.interacted) this.fit();
  }

  private fit() {
    const pad = 48;
    const visibleW = Math.max(100, this.rectW - this.insetLeft - this.insetRight);
    const availW = Math.max(100, visibleW - pad);
    const availH = Math.max(100, this.rectH - pad);
    const scale = clampScale(Math.min(availW / this.contentWidth, availH / this.contentHeight));
    this.world.scale.set(scale);
    this.world.position.set(this.insetLeft + visibleW / 2, this.rectH / 2 - this.contentCenterY * scale);
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
