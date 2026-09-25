import { Application } from 'pixi.js';
import { GameApp } from './GameApp';
import './styles/app.css';

(async () => {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x081014,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio, 2),
  });
  document.body.appendChild(app.canvas);
  new GameApp(app);
})();
