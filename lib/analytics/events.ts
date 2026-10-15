/**
 * Every analytics event and exactly its allowed properties (ROADMAP.md §4).
 * Never add amounts, names or account details to a property.
 */
type Path = "web" | "app";
type Via = "web" | "mobile";

export type EventMap = {
  web_signed_in: { first_time: boolean };
  plan_setup_completed: { preset: string; buckets_count: number };
  income_added: { source_kind: string; via: Via };
  income_confirmed: { source_kind: string; job: string; count: number; hours_since_landed: number };
  transfer_ticked: { is_partial: boolean };
  money_in_completed: { incomes_count: number };
  cover_used: { from_bucket: string; to_bucket: string };
  review_opened: { week_start: string };
  week_closed: { open_items_count: number };
  plan_edited: { field: "percent" | "kept_in" | "rule" | "target" | "plan" | "active_plan" | "bucket" };
  goal_milestone_passed: { goal_kind: string; milestone: 25 | 50 | 75 | 100 };
  onboarding_started: { path: Path; auto_detected: boolean };
  onboarding_step_completed: { path: Path; step: string; seconds_on_step: number };
  onboarding_plan_edited: { preset: string; buckets_changed: number };
  onboarding_skipped_plan: { path: Path };
  onboarding_completed: {
    path: Path;
    plan_mode: string;
    first_pay: "confirmed" | "later";
    transfers_ticked: number;
    minutes: number;
  };
  sync_prompt_shown: { seconds_waited: number };
  sync_connected: { seconds_waited: number };
  spending_logged: { via: Via; bucket_group: string };
  money_received: { amount_band: string; accounts_count: number };
  no_spend_marked: { marked: boolean };
  streak_milestone: { days: 3 | 7 | 14 | 30 };
  view_mode_changed: { mode: "simple" | "full" };
  notify_prefs_changed: { keys: string };
  notice_opened: { kind: string; via: "inbox" | "browser" };
};

export type EventName = keyof EventMap;
