import { useEffect, useRef } from 'react';
import { Application, Container, FederatedPointerEvent, Text } from 'pixi.js';
import type { GameState } from '../game-core/types';
import { BoardRenderer } from './BoardRenderer';

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export default function GameView({ state, onTile, selectedTileId }: { state: GameState; onTile: (id: string) => void; selectedTileId?: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const boardRef = useRef<BoardRenderer | null>(null);
  const stateRef = useRef(state);
  const onTileRef = useRef(onTile);
  const selectedTileIdRef = useRef(selectedTileId);
  stateRef.current = state;
  onTileRef.current = onTile;
  selectedTileIdRef.current = selectedTileId;

  useEffect(() => {
    if (!host.current) return;
    const app = new Application();
    appRef.current = app;
    let alive = true;
    let resize = () => {};
    let onWheel = (_e: WheelEvent) => {};
    let onDblClick = () => {};
    let hostObserver: ResizeObserver | null = null;

    const initPromise = (async () => {
      await app.init({
        resizeTo: host.current!,
        background: 0x081014,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio, 2),
      });
      if (!alive) return;

      host.current!.appendChild(app.canvas);
      const world = new Container();
      app.stage.addChild(world);
      app.stage.eventMode = 'static';
      app.stage.cursor = 'grab';

      const board = new BoardRenderer((id) => onTileRef.current(id));
      boardRef.current = board;
      world.addChild(board.container);
      await board.loadAssets();
      if (!alive) return;

      const title = new Text({
        text: 'WIRAQOCHA',
        style: { fontFamily: 'Georgia', fontSize: 30, fontWeight: '700', fill: 0xd8b36a, letterSpacing: 4 },
      });
      title.anchor.set(0.5);
      world.addChild(title);

      const subtitle = new Text({
        text: 'EXPLORATION • TECHNOLOGIE • EMPIRE',
        style: { fontFamily: 'Georgia', fontSize: 12, fill: 0xa98b60, letterSpacing: 2 },
      });
      subtitle.anchor.set(0.5);
      world.addChild(subtitle);

      board.render(stateRef.current, selectedTileIdRef.current);

      // The board re-centers itself around (0,0) on every render, so lay the
      // header out just above it; "fit" scales/centers the whole group to
      // whatever room is available, and stays in charge until the player
      // manually zooms or pans (then their view is left alone).
      const boardBounds = board.container.getLocalBounds();
      title.position.set(0, boardBounds.y - 40);
      subtitle.position.set(0, boardBounds.y - 10);
      const contentTop = title.y - 22;
      const contentBottom = boardBounds.y + boardBounds.height;
      const contentCenterY = (contentTop + contentBottom) / 2;
      const contentWidth = boardBounds.width;
      const contentHeight = contentBottom - contentTop;

      let interacted = false;
      const fit = () => {
        const pad = 64;
        const availW = Math.max(100, app.screen.width - pad);
        const availH = Math.max(100, app.screen.height - pad);
        const scale = clampScale(Math.min(availW / contentWidth, availH / contentHeight));
        world.scale.set(scale);
        world.position.set(app.screen.width / 2, app.screen.height / 2 - contentCenterY * scale);
      };

      fit();
      resize = () => { app.stage.hitArea = app.screen; if (!interacted) fit(); };
      resize();
      window.addEventListener('resize', resize);

      // Pixi's `resizeTo` keeps the canvas itself in sync with the host element via its own
      // ResizeObserver, but that never touches our world scale/position — so any layout shift
      // that changes the host's size WITHOUT firing a window 'resize' event (e.g. the side
      // panel growing taller and changing the grid row height) leaves the board rendered at
      // the old scale inside a now-differently-sized canvas, which reads as "stretching".
      // Watching the host directly keeps fit() in sync with whatever actually resized it.
      hostObserver = new ResizeObserver(() => resize());
      hostObserver.observe(host.current!);

      // Pan: drag anywhere on the board background.
      let dragging = false;
      let last = { x: 0, y: 0 };
      app.stage.on('pointerdown', (e: FederatedPointerEvent) => {
        dragging = true;
        last = { x: e.global.x, y: e.global.y };
        app.canvas.style.cursor = 'grabbing';
      });
      const stopDrag = () => { dragging = false; app.canvas.style.cursor = 'grab'; };
      app.stage.on('pointerup', stopDrag);
      app.stage.on('pointerupoutside', stopDrag);
      app.stage.on('pointermove', (e: FederatedPointerEvent) => {
        if (!dragging) return;
        interacted = true;
        world.position.x += e.global.x - last.x;
        world.position.y += e.global.y - last.y;
        last = { x: e.global.x, y: e.global.y };
      });

      // Zoom: mouse wheel, keeping the point under the cursor fixed.
      onWheel = (ev: WheelEvent) => {
        ev.preventDefault();
        interacted = true;
        const rect = app.canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const before = { x: (px - world.position.x) / world.scale.x, y: (py - world.position.y) / world.scale.y };
        const scale = clampScale(world.scale.x * (ev.deltaY < 0 ? 1.12 : 1 / 1.12));
        world.scale.set(scale);
        world.position.set(px - before.x * scale, py - before.y * scale);
      };
      app.canvas.addEventListener('wheel', onWheel, { passive: false });

      // Double-click/tap the background to recenter and re-fit the board.
      onDblClick = () => { interacted = false; fit(); };
      app.canvas.addEventListener('dblclick', onDblClick);
    })();

    return () => {
      alive = false;
      window.removeEventListener('resize', resize);
      hostObserver?.disconnect();
      // Le destroy() du ResizePlugin plante si l'init() n'est pas encore résolu
      // (ex: double-montage StrictMode en dev), donc on attend la fin de l'init.
      initPromise.finally(() => {
        app.canvas?.removeEventListener('wheel', onWheel);
        app.canvas?.removeEventListener('dblclick', onDblClick);
        if (app.renderer) app.destroy(true, true);
      });
      appRef.current = null;
      boardRef.current = null;
    };
  }, []);

  useEffect(() => {
    boardRef.current?.render(state, selectedTileId);
  }, [state, selectedTileId]);

  return <div className="pixi-host" ref={host} />;
}
