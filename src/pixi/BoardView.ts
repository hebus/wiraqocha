import { Container, FederatedPointerEvent, FederatedWheelEvent, Graphics, Text } from 'pixi.js';
import type { GameState } from '../game-core/types';
import { BoardRenderer } from './BoardRenderer';
import { COLOR, FONT_SERIF } from './theme';

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Board viewport: hosts `BoardRenderer` plus pan/zoom/fit and the title header, scoped to an arbitrary rect. */
export class BoardView {
  readonly container = new Container();
  private mask_ = new Graphics();
  private world = new Container();
  private board: BoardRenderer;
  private loadingText: Text;
  private title: Text;
  private subtitle: Text;
  private ready = false;
  private lastState: GameState | null = null;

  private rectW = 1;
  private rectH = 1;
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

    this.title = new Text({ text: 'WIRAQOCHA', style: { fontFamily: FONT_SERIF, fontSize: 30, fontWeight: '700', fill: COLOR.goldBright, letterSpacing: 4 } });
    this.title.anchor.set(0.5);
    this.world.addChild(this.title);

    this.subtitle = new Text({ text: 'EXPLORATION • TECHNOLOGIE • EMPIRE', style: { fontFamily: FONT_SERIF, fontSize: 12, fill: COLOR.goldDim, letterSpacing: 2 } });
    this.subtitle.anchor.set(0.5);
    this.world.addChild(this.subtitle);

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
    this.title.position.set(0, boardBounds.y - 40);
    this.subtitle.position.set(0, boardBounds.y - 10);
    const contentTop = this.title.y - 22;
    const contentBottom = boardBounds.y + boardBounds.height;
    this.contentCenterY = (contentTop + contentBottom) / 2;
    this.contentWidth = boardBounds.width;
    this.contentHeight = contentBottom - contentTop;
  }

  render(state: GameState, selectedTileId?: string | null) {
    this.lastState = state;
    if (!this.ready) return;
    this.board.render(state, selectedTileId);
  }

  layout(x: number, y: number, width: number, height: number) {
    this.container.position.set(x, y);
    this.rectW = width;
    this.rectH = height;
    this.mask_.clear();
    this.mask_.rect(0, 0, width, height).fill({ color: 0xffffff });
    this.loadingText.position.set(width / 2, height / 2);
    if (this.ready && !this.interacted) this.fit();
  }

  private fit() {
    const pad = 64;
    const availW = Math.max(100, this.rectW - pad);
    const availH = Math.max(100, this.rectH - pad);
    const scale = clampScale(Math.min(availW / this.contentWidth, availH / this.contentHeight));
    this.world.scale.set(scale);
    this.world.position.set(this.rectW / 2, this.rectH / 2 - this.contentCenterY * scale);
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
