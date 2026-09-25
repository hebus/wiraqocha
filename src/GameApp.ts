import type { Application, Container } from 'pixi.js';
import { StartScene } from './scenes/StartScene';
import { AISetupScene } from './scenes/AISetupScene';
import { GameScene } from './scenes/GameScene';
import { generateBoard } from './game-data/board';
import { createInitialState } from './game-core/engine';
import { Store } from './state/store';
import type { GameState, PlayerId } from './game-core/types';

interface Scene {
  container: Container;
  layout: (width: number, height: number) => void;
  destroy: () => void;
}

/** Top-level orchestrator: swaps `StartScene` → `AISetupScene` → `GameScene` onto the shared stage. */
export class GameApp {
  private currentScene: Scene | null = null;
  private playerCount: 2 | 3 | 4 = 4;

  constructor(private app: Application) {
    this.showStartScene();
    window.addEventListener('resize', () => this.handleResize());
  }

  private handleResize() {
    this.currentScene?.layout(window.innerWidth, window.innerHeight);
  }

  private mount(scene: Scene) {
    if (this.currentScene) {
      this.app.stage.removeChild(this.currentScene.container);
      this.currentScene.destroy();
    }
    this.currentScene = scene;
    this.app.stage.addChild(scene.container);
  }

  private showStartScene() {
    this.mount(new StartScene((count) => {
      this.playerCount = count;
      this.showAISetupScene();
    }));
  }

  private showAISetupScene() {
    this.mount(new AISetupScene(this.playerCount, (aiIds: PlayerId[]) => {
      const initialState = createInitialState(generateBoard(), this.playerCount, aiIds);
      this.showGameScene(initialState);
    }));
  }

  private showGameScene(initialState: GameState) {
    this.mount(new GameScene(new Store<GameState>(initialState)));
  }
}
