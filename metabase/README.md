# Ferguson PO Outcome Reporting — Metabase

Short-term path to unblock Ferguson: scheduled Metabase questions over Snowflake,
delivered as CSV email subscriptions to Ferguson's shared PO-confirmation inbox.
This avoids building the custom `reporting-service` worker for the pilot.

## Files

| File | Purpose |
|------|---------|
| `00-inspect-po-schema.sql` | Historical schema probe (targets the pre-2026-07-06 `purchaseOrders[]` paths; superseded). |
| `ferguson-po-reports.sql`  | One native-SQL Question per outcome bucket — **verified against live prod data 2026-07-14**. |

## Verification status (2026-07-14)

All JSON paths, the status enum, and all six query shapes were verified by
running them against prod Snowflake (Metabase "Snowflake Prod" connection,
database id 34) and cross-checking the existing WISMO Metabase cards in
collection 11683 (notably "Ferguson Export - All Update Data (line level)" /
card 32870, whose extraction pattern these queries reuse). Key facts:

- The classifier emits `emailAnalysisResult.updates[]` since **2026-07-06**
  (the old `purchaseOrders[]` extraction path in the tech design is obsolete).
  All queries floor on that date.
- Status enum: `SHIPPED | DELIVERED | PICKED_UP | NOT_SHIPPED | PARTIAL |
  CANCELLED | NOT_FOUND | NEEDS_PO_COPY | UNKNOWN`. `NOT_FOUND` and
  `CANCELLED` are first-class — the `exceptionReason` dependency is gone.
- Line/logon identity comes from `PROD.LOAD.LOAD.CUSTOMDATA:purchaseOrders[]`
  (`account` = logon, `lineItems[].poLine`/`alt1`), vendor from
  `LOAD.CUSTOMERNAME`. PO-scoped updates fan out to all lines on the PO.
- Queries read `ANALYTICS.DBT_PROD.MART_AGENT_ORCHESTRATOR__EMAIL_EVENTS`
  (dbt mart, refreshed hourly), not the raw `AGENT_ORCHESTRATOR.EVENT` table.

## Deployed (2026-07-14)

The Questions and dashboard are **live** in the WISMO collection
(https://augment.metabaseapp.com/collection/11683-wismo), created from the
blocks in `ferguson-po-reports.sql`:

| Report | Card ID | Rows at deploy |
|---|---|---|
| 1 Shipped | 34923 | 80 |
| 2 Delivered / Pickup | 34924 | 10 |
| 3 PO Not Found | 34925 | 13 |
| 4 Not Shipped (Latest ETA) | 34926 | 55 |
| 5 Cancelled | 34927 | 33 |
| 6 Never Responded | 34928 | 389 |

Dashboard: **Ferguson PO Outcome Reports** —
https://augment.metabaseapp.com/dashboard/14290 — with a **Logon** text filter
mapped to reports 1–5 (`{{logon}}`, optional) and a **Grace Days** number
filter mapped to report 6 (`{{grace_days}}`, required, default 7). All six
cards executed successfully at deploy time.

## Remaining manual steps

1. **Build subscriptions** (below) — NOT created programmatically: emailing
   Ferguson's shared inbox is customer-facing and needs a human go/no-go
   (and a check of the `subscription-allowed-domains` admin setting).
2. **Sanity-check a live run** with someone who knows Ferguson's data before
   turning delivery on — especially the latest-update-wins dedupe (each PO-line
   appears only in the bucket of its most recent supplier update).

## Delivery via subscriptions

Metabase dashboard subscriptions can:
- email **arbitrary external addresses** (the shared inbox) — verify the admin
  `subscription-allowed-domains` setting permits it;
- attach results as **CSV**;
- run on a schedule; create **three subscriptions** (8am / noon / 4pm) for the
  intraday cadence;
- carry **filter values**, which is how per-logon files work.

### Per-logon files (reports 4 & 5)

Metabase can't fan out dynamically, so pre-create one subscription per known
Ferguson logon, each pinning `{{logon}}` to that value. For a bounded pilot
logon set this is a finite one-time setup. When a new logon appears you add a
subscription by hand — this manual step is the main reason a custom worker wins
once you generalize beyond Ferguson.

### Separate email per outcome

Each outcome is its own Question/subscription — reports go out as separate files,
matching Ferguson's "separate reports by outcome" requirement.

## Known gaps / caveats

- **POD-received flag (report 2) is blocked.** Verified: no structured POD
  field exists anywhere in `emailAnalysisResult`. The column is emitted blank
  so the CSV shape is stable; needs a classifier field (or an
  attachment-summary heuristic) to populate. Eng follow-up.
- **Buyer (report 3) is blocked.** Verified: no buyer field in the email
  extraction or in load `customData:purchaseOrders[]`. Emitted blank. Needs
  Ferguson to include buyer in the PO upload feed, or an eng-side enrichment.
- **Fuzzy date normalization** ("mid-August" → Aug 15) is handled in SQL for
  the common patterns (mid/early/beginning/late/end + month name → 15th / 5th /
  25th; verified working on live rows). Relative phrases with no month name
  ("2-3 business days", "end of week next week") fall back to a claimed future
  ship date + 3, then Ferguson's own `updatedArrivalDate`; the verbatim vendor
  text ships in its own column either way. Full normalization belongs in the
  classifier (`etaDate` is only populated for unambiguous dates today).
- **Report 6 (never responded)** is implemented via the outbound-vs-inbound
  thread join on the email-events mart (same pattern as the existing "WISMO
  Custom - Non-Responder Vendor Domains" card). Caveats: zero delivery-failure
  bounces are observable in this pipeline, so silent deliverability problems
  look identical to non-response; some outreach goes to Ferguson buyers
  (@ferguson.com) rather than vendor contacts — the query prefers non-Ferguson
  addresses when picking the contact to display.
- **UNKNOWN-status updates (~4%) land in no report** by design — they carry no
  actionable outcome. If Ferguson wants them, they'd go on report 3's review
  file.
- **CSV polish** (exact filename, BOM/quoting) is limited in Metabase vs. a
  custom worker. Acceptable for the pilot; revisit if Trilogy upload is strict.
- **Per-row buyer routing** is out of scope for the reports — all CSVs go to
  the static shared inbox. Per-row buyer alerts are a separate Augie action.
