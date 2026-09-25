import { Assets, Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameState, PawnType, TileState } from '../game-core/types';

const playerColor: Record<string, number> = {
  albion: 0xb74c32,
  helios: 0x3f79a6,
  meridian: 0x3d8a68,
  valhalla: 0xb88b3d,
};

// `ruins`, `village` and `somnium-vein` are never actually used for rendering
// (all three pick their own dedicated ground art below) — they just need a
// valid, existing file here to satisfy the Record and preload without erroring.
const terrainAsset: Record<TileState['terrain'], string> = {
  jungle: '/assets/terrain/jungle.png',
  ruins: '/assets/terrain/jungle.png',
  mountain: '/assets/terrain/mountain.png',
  'somnium-vein': '/assets/terrain/jungle.png',
  'machine-cemetery': '/assets/terrain/machine-cemetery.png',
  village: '/assets/terrain/jungle.png',
};

const pawnAsset: Record<PawnType, string> = {
  'base-camp': '/assets/pawns/base-camp.png',
  explorer: '/assets/pawns/explorer.png',
  drilling: '/assets/pawns/drilling.png',
  zeppelin: '/assets/pawns/zeppelin.png',
  'android-explorer': '/assets/pawns/android-explorer.png',
  juggernaut: '/assets/pawns/juggernaut.png',
  'mechanical-miner': '/assets/pawns/mechanical-miner.png',
};

const tokenAsset = {
  1: '/assets/tokens/artifact-1.png',
  2: '/assets/tokens/artifact-2.png',
  3: '/assets/tokens/artifact-3.png',
  4: '/assets/tokens/artifact-4.png',
} as const;

// Dedicated Village ground art (jungle vs. montagne), pointy-top cropped like
// the rest of the terrain art — no rotation needed.
const villageTerrainAsset = {
  jungle: '/assets/terrain/jungle_village.png',
  mountain: '/assets/terrain/mountain_village.png',
};

// Dedicated Temple (Ruines) ground art (jungle vs. montagne).
const ruinsTerrainAsset = {
  jungle: '/assets/terrain/jungle_ruins.png',
  mountain: '/assets/terrain/mountain_ruins.png',
};

// Dedicated Filon de Somnium ground art (jungle vs. montagne).
const somniumTerrainAsset = {
  jungle: '/assets/terrain/jungle_somnium.png',
  mountain: '/assets/terrain/mountain_somnium.png',
};

// Pointy-top hex layout (rows) — matches the terrain art's native hex crop, so
// tiles need no rotation: row 0 (top, under the Cimetière) has 3 tiles, rows
// 1-3 have 5 tiles each, and row 4 (bottom) has 4 tiles split 2-and-2 around
// an empty center slot.
// The dedicated Village/Ruines/Filon/Cimetière art is a pointy-top hex whose
// painted border touches the canvas edges exactly (1008×1043px, no padding),
// so its width:height ratio pins down its true proportions precisely.
const BORDERED_ART_ASPECT = 1008 / 1043;

// The horizontal spacing factor is intentionally larger than the "true" hex
// value (sqrt(3) ≈ 1.732) — terrain art is drawn oversized so organic
// Jungle/Montagne photos fully bleed into the tile with no gaps, and at the
// true spacing that oversized art (and the bordered art above, sized to
// height = 2×size) overlaps visibly into neighboring tiles. Widening the
// spacing to comfortably clear that art's width removes the overlap; the
// vertical (row) spacing doesn't have the same issue.
const HORIZONTAL_SPACING = 2.0;

function axialToPixel(q: number, r: number, size: number) {
  return { x: size * HORIZONTAL_SPACING * (q + r / 2), y: size * 1.5 * r };
}

function hexPoints(size: number) {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (30 + i * 60);
    pts.push(Math.cos(a) * size, Math.sin(a) * size);
  }
  return pts;
}

export class BoardRenderer {
  readonly container = new Container();
  private tiles = new Map<string, Container>();
  private textures = new Map<string, any>();
  private size = 74;
  private onTile: (id: string) => void;
  private ready = false;

  constructor(onTile: (id: string) => void) {
    this.onTile = onTile;
  }

  async loadAssets() {
    const paths = new Set<string>([
      ...Object.values(terrainAsset),
      ...Object.values(pawnAsset),
      ...Object.values(tokenAsset),
      '/assets/tokens/force-field.png',
      '/assets/tokens/flying-fortress.png',
      '/assets/tokens/death-ray.png',
      '/assets/resources/somnium.png',
      ...Object.values(villageTerrainAsset),
      ...Object.values(ruinsTerrainAsset),
      ...Object.values(somniumTerrainAsset),
    ]);

    const loaded = await Promise.all(
      [...paths].map(async (path) => [path, await Assets.load(path)] as const),
    );

    for (const [path, texture] of loaded) this.textures.set(path, texture);
    this.ready = true;
  }

  render(state: GameState, selectedTileId?: string | null) {
    if (!this.ready) return;
    this.container.removeChildren();
    this.tiles.clear();

    for (const tile of state.tiles) this.drawTile(tile, state, tile.id === selectedTileId);
  }

  private texture(path: string) {
    return this.textures.get(path);
  }

  private drawTile(tile: TileState, state: GameState, selected: boolean) {
    const c = new Container();
    const p = axialToPixel(tile.q, tile.r, this.size);
    c.position.set(p.x, p.y);
    const interactable = tile.terrain !== 'machine-cemetery' && !tile.devastated;
    c.eventMode = interactable ? 'static' : 'none';
    c.cursor = interactable ? 'pointer' : 'default';

    const outline = new Graphics();
    outline.poly(hexPoints(this.size + 2)).fill({ color: 0x05090c, alpha: 0.55 });
    c.addChild(outline);

    // Villages, Temples (Ruines) and Filons de Somnium each have their own
    // dedicated (jungle vs. montagne) ground art.
    const ground = tile.mountain ? 'mountain' : 'jungle';
    const terrainTexturePath = tile.terrain === 'village'
      ? villageTerrainAsset[ground]
      : tile.terrain === 'ruins'
        ? ruinsTerrainAsset[ground]
        : tile.terrain === 'somnium-vein'
          ? somniumTerrainAsset[ground]
          : terrainAsset[tile.terrain];
    const terrain = new Sprite(this.texture(terrainTexturePath));
    terrain.anchor.set(0.5);
    const hasBorderedArt = tile.terrain === 'village' || tile.terrain === 'ruins'
      || tile.terrain === 'somnium-vein' || tile.terrain === 'machine-cemetery';
    if (hasBorderedArt) {
      // Sized from the art's own true proportions (see BORDERED_ART_ASPECT)
      // instead of forcing a square, so it isn't stretched.
      terrain.height = this.size * 2;
      terrain.width = terrain.height * BORDERED_ART_ASPECT;
    } else {
      terrain.width = this.size * 1.92;
      terrain.height = this.size * 1.92;
    }
    c.addChild(terrain);

    const owner = tile.ownerId;
    const frame = new Graphics();
    frame.poly(hexPoints(this.size * 0.98));
    frame.stroke({
      width: owner ? 4 : 2,
      color: owner ? playerColor[owner] : 0xc9a86a,
      alpha: owner ? 1 : 0.72,
    });
    c.addChild(frame);

    // Subtle territory ownership wash.
    if (owner) {
      const wash = new Graphics();
      wash.poly(hexPoints(this.size * 0.88)).fill({ color: playerColor[owner], alpha: 0.08 });
      c.addChild(wash);
    }


    // What conquering this tile yields, shown top-center: Resource cubes, the
    // Somnium Extraction bonus on a Filon, or the extra die from a Village.
    if (interactable) {
      const yieldLabel = tile.resources > 0
        ? `▣ ${tile.resources}`
        : tile.terrain === 'somnium-vein'
          ? '💎 ×2'
          : tile.dieBonus > 0
            ? `🎲 +${tile.dieBonus}`
            : undefined;
      if (yieldLabel) {
        const yieldY = -this.size * 0.72;
        const yieldText = new Text({
          text: yieldLabel,
          style: {
            fontFamily: 'Georgia',
            fontSize: 13,
            fill: 0xf8e8c1,
            fontWeight: '700',
          },
        });
        yieldText.anchor.set(0.5);
        yieldText.position.set(0, yieldY);

        const padX = 6, padY = 3;
        const boxW = yieldText.width + padX * 2;
        const boxH = yieldText.height + padY * 2;
        const yieldBg = new Graphics();
        yieldBg.roundRect(-boxW / 2, yieldY - boxH / 2, boxW, boxH, 5)
          .fill({ color: 0x07131a, alpha: 0.82 })
          .stroke({ width: 1, color: 0xc9a86a, alpha: 0.6 });
        c.addChild(yieldBg);
        c.addChild(yieldText);
      }
    }

    // Conquest value — a straight number, or the exact dice combination required
    // for a 'double'/'suite' tile (e.g. "6-6", "4-5-6").
    if (interactable) {
      const label = tile.conquestType === 'number' ? String(tile.conquest) : (tile.conquestDice ?? []).join('-');
      const number = new Text({
        text: label,
        style: {
          fontFamily: 'Georgia',
          fontSize: tile.conquestType === 'number' ? 18 : 13,
          fill: 0xf8e8c1,
          fontWeight: '700',
          stroke: { color: 0x081014, width: 5 },
        },
      });
      number.anchor.set(0.5);
      // A pawn standing on the tile covers the centered number, so shift it right
      // (same row) instead of overlapping.
      number.position.set(tile.pawnId ? this.size * 0.58 : 0, this.size * 0.55);
      c.addChild(number);
    }

    const pawn = tile.pawnId ? state.pawns.find((p) => p.id === tile.pawnId) : undefined;

    // A Camp de Base always carries a natural defense of 5, even with no die
    // placed on it — shown alongside (and overridden by, if higher) a placed
    // defense die, then clamped to 1 while psychically probed.
    const naturalDefense = pawn?.type === 'base-camp' ? 5 : 0;
    const rawDefense = Math.max(naturalDefense, tile.defense ?? 0);
    const effectiveDefense = tile.psychicProbed ? Math.min(rawDefense, 1) : rawDefense;
    if (effectiveDefense > 0) {
      const defense = new Graphics();
      defense.circle(-this.size * 0.56, -this.size * 0.53, 15).fill({ color: 0x07131a, alpha: 0.9 });
      defense.circle(-this.size * 0.56, -this.size * 0.53, 15).stroke({ width: 2, color: 0x75cbed });
      c.addChild(defense);
      const d = new Text({ text: String(effectiveDefense), style: { fontSize: 14, fill: 0xffffff, fontWeight: '700' } });
      d.anchor.set(0.5);
      d.position.set(-this.size * 0.56, -this.size * 0.53);
      c.addChild(d);
    }

    // Artifact token remains visible until that artifact is actually owned.
    if (tile.artifact && !state.players.some((p) => p.artifacts.includes(tile.artifact!))) {
      const artifact = new Sprite(this.texture(tokenAsset[tile.artifact as 1 | 2 | 3 | 4]));
      artifact.anchor.set(0.5);
      artifact.width = 31;
      artifact.height = 31;
      artifact.position.set(-this.size * 0.5, this.size * 0.38);
      c.addChild(artifact);
    }

    if (pawn) this.drawPawn(c, pawn.type, pawn.ownerId);

    if (tile.forceField) {
      const ring = new Graphics();
      ring.poly(hexPoints(this.size * 1.04)).stroke({ width: 4, color: 0x49e8ff, alpha: 0.9 });
      c.addChild(ring);
    }
    if (tile.flyingFortress) {
      const badge = new Text({ text: '✈', style: { fontSize: 20, fill: 0xffe08a } });
      badge.anchor.set(0.5);
      badge.position.set(this.size * 0.56, -this.size * 0.53);
      c.addChild(badge);
    }
    if (tile.psychicProbed) {
      const probe = new Text({ text: '◈', style: { fontSize: 18, fill: 0xff8ad1 } });
      probe.anchor.set(0.5);
      probe.position.set(0, -this.size * 0.53);
      c.addChild(probe);
    }
    if (selected) {
      const highlight = new Graphics();
      highlight.poly(hexPoints(this.size * 1.1)).stroke({ width: 6, color: 0xffd93d, alpha: 0.95 });
      c.addChild(highlight);
      const glow = new Graphics();
      glow.poly(hexPoints(this.size * 1.04)).fill({ color: 0xffd93d, alpha: 0.12 });
      c.addChild(glow);
      const pointer = new Text({ text: '▼', style: { fontSize: 26, fill: 0xffd93d } });
      pointer.anchor.set(0.5);
      pointer.position.set(0, -this.size * 1.35);
      c.addChild(pointer);
    }

    if (tile.devastated) {
      const overlay = new Graphics();
      overlay.poly(hexPoints(this.size)).fill({ color: 0x1a0000, alpha: 0.72 });
      c.addChild(overlay);
      const skull = new Text({ text: '☠', style: { fontSize: 34, fill: 0xff5555 } });
      skull.anchor.set(0.5);
      c.addChild(skull);
    }

    if (interactable) {
      c.on('pointertap', () => this.onTile(tile.id));
      c.on('pointerover', () => {
        frame.alpha = 1;
        frame.scale.set(1.035);
      });
      c.on('pointerout', () => {
        frame.scale.set(1);
      });
    }

    this.tiles.set(tile.id, c);
    this.container.addChild(c);
  }

  private drawPawn(parent: Container, type: PawnType, ownerId: string) {
    const sprite = new Sprite(this.texture(pawnAsset[type]));
    sprite.anchor.set(0.5, 0.72);
    const targetWidth = type === 'zeppelin' ? 76 : type === 'base-camp' ? 62 : 50;
    sprite.width = targetWidth;
    sprite.scale.y = sprite.scale.x;
    sprite.position.set(0, type === 'zeppelin' ? -5 : 12);
    parent.addChild(sprite);

    const badge = new Graphics();
    badge.circle(0, this.size * 0.58, 9).fill({ color: playerColor[ownerId] ?? 0xffffff, alpha: 0.96 });
    badge.circle(0, this.size * 0.58, 9).stroke({ width: 2, color: 0xf7e4b4 });
    parent.addChild(badge);
  }
}
