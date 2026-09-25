# Wiraqocha — PixiJS + React V1

V1 prototype of a Wiraqocha-inspired web board game using **React + PixiJS + TypeScript**.

## Run

```bash
npm install
npm run dev
```

## Architecture

```text
React
 ├── HUD / dice / log
 └── GameView
       └── PixiJS
            ├── BoardRenderer
            ├── terrain sprites
            ├── pawn sprites
            ├── artifact/token sprites
            └── interactions

GameEngine
 └── GameState / actions / prototype rules
```

## V1 art pipeline

The PixiJS board now loads individual PNG assets rather than drawing placeholder terrain/pawns with colored `Graphics` objects.

```text
public/assets/
├── terrain/
├── pawns/
├── tokens/
├── resources/
└── concept/
```

The `concept/` images are kept as visual references; the individual PNGs are the assets consumed by `BoardRenderer`.

## Current prototype

- PixiJS hex board
- individual terrain sprites
- individual pawn sprites
- ownership frames
- Artifact tokens
- defense markers
- interactive territory hover/click
- React HUD and dice tray
- prototype conquest / Somnium / Artifact flow

## Important

The board data in `src/game-data/board.ts` is still explicitly marked as **prototype data**. Before calling the game rules-complete, reconcile the exact 22-tile setup and all printed tile conditions against the supplied Wiraqocha rulebook.
