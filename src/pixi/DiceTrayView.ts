import { Container } from 'pixi.js';
import type { GameAction, GameState } from '../game-core/types';
import { Button } from './ui/Button';

const DIE_SIZE = 48;
const TOOL_SIZE = 22;
const GAP = 14;

/** Row of rollable/selectable dice plus their per-die tools (adjust/reroll/exoskeleton). */
export class DiceTrayView {
  readonly container = new Container();

  constructor(private dispatch: (a: GameAction) => GameState) {}

  render(state: GameState) {
    this.container.removeChildren();
    if (!state.dice.values.length) return;

    const player = state.players.find((p) => p.id === state.activePlayerId)!;
    const canAdjust = player.resources >= 2;
    const canReroll = state.turnUsed.ruinsRerolls < state.turnUsed.ruinsCapacity;
    const canExoskeleton = player.technologies.includes('battle-exoskeleton')
      && (player.techBuiltTurn['battle-exoskeleton'] ?? 0) < state.turn
      && !state.turnUsed.battleExoskeleton;

    let x = 0;
    state.dice.values.forEach((v, i) => {
      const slot = new Container();
      slot.position.set(x, 0);

      const used = state.dice.used[i];
      const die = new Button({
        label: String(v),
        width: DIE_SIZE,
        height: DIE_SIZE,
        fontSize: 20,
        variant: state.selectedDice.includes(i) ? 'primary' : 'secondary',
        disabled: used,
        onClick: () => this.dispatch({ type: 'SELECT_DIE', index: i }),
      });
      slot.addChild(die);

      if (!used) {
        const tools: Container[] = [];
        tools.push(new Button({ label: '−', width: TOOL_SIZE, height: TOOL_SIZE, fontSize: 12, variant: 'ghost', disabled: !canAdjust || v <= 1, onClick: () => this.dispatch({ type: 'ADJUST_DIE', index: i, delta: -1 }) }));
        tools.push(new Button({ label: '+', width: TOOL_SIZE, height: TOOL_SIZE, fontSize: 12, variant: 'ghost', disabled: !canAdjust, onClick: () => this.dispatch({ type: 'ADJUST_DIE', index: i, delta: 1 }) }));
        if (canReroll) tools.push(new Button({ label: '↻', width: TOOL_SIZE, height: TOOL_SIZE, fontSize: 12, variant: 'ghost', onClick: () => this.dispatch({ type: 'REROLL_DIE', index: i }) }));
        if (canExoskeleton) tools.push(new Button({ label: '⚙5', width: TOOL_SIZE + 8, height: TOOL_SIZE, fontSize: 10, variant: 'ghost', onClick: () => this.dispatch({ type: 'USE_BATTLE_EXOSKELETON', dieIndex: i }) }));

        let toolsWidth = 0;
        for (const t of tools) toolsWidth += t.getLocalBounds().width + 3;
        toolsWidth -= 3;
        let toolX = (DIE_SIZE - toolsWidth) / 2;
        for (const t of tools) {
          t.position.set(toolX, DIE_SIZE + 6);
          toolX += t.getLocalBounds().width + 3;
          slot.addChild(t);
        }
      }

      this.container.addChild(slot);
      x += DIE_SIZE + GAP;
    });
  }
}
