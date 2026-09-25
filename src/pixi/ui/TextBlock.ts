import { Text, type TextStyleOptions } from 'pixi.js';
import { hint } from '../theme';

export interface TextBlockOptions {
  text: string;
  width?: number;
  style?: TextStyleOptions;
}

/** A `Text` preconfigured with word-wrap, for hints/errors/descriptions whose content varies in length. */
export class TextBlock extends Text {
  constructor(opts: TextBlockOptions) {
    super({
      text: opts.text,
      style: { ...hint, wordWrapWidth: opts.width ?? 260, ...opts.style },
    });
  }

  setWidth(width: number) {
    this.style.wordWrapWidth = width;
  }
}
