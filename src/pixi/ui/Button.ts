import { Container, Graphics, Text } from 'pixi.js';
import { COLOR, buttonLabel } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link';

export interface ButtonOptions {
  label: string;
  width?: number;
  height?: number;
  fontSize?: number;
  variant?: ButtonVariant;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const VARIANT_STYLE: Record<ButtonVariant, { bg: number; bgHover: number; bgActive: number; border: number; borderActive: number }> = {
  primary: { bg: COLOR.buttonBgHover, bgHover: 0x9c7137, bgActive: 0x9c7137, border: COLOR.gold, borderActive: COLOR.cyan },
  secondary: { bg: COLOR.buttonBg, bgHover: 0x4a3d25, bgActive: 0x3a6b6f, border: COLOR.buttonBorder, borderActive: COLOR.cyan },
  ghost: { bg: 0x1c2a2c, bgHover: 0x263638, bgActive: 0x3a6b6f, border: COLOR.buttonBorder, borderActive: COLOR.cyan },
  link: { bg: 0x000000, bgHover: 0x000000, bgActive: 0x000000, border: 0x000000, borderActive: 0x000000 },
};

/** A clickable rounded-rect button with a centered label; supports hover/active/disabled states. */
export class Button extends Container {
  private bg = new Graphics();
  private labelText: Text;
  private opts: Required<Omit<ButtonOptions, 'onClick'>> & { onClick?: () => void };
  private hovering = false;

  constructor(opts: ButtonOptions) {
    super();
    this.opts = {
      width: opts.width ?? 0,
      height: opts.height ?? 34,
      fontSize: opts.fontSize ?? 12,
      variant: opts.variant ?? 'secondary',
      active: opts.active ?? false,
      disabled: opts.disabled ?? false,
      label: opts.label,
      onClick: opts.onClick,
    };
    this.addChild(this.bg);
    this.labelText = new Text({
      text: opts.label,
      style: { ...buttonLabel, fontSize: this.opts.fontSize, fill: this.opts.variant === 'link' ? COLOR.cyanDim : COLOR.textBright },
    });
    this.labelText.anchor.set(0.5);
    this.addChild(this.labelText);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', () => { this.hovering = true; this.redraw(); });
    this.on('pointerout', () => { this.hovering = false; this.redraw(); });
    this.on('pointertap', () => { if (!this.opts.disabled && this.opts.onClick) this.opts.onClick(); });
    this.redraw();
  }

  setLabel(label: string) {
    this.opts.label = label;
    this.labelText.text = label;
    this.redraw();
  }

  setActive(active: boolean) {
    this.opts.active = active;
    this.redraw();
  }

  setDisabled(disabled: boolean) {
    this.opts.disabled = disabled;
    this.redraw();
  }

  private redraw() {
    const w = this.opts.width || this.labelText.width + 28;
    const h = this.opts.height;
    this.labelText.position.set(w / 2, h / 2);
    this.bg.clear();
    if (this.opts.variant === 'link') {
      this.eventMode = this.opts.disabled ? 'none' : 'static';
      this.cursor = this.opts.disabled ? 'default' : 'pointer';
      this.alpha = this.opts.disabled ? 0.35 : 1;
      return;
    }
    const v = VARIANT_STYLE[this.opts.variant];
    const bgColor = this.opts.active ? v.bgActive : (this.hovering && !this.opts.disabled ? v.bgHover : v.bg);
    const borderColor = this.opts.active ? v.borderActive : v.border;
    this.bg.roundRect(0, 0, w, h, 6)
      .fill({ color: bgColor })
      .stroke({ width: 1, color: borderColor, alpha: this.opts.disabled ? 0.4 : 1 });
    this.alpha = this.opts.disabled ? 0.4 : 1;
    this.eventMode = this.opts.disabled ? 'none' : 'static';
    this.cursor = this.opts.disabled ? 'default' : 'pointer';
  }

  get width2() { return this.opts.width || this.labelText.width + 28; }
  get height2() { return this.opts.height; }
}
