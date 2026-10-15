"use server";

import { receiveMoney, type ReceiveMoneyInput, setKeepBucket, setNoSpend, setSpendUntil, setViewMode } from "./simple";
import type { ActionResult } from "./result";

/**
 * Object-argument entry points for the Simple screens. They are server actions themselves (this file is "use server"),
 * so the page can hand them to client components as props; plain arrow functions could not cross that boundary.
 */
export async function receiveMoneyForm(input: Omit<ReceiveMoneyInput, "name">): Promise<ActionResult<{ entryId: string }>> {
  return receiveMoney({ ...input, name: null });
}
export async function setNoSpendForm(input: { day: string; on: boolean }): Promise<ActionResult> {
  return setNoSpend(input.day, input.on);
}
export async function setSpendUntilForm(input: { day: string | null }): Promise<ActionResult> {
  return setSpendUntil(input.day);
}
export async function setKeepBucketForm(input: { bucketId: string }): Promise<ActionResult> {
  return setKeepBucket(input.bucketId);
}
export async function setViewModeForm(input: { mode: "simple" | "full" }): Promise<ActionResult> {
  return setViewMode(input.mode);
}
