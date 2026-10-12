# Plans v2: your own plans and buckets (ticket 26, owner request Oct 12)

The owner wants to: create **named plans**, build one **from scratch**, **choose the active plan**, and add **custom buckets**. Today the app is fixed to Plan A/B with an automatic switch at the Emergency target and 8 built-in buckets. This file is the contract between the SQL/engine work and the UI work. Change it only with the PM.

## Decisions (P-9)

1. **Plans.** Up to 10 live plans per user. Each has an immutable `key` (`A`, `B` for existing ones; new ones `p_` + 8 hex chars) and a `name` (1–40 chars, unique per user among live plans, case-insensitive). Existing plans keep their keys and get names "Plan A" / "Plan B" if they have none.
2. **Always valid in the database.** A stored plan always totals exactly 10000 bp over the live, non-planless, non-archived buckets. "From scratch" is a client draft (every bucket 0%) that is only created once it reaches 100%.
3. **Which plan splits paydays** is one setting with two modes:
   - **Automatic** (today's behaviour): use plan *from* until the Emergency bucket reaches the switch target, then plan *to*. The owner can pick which plans are *from* and *to* (defaults A → B). Target edited as today (`set_plan_switch_target`, = Emergency goal).
   - **Manual**: always use one chosen plan. The switch rule is kept but ignored while manual.
   Stored as an `allocation_rules` row `kind = 'active_plan'`, `params = {"mode":"manual","planKey":"…"}` or `{"mode":"auto"}`; no row = auto. Auto's from/to stay in the existing `switch_on_goal` params (`fromPlan`, `toPlan`).
4. **Future paydays only.** The active plan is evaluated at confirm time, as now. Confirmed allocations keep their `planKey`; history shows the plan's name by looking it up (soft-deleted plans keep their row, so the name still resolves).
5. **Deleting a plan** is a soft delete, refused when it is the manual active plan, either auto plan (from/to), or the last live plan. The error says what to change first.
6. **Custom buckets.** Create with name (1–40, unique among live buckets, case-insensitive), group (`spend` / `save` / `set_aside`), colour from the palette (`c1`…`c8`, new tokens; built-ins keep their hue), optional "kept in" account. A new bucket starts at 0% in every plan. Max 20 live plan buckets.
7. **Edit any bucket**: name, short name, group, colour, kept in. The engine finds Emergency/Rent/Living by rule ids and `hue` (`emergency`, `rent`, `living`), so renaming is safe; **changing the hue of a built-in is not allowed** (it is its identity).
8. **Archive a bucket** only when all hold, else a plain-language reason: not the Emergency bucket (rounding remainder and Plan B go there); 0% in every live plan; no category mapped to it; not an income source's "keep whole" bucket or in an own split; nothing left in it (left = 0). Restore puts it back at 0% everywhere.
9. **Review's "Move 1% from Fun to Living"** (D-18 said "both plans") now changes **every live plan** where the from-bucket has ≥ 1%; the confirmation names the plans.
10. Onboarding is unchanged (it still creates Plan A, optional Plan B, the built-in buckets). Mobile is unaffected (web-only tables).

## SQL contract (new migration; all SECURITY INVOKER, `assert_self`, RLS, soft deletes, bp only, raise `P0001` with a user-facing message on refusals, `22023` on bad input, `42501` on ownership)

| Function | Returns | Behaviour |
|---|---|---|
| `create_plan(p_name text, p_lines jsonb, p_copy_from text default null)` | `text` (new key) | `p_lines` = `[{"bucketId","percentBp"}]` totalling 10000; or `p_lines` null + `p_copy_from` = copy that plan's lines. |
| `rename_plan(p_plan_key text, p_name text)` | void | Unique name rule. |
| `delete_plan(p_plan_key text)` | void | Guards per decision 5. |
| `save_plan_lines(p_plan_key text, p_lines jsonb)` | (existing) | Must work for any live plan key. |
| `set_active_plan(p_mode text, p_plan_key text default null, p_from text default null, p_to text default null)` | void | `manual` needs `p_plan_key`; `auto` takes optional from/to (default current, else A/B); from ≠ to; all must be live plans. |
| `active_plan(p_user uuid default auth.uid())` | text | Manual → its key; else today's auto logic with configured from/to. |
| `plan_settings()` | jsonb | `{mode, activeKey, autoFrom, autoTo, targetMinor, emergencyBucketId, plans:[{key,name,totalBp,isActive}]}` for the UI. |
| `create_bucket(p_name text, p_group text, p_hue text default null, p_kept_in text default null)` | uuid | Decision 6. |
| `update_bucket(p_bucket uuid, p_name text, p_short_name text, p_group text, p_hue text)` | void | Decision 7. |
| `bucket_archive_reason(p_bucket uuid)` | text or null | Decision 8; null = can archive. |
| `archive_bucket(p_bucket uuid)` / `restore_bucket(p_bucket uuid)` | void | Archive raises the reason. |
| `nudge_plan_percent(...)` | (existing signature) | Decision 9. |

`allocation_rules.kind` check gains `'active_plan'`.

## Engine mirror (`lib/money`)

`PlanKey` becomes `string`; the context carries `plans: Record<string, PercentLine[]>` plus the active-plan setting (`{mode:'manual', planKey} | {mode:'auto', from, to}`) instead of `planA`/`planB`; `activePlan()` mirrors the SQL. Parity suites cover manual mode, custom from/to, a custom bucket, and >2 plans.

## UI (Plans → Split plan, plus labels)

- **Plan bar:** one chip per plan, the active one marked "Splitting your paydays"; **+ New plan** → "From scratch" (all 0%, total shown, Save disabled until 100%) or "Copy of {plan}"; rename; delete (shows the refusal reason).
- **Editor:** one plan at a time (bucket rows × that plan's %), stepper + typed %, footer total, coral when ≠ 100, Save only at 100. Optional "Compare with {plan}" column.
- **"Which plan splits your paydays"** card: radio **Automatic** (switch from [plan] to [plan] when Emergency reaches ₱[target], with "Now ₱X") / **Always use** [plan]. "Applies to paydays after the change."
- **Buckets:** **Add a bucket** (name, group, colour, kept in); per-row edit; archive with reason / restore from an "Archived" list.
- **Labels elsewhere:** Money in job "Split by {plan name}"; Today/Review Plan B progress lines only in auto mode, using the *to* plan's name; Review nudge confirmation names the plans.
