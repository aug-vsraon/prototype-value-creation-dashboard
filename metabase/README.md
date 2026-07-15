# Ferguson PO Outcome Reporting — Metabase

Short-term path to unblock Ferguson: scheduled Metabase questions over Snowflake,
delivered as CSV email subscriptions to Ferguson's shared PO-confirmation inbox.
This avoids building the custom `reporting-service` worker for the pilot.

## Files

| File | Purpose |
|------|---------|
| `00-inspect-po-schema.sql` | **Run first.** Confirms the real JSON field names + status values. |
| `ferguson-po-reports.sql`  | One native-SQL Question per outcome bucket (drafts). |

## Order of operations

1. **Verify field paths.** Run `00-inspect-po-schema.sql` in Metabase against the
   Snowflake connection. Read the actual keys off `purchase_order_json` and the
   real `status` values. Then fix every path tagged `ASSUMED` in
   `ferguson-po-reports.sql`. **Nothing is trustworthy until this is done** — the
   sub-field names (line item, ship date, ETA, tracking, vendor, buyer, logon,
   POD flag) are best-guesses.
2. **Create one Question per report** (blocks 1–6 in `ferguson-po-reports.sql`).
3. **Add the `{{logon}}` variable** as a text/field filter on each ERP-upload
   Question (reports 4 and 5) so a single Question drives every per-logon file.
4. **Build subscriptions** (below).
5. **Sanity-check a live run** with someone who knows Ferguson's data before
   turning delivery on — especially the status→bucket mapping.

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

- **`exceptionReason` dependency.** "PO not found" (report 3) and "Cancelled"
  (report 5) both sit under `status='EXCEPTION'` until the classifier
  `exceptionReason` field ships. They overlap until then; each query has a note
  on the one-line filter change to make once it lands.
- **Fuzzy date normalization** ("mid-August" → Aug 15) is only partially doable
  in SQL. Best handled upstream in the classifier; report 4 falls back to raw
  text when it can't parse.
- **Report 6 (never responded)** is a placeholder — the "no reply within N days"
  signal likely needs an outbound/inbound event join, not the NEW_EMAIL
  extraction. Source must be confirmed.
- **CSV polish** (exact filename, BOM/quoting) is limited in Metabase vs. a
  custom worker. Acceptable for the pilot; revisit if Trilogy upload is strict.
- **Buyer/data-derived routing** is out of scope for the reports — all CSVs go to
  the static shared inbox. Per-row buyer alerts are a separate Augie action.
