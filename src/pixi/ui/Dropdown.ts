import { Container, Graphics, Text } from 'pixi.js';
import { COLOR, body } from '../theme';

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownOptions {
  width?: number;
  height?: number;
  placeholder?: string;
  options: DropdownOption[];
  /** Top-level container the open option list is appended to, so it draws above every other view (Pixi has no CSS-style stacking context). */
  overlayLayer: Container;
  onChange?: (value: string) => void;
}

/** A button that shows a scrollable option list in `overlayLayer` when clicked — replaces an HTML `<select>`. */
export class Dropdown extends Container {
  private bg = new Graphics();
  private labelText: Text;
  private w: number;
  private h: number;
  private options: DropdownOption[];
  private overlayLayer: Container;
  private onChange?: (value: string) => void;
  private listLayer: Container | null = null;
  private value = '';
  private placeholder: string;

  constructor(opts: DropdownOptions) {
    super();
    this.w = opts.width ?? 200;
    this.h = opts.height ?? 30;
    this.options = opts.options;
    this.overlayLayer = opts.overlayLayer;
    this.onChange = opts.onChange;
    this.placeholder = opts.placeholder ?? 'Choisir...';

    this.addChild(this.bg);
    this.labelText = new Text({ text: this.placeholder, style: { ...body, fontSize: 11, fill: COLOR.textDim } });
    this.labelText.position.set(8, this.h / 2);
    this.labelText.anchor.set(0, 0.5);
    this.addChild(this.labelText);

    const arrow = new Text({ text: '▾', style: { ...body, fontSize: 11 } });
    arrow.anchor.set(1, 0.5);
    arrow.position.set(this.w - 8, this.h / 2);
    this.addChild(arrow);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', (e) => { e.stopPropagation(); this.toggleList(); });
    this.redraw();
  }

  setOptions(options: DropdownOption[]) {
    this.options = options;
    if (!options.some((o) => o.value === this.value)) this.setValue('');
  }

  setValue(value: string) {
    this.value = value;
    const opt = this.options.find((o) => o.value === value);
    this.labelText.text = opt ? opt.label : this.placeholder;
    this.labelText.style.fill = opt ? COLOR.text : COLOR.textDim;
  }

  private redraw() {
    this.bg.clear();
    this.bg.roundRect(0, 0, this.w, this.h, 5)
      .fill({ color: COLOR.panelBg })
      .stroke({ width: 1, color: COLOR.rowBorder });
  }

  private toggleList() {
    if (this.listLayer) { this.closeList(); return; }
    this.openList();
  }

  private openList() {
    const layer = new Container();
    const global = this.getGlobalPosition();
    const local = this.overlayLayer.toLocal(global);
    layer.position.set(local.x, local.y + this.h + 2);

    const rowH = 28;
    const listBg = new Graphics();
    listBg.roundRect(0, 0, this.w, Math.max(rowH, this.options.length * rowH), 6)
      .fill({ color: COLOR.panelBgAlt, alpha: 0.98 })
      .stroke({ width: 1, color: COLOR.gold });
    layer.addChild(listBg);

    this.options.forEach((opt, i) => {
      const row = new Container();
      row.position.set(0, i * rowH);
      row.eventMode = 'static';
      row.cursor = 'pointer';
      const rowBg = new Graphics();
      rowBg.rect(0, 0, this.w, rowH).fill({ color: COLOR.panelBgAlt, alpha: 0.01 });
      row.addChild(rowBg);
      row.on('pointerover', () => rowBg.clear().rect(0, 0, this.w, rowH).fill({ color: COLOR.buttonBg }));
      row.on('pointerout', () => rowBg.clear().rect(0, 0, this.w, rowH).fill({ color: COLOR.panelBgAlt, alpha: 0.01 }));
      const rowLabel = new Text({ text: opt.label, style: { ...body, fontSize: 11 } });
      rowLabel.position.set(8, rowH / 2);
      rowLabel.anchor.set(0, 0.5);
      row.addChild(rowLabel);
      row.on('pointertap', (e) => {
        e.stopPropagation();
        this.setValue(opt.value);
        this.onChange?.(opt.value);
        this.closeList();
      });
      layer.addChild(row);
    });

    // Full-screen invisible catcher so a click anywhere outside the list closes it.
    const catcher = new Graphics();
    catcher.rect(-100000, -100000, 200000, 200000).fill({ color: 0x000000, alpha: 0 });
    catcher.eventMode = 'static';
    catcher.zIndex = -1;
    catcher.on('pointertap', () => this.closeList());
    layer.addChildAt(catcher, 0);

    this.overlayLayer.addChild(layer);
    this.listLayer = layer;
  }

  private closeList() {
    if (!this.listLayer) return;
    this.overlayLayer.removeChild(this.listLayer);
    this.listLayer.destroy({ children: true });
    this.listLayer = null;
  }

  destroy(options?: Parameters<Container['destroy']>[0]) {
    this.closeList();
    super.destroy(options);
  }
}
