/**
 * Official Manim Community / 3Blue1Brown Color Palette & Mathematical Rate Functions
 * Notice: Pure flat hex colors rendered on #000000 with ZERO neon shadowBlur.
 */

export const MANIM_PALETTE = {
  BLACK: '#000000',
  WHITE: '#ECECEC',
  PURE_WHITE: '#FFFFFF',
  GREY_A: '#DDDDDD',
  GREY_B: '#BBBBBB',
  GREY_C: '#888888',
  GREY_D: '#444444',
  GREY_E: '#222222',

  // Signature 3Blue1Brown Blues & Teals
  BLUE_A: '#C7E9F1',
  BLUE_B: '#9CDCEB',
  BLUE_C: '#58C4DD',
  BLUE_D: '#29ABCA',
  BLUE_E: '#1C758A',

  TEAL_A: '#ACEAD7',
  TEAL_B: '#76DDC0',
  TEAL_C: '#5CD0B3',
  TEAL_D: '#55C1A7',
  TEAL_E: '#49A88F',

  // Signature Manim Yellows, Reds, Greens, Maroons
  YELLOW_A: '#FFF1B6',
  YELLOW_B: '#FFEA94',
  YELLOW_C: '#FFFF00',
  YELLOW_D: '#F4D345',
  YELLOW_E: '#E8C11C',

  RED_A: '#F7A1A3',
  RED_B: '#FF8080',
  RED_C: '#FC6255',
  RED_D: '#E65A4C',
  RED_E: '#CF5044',

  GREEN_A: '#C9E2AE',
  GREEN_B: '#A6CF8C',
  GREEN_C: '#83C167',
  GREEN_D: '#77B05D',
  GREEN_E: '#699C52',

  MAROON_C: '#C55F73',
  PURPLE_C: '#9A72AC',
} as const;

export function clamp(val: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Manim's default `smooth` rate function (C2-continuous 5th-degree polynomial)
 * Gives 3Blue1Brown camera movements and transforms their signature deliberate deceleration.
 */
export function manimSmooth(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * x * (10 - 15 * x + 6 * x * x);
}

/**
 * Manim's `there_and_back` rate function used by Indicate() and ShowPassingFlash()
 */
export function thereAndBack(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? manimSmooth(2 * x) : manimSmooth(2 * (1 - x));
}

/**
 * Linear interpolation
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Smooth step within a time window [start, end]
 */
export function windowProgress(time: number, start: number, end: number, smooth = true): number {
  if (time <= start) return 0;
  if (time >= end) return 1;
  const raw = (time - start) / (end - start);
  return smooth ? manimSmooth(raw) : raw;
}

/**
 * Hex color interpolation (RGB linear mix for Manim Transform / edge re-coloring)
 */
export function lerpColor(hexA: string, hexB: string, t: number): string {
  const u = clamp(t, 0, 1);
  const a = parseInt(hexA.replace('#', ''), 16);
  const b = parseInt(hexB.replace('#', ''), 16);
  const rA = (a >> 16) & 255;
  const gA = (a >> 8) & 255;
  const bA = a & 255;
  const rB = (b >> 16) & 255;
  const gB = (b >> 8) & 255;
  const bB = b & 255;
  const r = Math.round(lerp(rA, rB, u));
  const g = Math.round(lerp(gA, gB, u));
  const bl = Math.round(lerp(bA, bB, u));
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}
