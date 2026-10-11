---
name: Salin Web
description: Know what's left. The planning half of Salin, a fresh ribbon shelf that turns each payday and each week into one loop that visibly closes.
colors:
  bg: "#f5f8f7"
  surface: "#ffffff"
  surface-2: "#eef3f2"
  surface-3: "#e4ecea"
  ink: "#1c2a2e"
  ink-2: "#4f6166"
  ink-3: "#5f6f74"
  line: "rgba(28, 42, 46, 0.08)"
  line-2: "rgba(28, 42, 46, 0.15)"
  accent: "#0b7a73"
  accent-hover: "#08665f"
  accent-soft: "#ddf2ef"
  accent-ink: "#ffffff"
  good: "#186e43"
  good-fill: "#3cb97a"
  good-soft: "#e1f5ea"
  done: "#1f7a4c"
  warm: "#b0452a"
  warm-fill: "#f08a6c"
  warm-soft: "#fdebe5"
  sun: "#f6c445"
  sun-soft: "#fff5d6"
  sun-ink: "#6e5100"
  b-living: "#f08a6c"
  b-fun: "#ec7fae"
  b-emergency: "#3cb97a"
  b-invest: "#4fa3e3"
  b-sinking: "#2eb3a8"
  b-tax: "#8796ab"
  b-buffer: "#a39a8b"
  b-rent: "#c2b08f"
  b-dost: "#a497b8"
  dark-bg: "#10181a"
  dark-surface: "#172225"
  dark-surface-2: "#1f2c30"
  dark-surface-3: "#27363a"
  dark-ink: "#e5efee"
  dark-ink-2: "#a9bbbe"
  dark-ink-3: "#8fa2a5"
  dark-line: "rgba(229, 239, 238, 0.08)"
  dark-line-2: "rgba(229, 239, 238, 0.16)"
  dark-accent: "#4fd1c5"
  dark-accent-hover: "#6fdcd2"
  dark-accent-strong: "#7fe3d9"
  dark-accent-soft: "#143a37"
  dark-accent-ink: "#06302c"
  dark-good: "#6fdb9f"
  dark-good-soft: "#15342a"
  dark-done-ink: "#0d3b24"
  dark-warm: "#ff9f85"
  dark-warm-soft: "#3a2420"
  dark-sun-soft: "#3a3016"
  dark-sun-ink: "#f8d678"
typography:
  display:
    fontFamily: "Public Sans, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "52px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.035em"
    fontFeature: "\"tnum\" 1"
  headline:
    fontFamily: "Public Sans, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title-lg:
    fontFamily: "Public Sans, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Public Sans, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  amount:
    fontFamily: "Public Sans, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\" 1"
  body:
    fontFamily: "Public Sans, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: "Public Sans, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Public Sans, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "13.5px"
    fontWeight: 650
    lineHeight: 1.2
  button:
    fontFamily: "Public Sans, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
    lineHeight: 1
  micro:
    fontFamily: "Public Sans, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
  slip:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.65
    letterSpacing: "0.02em"
    fontFeature: "\"tnum\" 1"
  stamp:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.14em"
rounded:
  bar: "6px"
  box: "8px"
  field: "10px"
  control: "12px"
  panel: "14px"
  card-mobile: "16px"
  card: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  panel: "14px"
  card-mobile: "18px"
  section: "20px"
  card: "24px"
  gutter: "28px"
  gutter-mobile: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 18px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-ink}"
  button-soft:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 18px"
  button-soft-hover:
    backgroundColor: "{colors.surface-3}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.accent-hover}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  button-quiet-hover:
    backgroundColor: "{colors.accent-soft}"
  button-warm:
    backgroundColor: "{colors.warm-soft}"
    textColor: "{colors.warm}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 18px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "9px 14px"
  tab-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  tab-rail:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.pill}"
    padding: "4px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  next-step-card:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  peak-card:
    backgroundColor: "{colors.good-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  flag-needs:
    backgroundColor: "{colors.warm-soft}"
    textColor: "{colors.warm}"
    rounded: "{rounded.panel}"
    padding: "12px 12px 12px 16px"
  tag-needs:
    backgroundColor: "{colors.warm-soft}"
    textColor: "{colors.warm}"
    rounded: "{rounded.field}"
    padding: "7px 6px"
  milestone-pill:
    backgroundColor: "{colors.sun-soft}"
    textColor: "{colors.sun-ink}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  chip-plan:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-hover}"
    rounded: "{rounded.pill}"
    padding: "7px 11px"
  sample-pill:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-3}"
    typography: "{typography.micro}"
    rounded: "{rounded.pill}"
    padding: "3px 7px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 11px"
  move-row:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  move-row-done:
    backgroundColor: "{colors.good-soft}"
  goal-bar:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.bar}"
    height: "12px"
  receipt:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.slip}"
    padding: "26px 24px 32px"
---

# Design System: Salin Web

## Overview

**Creative North Star: "The Soft Ribbon Shelf"**

Salin Web is a fresh, low-glare room where money hangs in plain sight. Every bucket is a soft colored ribbon hanging from a shared rail; its length is the money left, drawn to one scale. Buckets are grouped into three chunks (Spend, Save & grow, Set aside) so the eye reads three families, not eight numbers. The system is warm and calm by default: mint-tinted off-white ground, white cards lifted by soft shadows instead of boxed by hairlines, deep teal-charcoal ink, and a single teal from the Salin wallet logo for action and progress.

The page always offers one answer and one next step. Emphasis and motion are spent only on real progress: money landing in buckets, goals passing milestones, a week closing. Receipts stay as the brand's paper object (split slip, week slip, drawer ledger lines) with a torn zigzag edge and IBM Plex Mono; everything else speaks Public Sans, including large amounts in tabular figures. Density is relaxed: generous card padding (24px), 20px gaps, sentence-case labels.

The world refuses the cold ledger dashboard (hairline grids, monospaced money everywhere, carbon ink) and the gamified streak app (badges, streak counters, guilt colors). Rewards are honest and grounded in progress the user actually made.

**Key Characteristics:**
- Mint-tinted light ground and composed teal-charcoal dark theme, both first-class.
- Buckets as to-scale ribbons on a rail, colored by hue family.
- Soft shadow lift, no boxed hairline cards.
- One teal action color; coral for "needs", never red; sunny yellow only for celebration.
- Public Sans everywhere; Plex Mono only on paper objects.
- A week modeled as an open loop that visibly closes, with one next step at a time.

## Colors

A fresh, bright, low-glare palette: neutral ground tinted toward mint, one teal voice, and eight bucket hues sorted into three temperature families.

### Primary
- **Salin Wallet Teal** (#0b7a73): the only action color. Primary buttons, selected radio and checkbox fills, the week loop bar, the payday pace marker, focus rings (2.5px outline, 2px offset), plain goal fills. Hover deepens to **Deep Lagoon** (#08665f), which also carries teal text on soft teal (quiet buttons, chips, links). In dark it lifts to **Glass Teal** (#4fd1c5) with dark ink on it (#06302c).
- **Sea Glass Wash** (#ddf2ef): the Next step card ground, selected option boxes, the avatar disc, quiet-button hover. Dark: #143a37.

### Secondary
- **Fern Green** (#186e43 text, #3cb97a fill, #e1f5ea wash): landed and done. Peak cards, finished transfer rows, hit milestone ticks, the main Emergency goal fill, "Put away" totals, plan totals that add to 100%. **Done Moss** (#1f7a4c) is the filled-check ground with a white check (5.3:1).
- **Coral Needs** (#b0452a text, #f08a6c fill, #fdebe5 wash): needs attention. "Needs PHP x" tags under an overdrawn ribbon, the attention flag, the tab dot for a pending ritual, plan totals that miss 100%. Dark: #ff9f85 on #3a2420.

### Tertiary
- **Payday Sun** (#f6c445 fill, #fff5d6 wash, #6e5100 text): celebration only. The "Passed 25% today" milestone pill and the star check on a peak card's final line. Dark wash #3a3016 with #f8d678 text.

### Bucket hue families
- **Warm, Spend:** Living coral (#f08a6c), Fun pink (#ec7fae).
- **Cool, Save & grow:** Emergency green (#3cb97a), Invest sky (#4fa3e3), Sinking teal (#2eb3a8).
- **Low-chroma neutral, Set aside:** Tax slate (#8796ab), Buffer stone (#a39a8b), Rent sand (#c2b08f), Scholarship mauve gray (#a497b8).

A ribbon body is its hue mixed into the surface (30% light, 42% dark, +14% on hover) under a solid 4px top edge of the full hue. Bucket hues also appear as 8px name dots, receipt line dots, split bars and the completion burst.

### Neutral
- **Mint Paper** (#f5f8f7): page ground; never pure white glare.
- **White Card** (#ffffff): cards, drawer, receipt, selected tab.
- **Quiet Fill** (#eef3f2) and **Rail Fill** (#e4ecea): rails, inset panels, soft buttons, empty bar tracks; the shelf rail itself.
- **Teal Charcoal Ink** (#1c2a2e, 13.8:1 on ground), **Slate Ink** (#4f6166) for secondary copy, **Mist Ink** (#5f6f74, 4.9:1) for micro labels and the foot note.
- **Hairlines** (8% and 15% ink): table rows, the shelf footer divider, dotted leaders, dashed slip rules, unchecked control strokes.
- **Dark theme:** ground #10181a, surfaces #172225 / #1f2c30 / #27363a, ink #e5efee / #a9bbbe / #8fa2a5.

### Named Rules
**The One Teal Rule.** Teal means "do this" or "this is moving". It is the only fill on a primary action, and there is only one primary action in any card.

**The Coral Not Red Rule.** Attention is coral on a coral wash ("Needs PHP 86.97"), written as what the bucket needs, never "over budget" in red. No red exists in the system.

**The Earned Sunshine Rule.** Yellow appears only on a real milestone or a closed loop. It is never a bucket hue, a status, a warning or decoration.

**The Hue Family Rule.** Spend buckets are warm, Save & grow buckets are cool, Set aside buckets are low-chroma neutrals. A new bucket joins the family of its group; temperature carries meaning before the label is read.

## Typography

**Display Font:** Public Sans (with Segoe UI, system-ui, -apple-system, sans-serif)
**Body Font:** Public Sans
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, SFMono-Regular, Menlo), paper objects only

**Character:** One friendly, civic grotesque carries words and money alike; large amounts get tabular figures and tight tracking for warmth without a ledger feel. Plex Mono is the voice of printed paper: receipts, the drawer's in/out lines, rotated stamps.

### Hierarchy
- **Display** (700, 52px, 1.05, -0.035em, tabular): the Safe to spend figure; the currency sign drops to 30px/600 in Slate Ink. 44px under 720px. The drawer balance uses the same voice at 36px.
- **Headline** (700, 30px, 1.15, -0.015em): the greeting and each view's H1. 25px under 720px.
- **Title Large** (700, 23-24px, 1.2-1.25, -0.02em): the Next step heading (max 30ch) and peak headings ("Payday done.", "Week closed. Monday starts fresh."). 20px under 720px. Drawer title 22px.
- **Title** (650, 17px, 1.3): card and step headings; the shelf heading at 19px; goal names at 16px.
- **Amount** (650, 18px, tabular, -0.02em): bucket amounts on the shelf (15.5px under 720px); income amounts at 24px/700.
- **Body** (400, 15px, 1.55): default copy; supporting paragraphs cap at 54-62ch.
- **Body small** (400, 13.5px): captions, goal subs, pace captions, loop steps, hints.
- **Label** (650, 13.5px, 1.2): card labels ("Safe to spend"), group names, bucket names; tabs and buttons at 600, 14-14.5px.
- **Micro** (600, 11px): weekday pace letters, milestone tick labels, the Sample pill.
- **Slip** (Plex Mono 500, 12.5px, 1.65, 0.02em, uppercase, tabular): receipt and drawer ledger lines; slip title 700/15px.
- **Stamp** (Plex Mono 700, 11-15px, 0.1-0.14em, uppercase): rotated SENT / SPLIT / WEEK CLOSED stamps.

### Named Rules
**The One Family Rule.** Public Sans sets every word and every on-screen amount. Money in cards uses tabular figures (`font-variant-numeric: tabular-nums`), not a monospace face.

**The Paper Speaks Mono Rule.** IBM Plex Mono appears only on paper objects: the split slip, the week slip, drawer ledger lines and stamps. If it is not paper, it is not mono.

**The Sentence Case Rule.** Labels, tabs, buttons and headings are sentence case. Uppercase belongs to printed slips and stamps.

## Layout

A centered column, max 1280px, with 28px side gutters (16px on phones) and 20px top / 64px bottom padding. A sticky 68px top bar holds the wordmark, a pill tab rail (Today, Money in, Review, Plans) with coral or green status dots, the date, theme switch and avatar; it sits on 88% ground with a 12px saturated blur.

- **Today:** greeting row, then a 5fr / 7fr row of Safe to spend beside Next step, then the full-width shelf card, then three goal cards. 20px gaps throughout.
- **Shelf:** three groups in a 2fr / 3fr / 3fr grid (22px gap); each group is equal columns of bucket slots on one continuous rail. Ribbon height is `--shelf-h` (260px, 140px on phones) times the share of a common scale, which grows in PHP 2,000 steps so nothing clips.
- **Money in:** steps column (income queue, then transfers) beside a sticky 380px receipt column (28px gap, sticks at 92px).
- **Review:** a 360px slip column beside the review cards (28px gap).
- **Plans:** single column; secondary pairs in a two-up grid.

### Responsive breakpoints
- **1100px:** every multi-column row stacks to one column. The shelf groups stack (18px gap), goals stack, the receipt becomes static (max 440px) and Money in reorders to step one, receipt, step two so the slip sits between choosing and moving.
- **860px:** two-up Plans grids stack.
- **720px:** phone layout. Gutters 16px, cards 18px padding with 16px radius, shelf height 140px, the tab rail wraps to its own full-width row with equal tabs, the date hides, type steps down (H1 25px, display 44px, next-step heading 20px), option pairs stack, transfer stamps move under the label, and the plan table drops its second and fifth columns in favor of an inline sub-line.

## Elevation & Depth

Depth is soft lift over tonal ground. Cards are white on Mint Paper with a two-layer ambient shadow; nothing is outlined. Tinted cards that carry meaning (Next step on Sea Glass, peaks on Fern wash) drop their shadow entirely: color, not height, marks them. Inside cards, depth is tonal (Quiet Fill panels, a 70% surface wash for the week loop) rather than nested shadows.

### Shadow Vocabulary
- **Rest lift** (`box-shadow: 0 1px 2px rgba(20,45,48,0.05), 0 4px 14px rgba(20,45,48,0.06)`): cards, the selected tab, icon buttons, the review stepper pills, delta chips on ribbons.
- **Overlay lift** (`box-shadow: 0 2px 6px rgba(20,45,48,0.06), 0 14px 32px rgba(20,45,48,0.10)`): the bucket drawer.
- **Teal glow** (`box-shadow: 0 1px 2px rgba(11,122,115,0.25), 0 6px 16px rgba(11,122,115,0.22)`): primary buttons only.
- **Paper drop** (`filter: drop-shadow(0 10px 18px rgba(20,45,48,0.10))`): the receipt, so the zigzag edge casts a true silhouette.
- **Dark theme:** rest and overlay lifts switch to black at 25-35% so cards still separate from the #10181a ground.
- **Scrim:** teal-black at 28% behind the drawer.

### Named Rules
**The Soft Lift Rule.** Cards are separated by a soft shadow and tonal ground, never by a hairline box. Hairlines live inside cards, between rows.

**The Meaning Drops Shadow Rule.** A card tinted to carry state (next step, payday done, week closed) sits flat; its wash is the emphasis.

## Shapes

Gently rounded and soft: cards 18px (16px on phones), inner panels 14px, buttons and icon buttons 12px, fields and tags 10px, checkboxes 8px, bars 4-6px, tabs, chips and pills fully round. Checks are circles (16-30px) except transfer checkboxes, which are 26px rounded squares.

The signature silhouette is the ribbon: a flat top edge (4px solid bucket hue, 3px when tiny) hanging from a 10px rail, with 12px rounded bottom corners. Money that is coming but not yet assigned is the same silhouette drawn as a 1.5px dashed outline in the bucket hue. The receipt has a 12px zigzag top and bottom edge cut by CSS masks; its rules are 1.5px dashed and its leaders dotted. Stamps are 2-3px bordered rounded rectangles rotated -6 to -9 degrees.

## Components

### Buttons
Soft, confident, tactile.
- **Shape:** gently rounded (12px), 13px 18px padding, 600 weight 14.5px label, 8px gap to a 16px stroke icon (arrow for forward motion).
- **Primary:** Salin Wallet Teal with white label and the teal glow. One per card.
- **Hover / Focus / Active:** hover deepens to Deep Lagoon (pointer-fine devices only); focus is a 2.5px teal outline at 2px offset; press scales to 0.97 over 140ms.
- **Soft:** Quiet Fill with ink; hover to Rail Fill. Used for secondary fixes ("Cover from Buffer" on Review).
- **Quiet:** transparent with Deep Lagoon text, 10px 12px padding; hover Sea Glass wash. Used for "See what happened", "Open Plans".
- **Warm:** coral wash with coral text for remedial actions.
- **Disabled:** 45% opacity, no press scale.

### Chips and pills
- **Plan chip:** Sea Glass with Deep Lagoon text and a 7px teal dot ("Plan A is active").
- **Sample pill:** Quiet Fill, Mist Ink, 11px/600, marks every illustrative figure.
- **Milestone pill:** Payday Sun wash, sun-ink text, filled star icon; appears only when a goal crossed a milestone in this session.
- **Delta chip:** white pill with rest lift, 12px/700 tabular "+2,300.00", centered on a ribbon that just grew.

### Cards / Containers
- **Corner Style:** 18px (16px on phones).
- **Background:** White Card; Sea Glass for Next step; Fern wash for peaks.
- **Shadow Strategy:** rest lift; tinted cards flat (see Elevation).
- **Border:** none.
- **Internal Padding:** 24px (18px on phones); shelf card 22px 24px 18px.

### Inputs / Fields
- **Style:** white field, 10px radius, 1.5px inset stroke at 15% ink, 500 weight 14.5px; number fields 76px wide, right-aligned, tabular, 600.
- **Focus:** stroke becomes a 2px inset teal ring.
- **Option boxes:** 14px radius white boxes with an 18px radio drawn by inset shadow; selected gets Sea Glass ground, a 2px teal inset ring and a 5.5px teal radio core.
- **Transfer checkboxes:** 26px rounded squares; checking fills Done Moss and draws the white check stroke (260ms), the row turns Fern wash and a rotated SENT stamp lands.

### Navigation
- **Tab rail:** Quiet Fill pill holding four 600/14px tabs in Slate Ink. Selected tab is a white pill with rest lift and ink text. Hover darkens text only.
- **Status dots:** 8px coral dot when a ritual needs attention, green when it is done.
- **Mobile:** the rail wraps below the wordmark at full width, tabs share space equally.

### Bucket Shelf (signature)
Three labeled groups ("Spend · day to day", "Save & grow · future you", "Set aside · bills & cushions") on one rail. Each slot is a button: hue dot and short name (650/13.5px), amount (650/18px tabular), account (12px Slate Ink), rail, then the ribbon. Overdrawn buckets show no ribbon, a "Needs PHP x" coral tag and a minus amount in ink. Rent shows a dashed ghost tag explaining when it starts. Waiting money shows as dashed previews with "+amount" labels. Hovering deepens the ribbon mix and underlines the name; clicking opens the drawer with the bucket's in/out ledger in Plex Mono. A legend explains "Longer ribbon, more money left" and the dashed preview.

### Next Step Card and Week Loop
Sea Glass card with a teal icon label, one Title Large heading stating the outcome, a one-line why, one primary button and an optional quiet one. Below sits the week loop: a 70% white panel with "This week / n of 5 done", an 8px teal progress bar (600ms scale on change) and five circular check steps.

### Goal Card
Goal name and percent (teal; green for the main Emergency goal), a 12px bar on Quiet Fill whose fill scales from the left over 1000ms, milestone ticks at 25%, 50% and 75% (2x5px marks with 11px labels that turn green when hit), a sub-line with the amount to go in bold tabular, and the milestone pill when a tick was crossed today.

### Peak Card
Fern wash, flat, Title Large heading, a list of 22px Done Moss checks for what was finished, with the last line on a Payday Sun star check (the milestone or the fresh-start figure). Enters with a 320ms rise and hosts the completion burst.

### Receipt Slip
White paper, zigzag edges, paper drop shadow, wallet logo, uppercase Plex Mono lines with bucket dots, dotted leaders, percent and amount columns, a dashed rule before the bold total, and a sans foot note. Completion stamps a rotated SPLIT or WEEK CLOSED stamp (280ms scale-down from 1.4).

### Bucket Drawer
Right sheet, min(420px, 100%) wide, overlay lift, 28% scrim, slides in over 320ms on the drawer curve; header with the bucket's 12px hue dot and 22px title, a 36px balance, and ledger lines on a Quiet Fill panel.

### Income Queue Row (Money in)
One row per waiting income on Surface Mist, 14px radius: neutral ink-3 kind dot, source name (650), a kind chip only when the name doesn't already say it, a Sample pill when demo data, a meta line (date, account it landed in, its job), and the amount at 17px/700 tabular. The open row turns white with a 1.5px ring and reveals the job radios (Use its rule / Split by Plan A / All to one bucket), the bucket bars and a soft "Confirm just this one". A source set to "ask", or an own split that isn't at 100%, shows **Needs a job** in coral and is never confirmed by "Confirm all"; the primary button counts only ready items ("Confirm 2 · ₱5,000").

### Add Income Form
Opened from "+ Add income" on Today or Money in. An inline card (never a modal) with a 2px teal ring, at the top of Money in: Source, Amount received (₱ prefix, 16px/650 tabular), Date, Landed in, and for salary sources an optional "Sent from AUD" that shows the rate you got live. A line under the fields says the job the source's rule will give it, with a link to Plans. Errors sit in coral above the buttons and say how to fix the entry. While it's open, "Add to Money in" is the only primary button; Confirm drops to soft. Adding closes the card and focuses the new row in the queue.

### Plans Sections
Plans opens on a segmented control (Split plan, Income, Accounts, Categories, Goals) so one job shows at a time; it scrolls sideways on phones. **Split plan:** the Plan A/B table with a "Kept in" account select per bucket, plus Rules with an editable Plan B switch amount. **Accounts:** one row per account with an inline rename (every bucket, source and transfer follows), a type select, a currency chip, what the account should hold by its buckets (or A$ kept for an AUD account), chips for the buckets kept there and sources that land there, and Archive only when nothing uses it. **Categories:** a card per bucket in group order (Spend, Save & grow, Set aside), each category with inline rename, this month's spend in that bucket, a "Move to" select (new spending only; logged entries stay), Remove only when it has no entries, and an inline add. **Goals:** editable targets with progress; the Emergency fund target is the Plan B switch.

### Transfer Rows and Netting
Transfers group by account pair. Money flowing both ways between two accounts is netted, but only while neither direction was sent at a different amount. "Keep" rows (already there, Done Moss check) include what netting left in place ("includes ₱350.00 kept by netting"). Ticking stores the amount sent; if a pair grows later the row reads "Send ₱X more · ₱Y already sent". Honest numbers over fewer taps.

### Income Source Row (Plans)
Three columns on Surface Mist: name with kind chip and a mini "lands in" account select (Remove on new sources), the rule select (Split by my plan / Its own split / Keep it whole + bucket select / Ask me each time), and a one-line description. "Its own split" opens a full-width editor of per-bucket percentage inputs (every bucket except Rent, 0 skips it) with a live total that must read 100%.

### Preset Chips
"+ Add income source" opens pill chips for Salary, Scholarship, Side hustle, Allowance, Gift, Refund, Other. Each starts with a sensible rule: salary splits by plan, scholarship is kept whole in Scholarship, side hustle sets aside 10% for tax, allowance goes straight to Living, the rest ask each time.

### Money-in Slip
When nothing is left to assign, the receipt becomes a Money-in slip: one line per source, bucket totals with their hue dots, Total and Left to assign 0.00, stamped ALL IN. The week slip lists Came in per source and a "Cushions & kept whole" line so its lines always reconcile with Came in.

**The Neutral Source Rule.** Income kinds use the neutral ink-3 dot; hue always means bucket family, never source.

### Onboarding Shell
Header shows only the logo and theme toggle (no tabs, no avatar). Below it, a step rail of pills (`surface-2`, 999px radius, 13px/600): a 22px dot per step (done = `done` fill with white check, current = `accent` fill on an `accent-soft` pill with its label, upcoming = white dot with a number). "Signed in" starts checked. Content is a two-column grid, `minmax(0,1fr) 380px`, gap 28px: the step card left, the plan slip right (sticky at 92px). Under 1100px only the current pill keeps its label; under 860px the slip drops below the card; under 720px "Signed in" hides.

### Welcome Hero
Two columns (1.05fr / 0.95fr, gap 56px), vertically centred. Kicker in `accent-strong` 13.5px/650, headline 46px/700 at -0.03em (32px on phones), lede 17px `ink-2` max 54ch, three benefit rows with 22px `accent-soft` check circles. The question "Have you used the Salin app on your phone?" sits above two **Path Cards**: white, 16px radius, `shadow-1`, 40px `accent-soft` icon tile, title 16px/650, one-line description, trailing arrow that nudges 3px right on hover (shadow rises to `shadow-2`). The right column holds an example shelf card (24px radius, `shadow-2`) whose six ribbons unclip top-down once on load, staggered 70ms; it's labelled "Example payday" and hidden from assistive tech. On phones the example follows the choices.

### Step Card
A `card` with 32px padding (20px on phones) and a 22px grid gap. Header: kicker "Step 2 of 6 · Accounts", question as h1 28px/700 (24px on phones; takes focus on step change), one reason sentence in `ink-2` 15.5px. Footer: quiet Back on the left, one primary on the right (full width on phones). Errors sit just above the footer in `warm`. Step content enters with an 8px rise and fade over 240ms.

### Option Cards, Chips and Toggles
**Option card:** native radio inside a label; 14px radius, 1.5px `line-2` inset ring; checked = 2px `accent` ring on `accent-soft`. Title 15px/650 + one 13px line. **Chip:** pill, 1.5px ring, 14px/600 `ink-2`; checked = `accent-soft` fill, `accent` ring, `accent-strong` text. Big chips (accounts) stack name over type. **Toggle:** 42x26 track (`surface-3`, `accent` when on) with a 20px white knob sliding 16px, title + one helper line beside it. All three show the focus ring on the visual element, not the hidden input.

### Plan Builder
A stacked bar (38px, 12px radius, 3px gaps; each bucket hue mixed 62% into surface, percent label inside if ≥ 8%) above one row per bucket: hue dot, name + purpose line, a stepper (30px − / + buttons on `surface-2` around a bare number field and "%"), and the amount per pay with "≈ ₱X a month" under it. Rows at 0% dim to 62%. Below: "Add a bucket" quiet links, a total strip (`good-soft` with check when 100%, `warm-soft` with what's missing otherwise), reality-check notes (`surface-2`, or `warm-soft` with coral numbers when a share is short), then the Plan B toggle and its target field. On phones the amount moves to its own line under the name.

### Plan Slip (signature)
The receipt from Money in, reused as the onboarding's live summary. Each answer prints one mono line; unanswered lines show `· · ·` in `ink-3`. A line's first print plays a 520ms highlight (fade in from 3px above on `accent-soft`, then the tint fades out). Split lines carry hue dots and a % column. At the end the PLAN SET stamp lands like the ALL IN stamp. It never shows phone data before sync is on.

### Where-It-Lives Preview
Bucket → account selects in a two-column grid of `surface-2` rows, then "What payday will look like": the keep row (green, checked box) and send rows with a 26px arrow tile instead of a checkbox (they're a preview, not tasks), and the transfer count.

### Log Spending Sheet
The bucket drawer's sheet, opened from Today. Big amount field (28px/700), category select grouped by bucket, an impact line on `surface-2` with the bucket's hue dot ("From Living: ₱9,500.00 left → ₱9,320.00", new per-day amount below, coral if it goes negative), optional note, paid-from and date in two columns, then **Log it** (primary) and **Log and add another** (soft). After logging, Today shows a green flag in the safe-to-spend card.

### Reward system (named rules)
**The Endowed Week Rule.** The week is a five-step loop whose first step (the pay already split) starts checked, so the user begins at 1 of 5, never 0.

**The Goal Gradient Rule.** Goals show milestone ticks at 25%, 50% and 75%; the fill animates from the old value to the new, ticks turn green as they are passed, and a sun pill names a milestone crossed today.

**The One Next Step Rule.** Today shows exactly one next step with one primary action, chosen as the first unfinished loop step; finishing it reveals the next.

**The Real Completion Peak Rule.** A peak card and a short burst of 28 confetti pieces in the bucket hues fire only when a real loop completes: payday fully split and sent, or the week closed. Never on navigation, never on partial progress, never with reduced motion.

**The Fresh Start Close Rule.** Closing the week stamps the slip, says "Monday starts fresh" and ends on what the user carries forward (next week's safe-to-spend and the next review date), never on what went wrong.

**The Honest Coral Rule.** Shortfalls read as "Needs PHP x" in coral with a one-tap cover suggestion; no red, no shame copy, no automatic moves.

**The Printing Slip Rule.** During onboarding the plan slip fills a line per answer and empty lines wait as dots, so progress is visible and every open line invites the next answer. It never prints numbers the user didn't give or the phone didn't sync.

**The Own-Numbers Rule.** The first plan a user sees is built from their own pay, bills and priority, and every share is editable; presets are starting points, not verdicts.

**The First Real Win Rule.** Onboarding ends on real money: the user's actual pay split and sent, with the peak card and burst. If no pay has come in, it ends calmly on the payday date and a reminder, with no celebration.

### Motion
Two curves: **ease-out** `cubic-bezier(0.23, 1, 0.32, 1)` for almost everything and **ease-drawer** `cubic-bezier(0.32, 0.72, 0, 1)` for the sheet. State changes 150ms, press 140ms, view fade 160ms. The payday grow: ribbons unclip into their dashed previews over 900ms staggered 60ms per bucket while amounts count up (900ms, quartic out), delta chips rise at +700ms, goal fills start at 450ms (1000ms), ticks turn at 1050ms, the milestone pill pops at 1300ms. Onboarding: step content rises 8px and fades in over 240ms; the example ribbons unclip over 900ms staggered 70ms; plan-builder bar segments ease their widths over 320ms; the first-pay bars grow from 0 over 700ms staggered 60ms; the waiting dot pulses (1.6s) only while waiting for the phone. Reduced motion swaps every move for a 200ms fade, paints final numbers instantly and skips the burst, the slip highlight, the bar growth and the pulse.

## Do's and Don'ts

### Do:
- **Do** give every screen one answer and one next step, with a single teal primary action per card.
- **Do** draw bucket ribbons to one shared scale so lengths compare honestly, and show waiting money as dashed previews in the bucket hue.
- **Do** keep each bucket in its hue family: warm for Spend, cool for Save & grow, low-chroma neutral for Set aside.
- **Do** lift white cards with the rest shadow on Mint Paper, and let tinted state cards sit flat.
- **Do** set amounts in Public Sans with tabular figures; reserve IBM Plex Mono for slips, drawer ledger lines and stamps.
- **Do** spend motion and yellow only on real progress: money landing, a milestone crossed, a loop closed.
- **Do** design both themes together; every token has a dark value.
- **Do** mark illustrative figures with the Sample pill.

### Don't:
- **Don't** use red anywhere; attention is Coral Needs on its wash, phrased as what is needed.
- **Don't** use yellow for a bucket, a status or decoration.
- **Don't** box cards with hairline borders; hairlines only separate rows inside a card.
- **Don't** set on-screen money in Plex Mono outside paper objects.
- **Don't** add streaks, badges, points or celebration for opening the app or partial progress.
- **Don't** fire the burst more than once per real completion, or at all under reduced motion.
- **Don't** show more than one primary action in a card or more than one next step on Today.
- **Don't** use pure white (#ffffff) as the page ground.
