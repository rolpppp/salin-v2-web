import type { Cadence } from "@/lib/money";
import type { DraftBucket, OnboardingDraft } from "./draft";

export type Frequency = NonNullable<OnboardingDraft["income"]["frequency"]>;

/** Choice labels for "How often?". */
export const FREQUENCY_OPTIONS: ReadonlyArray<{ value: Frequency; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "twice", label: "Twice a month" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "weekly", label: "Weekly" },
  { value: "varies", label: "It varies" },
];

/** The slip's "How often" line. */
export const FREQUENCY_SLIP: Record<Frequency, string> = {
  monthly: "Monthly",
  twice: "Twice a month",
  biweekly: "Every 2 weeks",
  weekly: "Weekly",
  varies: "No fixed schedule",
};

/** Detected cadence (BR §12.4.2) as shown on the Income step. */
export const CADENCE_LABEL: Record<Cadence, string> = {
  once: "Seen once",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  twice_monthly: "Twice a month",
  monthly: "Monthly",
  varies: "It varies",
};

/** Detected cadence -> the draft's pay frequency. One entry or irregular gaps count as "varies". */
export function frequencyFromCadence(c: Cadence): Frequency {
  switch (c) {
    case "weekly":
      return "weekly";
    case "biweekly":
      return "biweekly";
    case "twice_monthly":
      return "twice";
    case "monthly":
      return "monthly";
    default:
      return "varies";
  }
}

export const PRIORITY_SHORT: Record<NonNullable<OnboardingDraft["priority"]>, string> = {
  safety: "Safety net first",
  goal: "Saving for something",
  grow: "Growing it for later",
  control: "Spending in check",
};

export const BILL_KIND_LABEL: Record<OnboardingDraft["billKinds"][number], string> = {
  rent: "Rent",
  tuition: "Tuition",
  utilities: "Utilities",
  internet: "Internet",
  loan: "Loan",
};

const SHORT: Record<DraftBucket, string> = {
  living: "Living",
  rent: "Bills",
  fun: "Fun",
  emergency: "Emergency",
  invest: "Investments",
  sinking: "Sinking funds",
  tax: "Tax",
  buffer: "Buffer",
  scholarship: "Scholarship",
};

/** Bucket name for onboarding copy: Living becomes Spending when the plan was skipped; Bills takes the one bill kind picked. */
export function bucketLabel(bucket: DraftBucket, draft: Pick<OnboardingDraft, "skipped" | "billKinds">): string {
  if (bucket === "living" && draft.skipped) return "Spending";
  if (bucket === "rent" && draft.billKinds.length === 1) return BILL_KIND_LABEL[draft.billKinds[0] as keyof typeof BILL_KIND_LABEL];
  return SHORT[bucket];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-10-12` -> `Mon Oct 12 2026` (the slip's date line). */
export function slipDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const wd = WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
  return `${wd} ${MONTHS[Number(m[2]) - 1]} ${Number(m[3])} ${m[1]}`;
}
