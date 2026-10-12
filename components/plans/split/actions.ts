import { archiveBucket, bucketArchiveReason, createBucket, createPlan, deletePlan, renamePlan, restoreBucket, saveSplitPlan, setActivePlan, setBucketKeptIn, setPlanSwitchTarget, updateBucket } from "@/lib/actions/plans";
import type { ActionResult } from "@/lib/actions/result";

type Lines = Array<{ bucketId: string; percentBp: number }>;
type Group = "spend" | "save" | "set_aside";

/** Every server action the Split plan screen calls; tests pass mocks. */
export type SplitActions = {
  savePlan: (planKey: string, lines: Lines) => Promise<ActionResult>;
  setKeptIn: (bucketId: string, accountId: string) => Promise<ActionResult>;
  setTarget: (targetMinor: number) => Promise<ActionResult>;
  createPlan: (input: { name: string; lines?: Lines; copyFrom?: string }) => Promise<ActionResult<{ key: string }>>;
  renamePlan: (planKey: string, name: string) => Promise<ActionResult>;
  deletePlan: (planKey: string) => Promise<ActionResult>;
  setActivePlan: (input: { mode: "manual"; planKey: string } | { mode: "auto"; from: string; to: string }) => Promise<ActionResult>;
  createBucket: (input: { name: string; group: Group; hue: string; keptIn?: string | null }) => Promise<ActionResult<{ id: string }>>;
  updateBucket: (input: { id: string; name: string; shortName: string; group: Group; hue: string }) => Promise<ActionResult>;
  archiveReason: (bucketId: string) => Promise<ActionResult<{ reason: string | null }>>;
  archiveBucket: (bucketId: string) => Promise<ActionResult>;
  restoreBucket: (bucketId: string) => Promise<ActionResult>;
};

export const defaultActions: SplitActions = {
  savePlan: saveSplitPlan,
  setKeptIn: setBucketKeptIn,
  setTarget: setPlanSwitchTarget,
  createPlan,
  renamePlan,
  deletePlan,
  setActivePlan,
  createBucket,
  updateBucket,
  archiveReason: bucketArchiveReason,
  archiveBucket,
  restoreBucket,
};
