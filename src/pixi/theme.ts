import type { TextStyleOptions } from 'pixi.js';

export const PLAYER_COLOR: Record<string, number> = {
  albion: 0xb74c32,
  helios: 0x3f79a6,
  meridian: 0x3d8a68,
  valhalla: 0xb88b3d,
};

export const COLOR = {
  background: 0x081014,
  panelBg: 0x0d1719,
  panelBgAlt: 0x101a1c,
  panelBorder: 0x5d4b31,
  rowBorder: 0x3a3327,
  gold: 0xc9a86a,
  goldBright: 0xd8b36a,
  goldDim: 0x8d7a5b,
  text: 0xd7c8aa,
  textDim: 0x8f927f,
  textBright: 0xf1dfb0,
  cyan: 0x55d6dd,
  cyanDim: 0x6ec0c6,
  warning: 0xe0a24f,
  error: 0xff8a80,
  ok: 0x5fd18a,
  buttonBg: 0x3a2f1c,
  buttonBgHover: 0x5f401e,
  buttonBorder: 0x8e7b58,
} as const;

export const FONT_SERIF = 'Georgia, serif';
export const FONT_SANS = 'Arial, sans-serif';

export const heading: TextStyleOptions = {
  fontFamily: FONT_SERIF,
  fontSize: 13,
  fontWeight: '700',
  fill: COLOR.goldBright,
  letterSpacing: 2,
};

export const subheading: TextStyleOptions = {
  fontFamily: FONT_SERIF,
  fontSize: 11,
  fontWeight: '700',
  fill: COLOR.gold,
  letterSpacing: 1,
};

export const body: TextStyleOptions = {
  fontFamily: FONT_SANS,
  fontSize: 12,
  fill: COLOR.text,
};

export const hint: TextStyleOptions = {
  fontFamily: FONT_SANS,
  fontSize: 11,
  fill: COLOR.textDim,
  wordWrap: true,
};

export const buttonLabel: TextStyleOptions = {
  fontFamily: FONT_SANS,
  fontSize: 12,
  fontWeight: '700',
  fill: COLOR.textBright,
  letterSpacing: 1,
};
