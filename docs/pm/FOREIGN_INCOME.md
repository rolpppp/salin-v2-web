# AUD income into an AUD account (ticket 27, owner request Oct 12)

Owner: salary is paid in A$ and **lands in an AUD account**, converted to pesos later. When adding income they want to **pick PHP or AUD each time**. Today Add income lists only home-currency (PHP) accounts and the amount is always ₱. This is the first slice of ROADMAP Phase 2 "multi-currency" (D-21: store the real rate per income).

## Facts that shape the design
- `ledger_entries.amountMinor` is in the **account's** currency (no currency column). Mobile already works this way.
- Plans, buckets, allocations, safe to spend and goals are in the **home currency** (₱).
- A transfer is a `transfers` header + two ledger legs, each in its own account's currency, so a cross-currency transfer (A$ out, ₱ in) is representable and syncs to the phone unchanged.
- `income_meta` already has `sentMinor` / `sentCurrency`.

## Decisions (P-10)
1. **Currencies offered:** PHP and AUD only (owner's choice). Accounts in other currencies stay hidden in Add income.
2. **Add income:** "Landed in" lists live PHP and AUD accounts. The amount has a **PHP | AUD** switch, defaulting to the landed account's currency.
   - Amount currency = account currency → that's the ledger amount.
   - It differs → also ask for the account-currency amount (e.g. PHP account + A$ typed → "Pesos that landed"), as today's "Sent from AUD".
3. **Peso value of a foreign income.** An income in an AUD account needs its peso value to be split: "Worth in pesos" (₱) with a live "₱X per A$1" line, prefilled from **your last rate** (most recent stored rate) and editable. Stored on `income_meta` as `homeAmountMinor` (new column, web table) with `sentMinor` = A$ and `sentCurrency` = 'AUD'.
4. **Incomes logged on the phone into an AUD account** have no peso value. Money in shows them with **"Needs a peso value"** (like "Needs a job") and an inline "Worth in pesos" field (prefilled from the last rate); they can't be confirmed until it's set.
5. **The engine splits the peso value.** Everywhere an income's amount feeds the plan (waiting income, confirm, Today previews, Review "came in", tab badges, onboarding detection), use: the ledger amount when the account is in the home currency, else `income_meta.homeAmountMinor` (null = needs a value, never treated as pesos).
6. **Transfer checklist from an AUD account** shows "Convert A$X → send ₱Y to {account}", with A$X = ₱Y ÷ that cycle's rate for the income(s) that landed there (integer math, half up). Ticking asks for the A$ actually converted (prefilled) and records a real transfer: an A$ out-leg from the AUD account and a ₱ in-leg to the destination. Keep rows for buckets kept in the AUD account show "Keep A$X (≈ ₱Y)".
7. **Balances:** an AUD account's "should hold" is shown in A$ (converted at the latest rate) with the ₱ value beside it.
8. **Money is integer minor units in its own currency everywhere; rates are stored as integer ₱-centavos per A$1** (e.g. 4353 = ₱43.53), half-up rounding (BR G11). No floats.

## Out of scope (later)
Other currencies, daily FX rates (D-21), revaluing past incomes, AUD spending.
