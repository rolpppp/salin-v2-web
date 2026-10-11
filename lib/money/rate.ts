import { assertSafeInt, mulDivRound } from "./core";
import type { Minor } from "./core";

/**
 * Rate received per A$1, in centavos (so `4353` is ₱43.53), half up, integer math (G11).
 * rate = round_half_up(pesoMinor * 100 / audMinor).
 * Both amounts must be > 0.
 */
export function ratePerAud(pesoMinor: Minor, audMinor: Minor): Minor {
  assertSafeInt(pesoMinor, "pesoMinor");
  assertSafeInt(audMinor, "audMinor");
  if (pesoMinor <= 0 || audMinor <= 0) throw new RangeError("amounts must be > 0");
  return mulDivRound(pesoMinor, 100, audMinor);
}
