# AU FA Sales Dashboard - frontend

Static page reading a pre-computed `data.json`. No server, no API layer, no BigQuery
credentials in the browser.

- `index.html` - the whole dashboard, self-contained
- `data.json` - metric payload, regenerated nightly by the sync script
- `serve.py` - local preview only, not deployed

## Preview locally

```bash
cd /Users/jayvee/Documents/ds-work/au-fa-dashboard && python3 serve.py 8811
```

Then open <http://127.0.0.1:8811>. Opening `index.html` directly from Finder will not
work - `fetch` needs HTTP.

## What it shows

Four views, switched from the left nav (which shows a live "reps with data / total"
count per tier for the selected period):

**Executive summary** - built for someone who wants the state of the business in one
screen, not a table to audit:

1. *Headline* - revenue, cash, won, booked, show and close rate, each with movement
   against the equal-length period immediately before
2. *Funnel* - Booked → Held → Won, with the conversion and the absolute number lost at
   each stage, so the leak is visible rather than inferred
3. *Revenue by month* - every month between the first and last, with months that hold
   no data at all drawn as hatched columns rather than omitted or shown as zero
4. *By tier* - one row per tier, with Tier 3 explicitly marked as having no funnel
5. *Top performers* - top three closers by revenue, across tiers (only reps who
   actually sold; a medal against $0 makes the whole thing look unserious)
6. *Data health* - reps reporting, period elapsed, target basis, last sync

**Sales leaderboard** - three separate tables, one per tier, reverse-engineered from the
client's `Leaderboard` tab in `FA Sales Dashboard [New Build].xlsx` and verified against
the warehouse:

| Column | Definition |
|---|---|
| Upfront MTD/QTD/YTD | `SUM(upfront_cash)` over the window |
| Revenue MTD/QTD/YTD | `SUM(tcp)` — the sheet's "GROSS REVENUE (TCP)" |
| Personal best | best single calendar month of upfront cash this year |
| Touch points WTD/MTD | dials |
| Leads WTD/MTD | booked (Won+Pending+Lost+NoShow+Missed+Cancelled) |
| Collected WTD | cash collected, week to date |
| Rank | dense rank, ties share a place |

Five of the eight reps on the client tab reconcile to the cent, including Laura's entire
month-by-month row, which is how these definitions were confirmed rather than guessed.

Closers rank on MTD upfront cash; **setters rank on MTD touch points**, since Tier 3
produce no cash by design and ranking them on it would be a column of zeroes.

Windows are anchored to the newest date in the data, not to the viewer's clock, so the
view still reads correctly months later. The period picker is hidden here — it would be a
dead control.

**Insights** are generated from the data on every load, split into highlights and flags.
Two flags are about provenance rather than performance and are deliberately hardcoded —
see "Reconciliation" below.

**Tier 1 / Tier 2** - leaderboard, full funnel table, KPI progress.
**Tier 3** - dialer activity and KPI progress; setters book rather than close, so they
have no funnel by design.

### Period selection

A **Weekly / Monthly / Custom** toggle with a stepper. Weekly lists ISO weeks
(`W1 · Dec 29 → Jan 4 2026`), Monthly lists months (`Jul 2026`).

**Only periods that actually contain data are listed.** That is why Jul–Dec 2025 does
not appear in the month list at all - the archiving gap is expressed as absent options
rather than a run of misleading zeroes.

All filtering happens in the browser against daily rows, so every figure traces back to
source rows rather than a pre-computed total.

### Agent cards

The hero number is **revenue sold**, not the composite score - revenue is what the
business runs on, and a normalised 0-1 score is a ranking device, not a headline. The
composite sits underneath with its explanation tooltip.

## Reconciliation: the client Leaderboard tab

`FA Sales Dashboard [New Build].xlsx` contains **two** leaderboards on **two different
data sources**, which produce materially different numbers for the same reps:

| Rep, 2026 YTD upfront | `Leaderboard` | `MonthlySale` | `ALLCASH` (`Leaderboard2`) | Warehouse |
|---|---|---|---|---|
| Laura | $189,567 | $189,567 | $164,260 | **$189,567** ✓ |
| Shane | $55,000 | $55,000 | $68,800 | **$55,000** ✓ |
| Stacie | $55,000 | $55,000 | $37,951 | **$55,000** ✓ |
| Vanessa | $47,667 | $47,667 | $50,612 | **$47,667** ✓ |
| Dylan | $11,000 | $11,000 | $11,000 | **$11,000** ✓ |
| **Nelson** | **$82,000** | $22,000 | $14,000 | $22,000 |
| **Peter Jr** | **$11,000** | absent | $0 | $0 |
| **Zac** | **$12,000** | absent | $0 | $0 |

### The money columns have two different semantics

Getting Laura to reconcile exposed a real bug. In the source data:

- **`Revenue` and `Cash` are already totals** — the sheet multiplies by `#` before storing
- **`TCP` and `Upfront Cash` are per-deal unit values** and must be multiplied by `#`

Laura's 2026-05-03 row is the proof: `# = 2`, `TCP = 11000`, `Upfront Cash = 11000`,
`Revenue = 22000`. Summing `upfront_cash` raw gave $167,567 against the client's $189,567;
scaling by `#` reconciles exactly, as does `tcp * #` against their $246,400 — which also
equals `revenue`, confirming the relationship.

Only Laura was affected, because she is the only rep with multi-deal rows. Every other
rep's rows have `# = 1`, where raw and scaled are identical — which is exactly how a bug
like this hides. `v_agent_daily_funnel` now scales both columns and documents why.

`Leaderboard` is fed by `MonthlySale`, which aggregates `CURRENT DATA` — and that is the
same lineage this dashboard uses, which is why five of eight agree exactly.

**The three bold figures reconcile with nothing.** Peter Jr and Zac do not appear in
`CURRENT DATA`, `MonthlySale` or `ALLCASH` at all, and `CURRENT DATA` contains no Tier 3
rows whatsoever. They appear to have been typed in by hand. This dashboard shows the
warehouse figure and flags the discrepancy rather than reproducing an untraceable number.

`ALLCASH` is a payment ledger keyed on closer **full name**, and it was explicitly out of
scope for the original sync. It reports roughly **$676k** of 2026 cash across many closers
who are not on the active roster (Brittany $95.5k, James $41.4k, Sean $37.0k, John $25.0k,
Kymberley $24.2k), plus about **$59,800 with no closer named at all**. If ALLCASH is meant
to be the number of record, the sync needs extending to cover it — that is a scope
decision, not a code change.

Also note `DailySales` in that workbook is `#REF!` throughout — a broken formula, not
empty data.

## Branding

Tokens sampled directly from `join.freedomacademy.com.au`, not eyeballed:

| Role | Value | Source |
|---|---|---|
| Deep green surface | `#172114` | favicon field |
| Off-white ink | `#EDEDEE` | favicon mark |
| Elevated surface | `#1C2A24` | page sections |
| Gold accent | `#FBBF24` | page headings |
| Mint | `#B9DACD` | page accents |

The `≡FA≡` monogram is inlined as SVG with `fill: currentColor`, so it takes the ink
colour rather than shipping a second asset. `assets/favicon.png` is the only binary.

**One brand colour was rejected on measurement.** Gold `#FBBF24` against a success green
`#4ADE80` scored ΔE 7.5 under protanopia - below the 8 floor - so those two would be
confusable for red-blind viewers. Success green is gone entirely: **mint carries
"in progress", gold carries "achieved"** (16.7 normal / 16.9 worst-CVD, clears every
gate). Gold-as-achievement also suits a leaderboard better.

Contrast and CVD were computed, not judged by eye - all text and marks clear 4.5:1 on the
brand surface.

### The pattern-interrupt accent, and why it is not neon green

`--neon: #C6F24E` (electric lime). Pure neon green was measured and rejected:

| Candidate | Contrast | Halation risk | Hue distance from brand green |
|---|---|---|---|
| Neon green `#39FF14` | 12.25:1 | HIGH | **28°** |
| Spring green `#00FF88` | 12.39:1 | HIGH | 17° |
| Cyan-teal `#2DE1C2` | 10.02:1 | low | 8° — too close to separate |
| Acid lime `#CCFF00` | 14.14:1 | HIGH | 47° |
| **Electric lime `#C6F24E`** | **12.83:1** | **moderate** | **46°** |

Pure neon green fails on both counts at once. It sits only 28° from the existing brand
green in hue, so it reads as "a brighter green" rather than a distinct signal — while
carrying the highest halation risk of any candidate (OKLab lightness 0.87 × chroma 0.286
against a dark field is the combination that makes edges vibrate and tires eyes over a
long session). Acid lime interrupts just as well but is equally hot.

The chosen lime keeps the 46° hue separation while pulling chroma back to 0.191.

**It is applied to exactly four things**, because an accent only interrupts if it is rare:

1. The leader row's spine and rank in each tier table
2. The hero figure on the top-performer card
3. The active nav marker
4. A KPI target that has been met (bar + tick)

Rendered on the leaderboard that comes to three appearances on the entire page. It is
never used for body text and never as a large flat fill behind a paragraph — both of which
would reintroduce the halation problem it was chosen to avoid. Everything else keeps the
calmer `#B9DACD`.

## Tier identity

Three stacked tables read as one continuous block, so each tier is wrapped in its own
panel carrying **five separate cues** — deliberately not relying on colour:

1. A large numeral badge (1 / 2 / 3)
2. A bold uppercase tier label
3. A 4px coloured spine down the left edge
4. A panel background tint
5. A 34px gap between panels

Each panel also carries its own headline figure (tier MTD total and how many reps are
producing), which doubles as a summary and as a visual break.

The spine and badge use an **ordinal ramp of a single hue** — light `#C7E3D6` for Tier 1
through `#8CB8A2` to dark `#5E8A72` for Tier 3 — so the tiers read as *ordered*, not
merely different. All three clear 2:1 on the surface. Tier 1↔2 separation is ΔE 14.9
against a nominal 15 floor, which is acceptable here precisely because colour is the
reinforcement and the numeral is the carrier: the design still works in greyscale.

The same three colours drive the nav dots and the exec summary's per-tier cards, so the
views reinforce one another rather than running two unrelated schemes.

Row states inside panels (hover, leader, totals) use translucent overlays rather than
fixed colours, so they sit correctly on all three tints.

## Gamification

Everything here is derived from real rows; nothing is invented to look motivating.

- **Leaderboard** with medals for the top three, using the composite score already
  defined by the source sheet.
- **Rank movement** (`▲2`, `▼1`, `new`) against the equal-length window immediately
  before the selected one, scored the same way so it is like-for-like.
- **Achievement chips** - revenue, wins, held, selling days, best single day.
- **Targets hit, X of Y**, with a gold bar and ✓ when a target is met.
- **Pace markers** on cumulative targets: a tick on the bar showing where you should be
  given how much of the period has elapsed, plus an on-pace / behind-pace label.

### Two guards that keep it honest

**Low-volume ratios cannot "hit" a target.** A rep who took 2 calls and showed for both
scores 100% against a 50% show-rate target. Without a guard they would out-rank someone
on 61 calls, and the dashboard would lose credibility the first time anyone noticed.
Ratios below 5 in the denominator are shown - they are real - but marked *low volume*,
hatched rather than filled, and excluded from the targets-hit count. This mirrors the
source sheet's own `Held > 4` ranking gate.

**Cumulative targets are judged against elapsed time.** Without pace markers, opening
"this month" on the 2nd shows every bar near zero and reads as catastrophe.

## Interaction

A cursor spotlight follows the pointer across the page, and every tile, leaderboard card
and progress group carries its own local glow that tracks the cursor within it. Both run
off a single rAF-throttled listener with passive events. `prefers-reduced-motion` disables
the spotlight and all transitions.

## Two behaviours that are deliberate

**Gaps render as gaps.** An agent with no rows in the period gets "No data recorded",
not a row of zeros. A zero and a blank look identical on a dashboard and mean opposite
things - "sold nothing" versus "nobody recorded anything". Reps currently affected:
Natalie B and Peter (see `../au-fa-bigquery-sync/FINDINGS.md`).

**Composite scores are relative, not absolute.** Min-max normalisation means the top
performer always scores 1.00 on a component and the bottom 0.00. Changing the date range
reshuffles scores, not just ranks. The column carries a tooltip saying so.

## Verified against the source

Reconciled against the Sheet's own Dashboard for July 2026, Tier 1:

| | Sheet | This dashboard |
|---|---|---|
| Booked (tier) | 210¹ | 208 |
| Held | 48 | 48 |
| Won | 6 | 6 |
| Laura: booked/held/won | 63¹/15/4 | 61/15/4 |
| Laura composite | 0.95 | 0.950 |
| Stacie composite | 0.54 | 0.539 |

¹ The Sheet's Booked was inflated by counting `Price Presented` and `Terms Signed` rows
as bookings - finding 2b, fixed at source on 2026-07-29.

Re-run this reconciliation after any metric change. Pick a period, compare every column,
and account for every difference before shipping.

## Live

**https://au-fa-dashboard-production.up.railway.app** — Railway project `au-fa-dashboard`,
deployed 2026-07-29 from this folder.

Redeploy after changing `index.html` or `data.json`:

```bash
cd /Users/jayvee/Documents/ds-work/au-fa-dashboard && railway up
```

`data.json` is **baked into the image**, so the live numbers only change on redeploy.
That is the one real drawback of Railway over GitHub Pages here: the nightly sync cannot
refresh a running container, whereas it can commit a file to a repo. Two ways forward
when you want it automatic:

1. Point the sync's `GITHUB_REPO` at a Pages repo and move the site there, or
2. Keep Railway and add a nightly `railway up` from somewhere with the CLI

Until then the page shows a "last synced" timestamp from the data itself, so a stale
deploy is visible rather than silent.

### Container notes

`serve.py` binds `127.0.0.1` by default and the Dockerfile sets `HOST=0.0.0.0`. Binding
loopback inside a container makes the service unreachable and the healthcheck fails with
nothing obvious in the logs — worth remembering if this is ever ported elsewhere.

Response headers set `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy:
no-referrer`, `X-Content-Type-Options: nosniff`, and `no-store` on `data.json`.
`robots.txt` disallows everything. None of that is access control — it keeps the page out
of search results, nothing more.

## Deploying

The page is public with no login, matching the other client reports. It sends
`noindex` so it stays out of search results, but anyone with the URL can read it.
It shows individual rep performance - worth remembering if a rep ever asks.

**GitHub Pages (recommended):** push this folder to a repo, enable Pages. Then set
`GITHUB_REPO` in the sync script's `Code.gs` and add a `GITHUB_TOKEN` script property
(fine-grained PAT, Contents: read and write, that repo only). After that, every
successful nightly sync commits a fresh `data.json` and the page updates on its own.

The publish step only runs when **all six tabs** synced successfully - a partial sync
never reaches the public page. Its outcome is recorded in `sync_log` alongside the
sync itself.

**Railway:** works too, with a Dockerfile like the TerraSlate site, but then `data.json`
has to reach the container on each deploy - GitHub Pages avoids that entirely.

## Not yet built

- Package-mix by product group (`v_sales_events.group` carries Accelerator / Premium /
  Signature and their variants - richer than the current Sheet dashboard)
- Trend charts over time. Held back until the Jul-Dec 2025 gap is resolved, since a
  six-month hole would read as a collapse in performance rather than missing data.
