import { assertMinor, floorDiv, mulDivRound } from "./core";
import type { Bp, Minor } from "./core";

export const MINUS = "−"; // U+2212, never a hyphen

function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtCurrency(symbol: string, minor: Minor): string {
  assertMinor(minor);
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const pesos = floorDiv(abs, 100);
  const cents = abs - pesos * 100;
  return `${neg ? MINUS : ""}${symbol}${group(pesos)}.${String(cents).padStart(2, "0")}`;
}

/** `1732900` -> `₱17,329.00`; `-8697` -> `−₱86.97`. */
export function formatPeso(minor: Minor): string {
  return fmtCurrency("₱", minor);
}

/** AUD: `40000` -> `A$400.00`. */
export function formatAud(minor: Minor): string {
  return fmtCurrency("A$", minor);
}

/**
 * Whole pesos for per-day figures, FLOORED toward negative infinity so a figure never overstates
 * what is safe (AGENTS §3.3): `3454` -> `₱34`, `99` -> `₱0`, `-8697` -> `−₱87`. Input is centavos.
 */
export function formatPesoWhole(minor: Minor): string {
  assertMinor(minor);
  const pesos = floorDiv(minor, 100);
  return `${pesos < 0 ? MINUS : ""}\u20B1${group(Math.abs(pesos))}`;
}

/**
 * Basis points as a percent string. `2581` with 1 decimal -> `25.8%`; whole -> `26%`.
 * Rounds half up.
 */
export function formatPercent(bp: Bp, decimals: 0 | 1 | 2 = 0): string {
  assertMinor(bp, "bp");
  const scale = decimals === 0 ? 100 : decimals === 1 ? 10 : 1;
  const units = mulDivRound(Math.abs(bp), 1, scale);
  const div = decimals === 0 ? 1 : decimals === 1 ? 10 : 100;
  const whole = floorDiv(units, div);
  const frac = units - whole * div;
  const body = decimals === 0 ? String(whole) : `${whole}.${String(frac).padStart(decimals, "0")}`;
  return `${bp < 0 && units !== 0 ? MINUS : ""}${body}%`;
}

/** Whole percent from the UI edge: `25` -> `25%`. */
export function formatWholePercent(pct: number): string {
  return formatPercent(pct * 100, 0);
}
