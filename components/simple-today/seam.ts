/**
 * Where the Simple view meets the server: the loaders and server actions the screens are given as props.
 * Components never import server modules; the page and layout import this file and pass the results down.
 */
import { tickTransferAction } from "@/lib/actions/transfers";
import { receiveMoneyForm, setKeepBucketForm, setNoSpendForm, setSpendUntilForm, setViewModeForm } from "@/lib/actions/simple-form";
import { getSimpleToday, getViewMode as readViewMode } from "@/lib/data/simple-today";
import { createClient } from "@/lib/supabase/server";
import type { SimpleActions } from "./types";

export type { SimpleTodayModel, ViewMode } from "@/lib/data/simple-today";

export async function loadSimpleToday(ctx: { userId: string; nowMs: number; timeZone: string; todayIso: string }) {
  const client = await createClient();
  if (!client) return null;
  return getSimpleToday(client, { nowMs: ctx.nowMs, timeZone: ctx.timeZone });
}

export async function getViewMode(userId: string) {
  void userId;
  const client = await createClient();
  if (!client) return "full" as const;
  try {
    return await readViewMode(client);
  } catch {
    return "full" as const;
  }
}

export const simpleActions: SimpleActions = {
  receiveMoney: receiveMoneyForm,
  setNoSpend: setNoSpendForm,
  setSpendUntil: setSpendUntilForm,
  setKeepBucket: setKeepBucketForm,
  setViewMode: setViewModeForm,
  tickTransfer: tickTransferAction,
};
