import { Container, Graphics, Text } from 'pixi.js';
import { COLOR, body } from '../theme';

export interface ToggleButtonOptions {
  label: string;
  width?: number;
  height?: number;
  checked?: boolean;
  onLabel?: string;
  offLabel?: string;
  onChange?: (checked: boolean) => void;
}

/** A row with a label on the left and an ON/OFF pill on the right, toggled on click. */
export class ToggleButton extends Container {
  private bg = new Graphics();
  private tag = new Text({ text: '', style: { ...body, fontSize: 10, fontWeight: '700' } });
  private checked: boolean;
  private w: number;
  private h: number;
  private onLabel: string;
  private offLabel: string;
  private onChange?: (checked: boolean) => void;

  constructor(opts: ToggleButtonOptions) {
    super();
    this.w = opts.width ?? 260;
    this.h = opts.height ?? 44;
    this.checked = opts.checked ?? false;
    this.onLabel = opts.onLabel ?? 'IA';
    this.offLabel = opts.offLabel ?? 'HUMAIN';
    this.onChange = opts.onChange;

    this.addChild(this.bg);
    const label = new Text({ text: opts.label, style: { ...body, fontSize: 13 } });
    label.position.set(14, this.h / 2);
    label.anchor.set(0, 0.5);
    this.addChild(label);

    this.tag.anchor.set(1, 0.5);
    this.tag.position.set(this.w - 14, this.h / 2);
    this.addChild(this.tag);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', () => {
      this.checked = !this.checked;
      this.redraw();
      this.onChange?.(this.checked);
    });
    this.redraw();
  }

  private redraw() {
    this.bg.clear();
    this.bg.roundRect(0, 0, this.w, this.h, 10)
      .fill({ color: COLOR.panelBg })
      .stroke({ width: 1, color: this.checked ? COLOR.cyan : COLOR.rowBorder });
    this.tag.text = this.checked ? this.onLabel : this.offLabel;
    this.tag.style.fill = this.checked ? COLOR.cyan : COLOR.goldDim;
  }
}
