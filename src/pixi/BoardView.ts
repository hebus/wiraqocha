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
  private contentCenterX = 0;
  private contentCenterY = 0;
  private contentWidth = 1;
  private contentHeight = 1;

  private dragging = false;
  private last = { x: 0, y: 0 };
  private lastTapTime = 0;

  // Two-finger pinch-to-zoom (touch has no wheel event) — tracks every active pointer by id so a
  // second finger going down mid-drag cleanly switches from panning to pinching, and lifting one
  // finger back to panning resumes from the remaining finger's current position with no jump.
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStartDistance = 1;
  private pinchStartScale = 1;
  private pinchAnchor = { x: 0, y: 0 };
  // Pixi fires a `pointertap` per finger on release (not one for the whole gesture), so lifting
  // a pinch's two fingers produces two taps back-to-back — indistinguishable from a genuine
  // double-tap unless we remember the gesture involved more than one pointer at once.
  private maxSimultaneousPointers = 0;

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
      if (this.pointers.size === 0) this.maxSimultaneousPointers = 0;
      this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      this.maxSimultaneousPointers = Math.max(this.maxSimultaneousPointers, this.pointers.size);
      if (this.pointers.size >= 2) {
        this.dragging = false;
        this.startPinch();
      } else {
        this.dragging = true;
        this.last = { x: e.global.x, y: e.global.y };
        this.container.cursor = 'grabbing';
      }
    });
    const stopPointer = (e: FederatedPointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size >= 2) {
        this.startPinch();
      } else if (this.pointers.size === 1) {
        // Resume single-finger panning from the remaining finger's current spot, not a stale one.
        const [remaining] = this.pointers.values();
        this.dragging = true;
        this.last = { x: remaining.x, y: remaining.y };
      } else {
        this.dragging = false;
        this.container.cursor = 'grab';
      }
    };
    this.container.on('pointerup', stopPointer);
    this.container.on('pointerupoutside', stopPointer);
    this.container.on('pointermove', (e: FederatedPointerEvent) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
      if (this.pointers.size >= 2) {
        this.updatePinch();
        return;
      }
      if (!this.dragging) return;
      this.interacted = true;
      this.world.position.x += e.global.x - this.last.x;
      this.world.position.y += e.global.y - this.last.y;
      this.last = { x: e.global.x, y: e.global.y };
    });
    this.container.on('pointertap', () => {
      if (this.maxSimultaneousPointers > 1) return; // a pinch's finger-lifts, not a real tap
      const now = performance.now();
      if (now - this.lastTapTime < 350) { this.interacted = false; this.fit(); }
      this.lastTapTime = now;
    });
    this.container.on('wheel', (e: FederatedWheelEvent) => {
      e.stopPropagation();
      this.interacted = true;
      const scale = clampScale(this.world.scale.x * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      this.zoomAround(e.global, scale);
    });
  }

  /** Rescales `world` while keeping the content point under `globalPoint` fixed on screen. */
  private zoomAround(globalPoint: { x: number; y: number }, scale: number) {
    const local = this.container.toLocal(globalPoint);
    const before = {
      x: (local.x - this.world.position.x) / this.world.scale.x,
      y: (local.y - this.world.position.y) / this.world.scale.y,
    };
    this.world.scale.set(scale);
    this.world.position.set(local.x - before.x * scale, local.y - before.y * scale);
  }

  private startPinch() {
    const [p1, p2] = this.pointers.values();
    this.pinchStartDistance = Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y));
    this.pinchStartScale = this.world.scale.x;
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const local = this.container.toLocal(mid);
    this.pinchAnchor = {
      x: (local.x - this.world.position.x) / this.world.scale.x,
      y: (local.y - this.world.position.y) / this.world.scale.y,
    };
  }

  private updatePinch() {
    this.interacted = true;
    const [p1, p2] = this.pointers.values();
    const distance = Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y));
    const scale = clampScale(this.pinchStartScale * (distance / this.pinchStartDistance));
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const local = this.container.toLocal(mid);
    this.world.scale.set(scale);
    this.world.position.set(local.x - this.pinchAnchor.x * scale, local.y - this.pinchAnchor.y * scale);
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
    // The hex layout isn't perfectly symmetric around local (0, 0) (see BoardRenderer's row
    // comment), so both axes need their own content-center offset, not just the vertical one.
    this.contentCenterX = boardBounds.x + boardBounds.width / 2;
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
    const rawScale = Math.min(availW / this.contentWidth, availH / this.contentHeight);
    const scale = clampScale(rawScale);
    this.world.scale.set(scale);
    this.world.position.set(
      this.insetLeft + visibleW / 2 - this.contentCenterX * scale,
      this.rectH / 2 - this.contentCenterY * scale,
    );
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
