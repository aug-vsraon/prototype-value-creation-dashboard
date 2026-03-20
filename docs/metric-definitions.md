# Value Creation Dashboard — Metric Definitions

> This document defines every metric shown on the dashboard, the filtering logic applied to make each metric defensible, the exact data sources and queries, and the open questions still under discussion. It is intended to serve as the source of truth for updating the dbt mart tables.

---

## Core Principle

**"Value added" = work that genuinely replaced a human action.**

We only count activity where we handled an interaction on behalf of a human. System failures, unanswered calls, and passive inbox monitoring are excluded.

---

## Activity Metrics

These are the columns shown in the "By Workflow" table for each workflow.

### Calls

**Definition:** The count of calls (inbound + outbound) where real work was done.

**Source table:** `raw_voice__call`

**Joined tables:**
- `raw_call_analyzer__main_call_metrics` — call duration (via `call_id`)
- `int_voice__call_status_events` — system-level call status (via `call_id`, 1:1 cardinality)
- `int_call_analyzer__call_analysis_parsed` — AI-determined call outcome (via `call_id`, 1:1 cardinality)
- `int_global_config__excluded_brokers` — test brokerage exclusion

**Workflow mapping:** The `agent` column on `raw_voice__call` maps to workflows:
| Agent | Workflow |
|-------|----------|
| `CARRIER_SELECTION_AGENT` | `carrier_selection` |
| `POD_COLLECTION_AGENT` | `pod_collection` |
| `TRACK_AND_TRACE_AGENT` | `track_and_trace` |
| `LOAD_BUILDING_AGENT` | `load_building` |
| `LOAD_SCHEDULING_AGENT` | `scheduling` |

**Exclusions (system status — `int_voice__call_status_events.final_call_status`):**
| Status | Reason |
|--------|--------|
| `NOT_STARTED` | No attempt was made |
| `FAILED` | System failure, no work done |

**Exclusions (call outcome — `int_call_analyzer__call_analysis_parsed.call_outcome`):**
| Outcome | Reason |
|---------|--------|
| `CALL_DISCONNECTED` | Work started but could not be completed |
| `NO_OUTCOME` | No meaningful interaction occurred |
| `NOT_STARTED` | No attempt was made |
| `ATTEMPT_FAILED` | No work was completed |
| `WRONG_NUMBER` | No value delivered to the right party |
| `INVALID_NUMBER` | No value delivered |
| `NO_ANSWER` | No interaction was handled |

**Included (examples of value-added calls):**
- Voicemail left (`REACHED_AUTOMATED_VOICEMAIL`, `VOICEMAIL`, `VOICEMAIL_MESSAGE_LEFT`) — we performed the action a human would have
- Booking pending, load status updates, carrier disqualification, POD follow-ups, etc.

**Exclusion impact:** ~10% of calls are excluded (measured over a 30-day window across all brokerages).

### Emails

**Definition:** Count of outbound emails sent by the system.

**Source table:** `int_agent_orchestrator__email_events`

**Filter:** `email_direction = 'SENT'`

**Why outbound only:** Inbound emails represent monitoring activity (watching an inbox), not work performed. Counting inbound emails would over-inflate the value metric. The work derived from reading inbound emails is captured in downstream actions (TMS updates, outbound replies, etc.).

**Note:** The `email_type` column is largely unpopulated (NULL for most rows). Use `email_direction` instead.

**Open question:** Carrier Selection inbound emails where we disqualify a carrier on the initial received message are arguably value-added work (a human would have had to read and respond). This needs further discussion before including.

### Texts

**Definition:** Count of outbound text messages sent by the system.

**Source table:** `int_agent_orchestrator__events_flattened`

**Filter:** `code = 'SENT_EXTERNAL_TEXT_MESSAGE'`

**Why outbound only:** Same reasoning as emails — receiving a text is monitoring, not performing work. The value from received texts is captured in the resulting actions (TMS updates, outbound replies).

### TMS Updates

**Definition:** Count of TMS (Transportation Management System) updates posted.

**Source table:** `int_agent_orchestrator__events_flattened`

**Filter:** `code IN ('LOAD_ACCESSORIAL_UPDATE', 'STOP_UPDATE', 'TRANSIT_UPDATE')`

**No inbound/outbound distinction:** TMS updates are always actions we perform. Work triggered by inbound messages is captured here — this is where the value from reading inbound messages materializes.

---

## Hours Saved

**Definition:** Estimated human labor hours replaced by the system.

**Formula:**
```
hours_saved = (0.5 * emails_sent + 0.5 * texts_sent + 1 * tms_updates) / 60.0
              + outbound_call_hours
              + inbound_call_hours
```

**Assumptions:**
- Each outbound email = 0.5 minutes (30 seconds) of human time
- Each outbound text = 0.5 minutes (30 seconds) of human time
- Each TMS update = 1 minute of human time
- Calls = actual call duration (from `raw_call_analyzer__main_call_metrics.duration_seconds`)

**What changed from the original mart:** The original `MART_REPORTING__ROI_BY_CUSTOMER_AND_WORKFLOW.HOURS_SAVED` used 1 minute per email/text/TMS, included inbound emails and texts, and counted all calls (including failed/unanswered). The new formula uses 0.5 min for emails/texts, 1 min for TMS, outbound-only emails/texts, and filtered calls.

**Wages saved:** `hours_saved * $35/hr` (average wage assumption).

---

## Outcome Metrics

Each workflow has two outcome metrics. These come from dedicated queries matching exact Metabase report logic, NOT from the ROI table.

### Document Collection

| Metric | Definition |
|--------|-----------|
| **PODs Collected** | Count of loads where the POD was collected within 72 hours of initial outreach |
| **Collection Rate (<=3 days)** | `PODs collected within 72h / total loads with outreach * 100` |

**Source table:** `mart_agent_orchestrator__pod_collection_outcomes`

**Joins:**
- `int_global_config__excluded_brokers` (LEFT JOIN, exclude matches)
- `raw_load__load` (LEFT JOIN, for carrier rate info — used in savings calculations, not displayed)

**Filters:**
- `INITIAL_OUTREACH_TIME IS NOT NULL` (must have had outreach)
- Excluded brokerages filtered out
- Date filter on `INITIAL_OUTREACH_TIME` (exclusive end: `>= from AND < to`)

**SQL logic:**
```sql
-- PODs collected within 3 days
SUM(CASE
  WHEN pod_collected_time >= INITIAL_OUTREACH_TIME
    AND pod_collected_time < INITIAL_OUTREACH_TIME + INTERVAL '72 hours'
  THEN 1 ELSE 0 END)

-- Collection rate
ROUND(pods_within_3_days / total_loads_with_outreach, 3) * 100.0
```

### Track & Trace

| Metric | Definition |
|--------|-----------|
| **TMS Updates Posted** | Count of transit updates + stop updates posted for actioned loads |
| **Loads Actioned** | Count of loads billed for Track & Trace work |

**Source tables:**
- `mart_agent_orchestrator__workflow_loads_for_billing` (billed T&T loads)
- `INT_AGENT_ORCHESTRATOR__EVENTS_FLATTENED` (event details per load)

**Query pattern:** LEFT JOIN from billing loads to events (matching Metabase). This means loads with no matching events still count as "actioned" but contribute 0 to TMS updates. The `GROUP BY e.load_id` pattern means loads without events collapse into one NULL group, slightly undercounting loads actioned vs a simple distinct count. This matches Metabase exactly.

**Filters:**
- `workflow_name = 'TRACK_AND_TRACE'` on billing table
- `workflow = 'track_and_trace'` on events table
- Event codes: `STOP_UPDATE`, `TRANSIT_UPDATE`, `WORKFLOW_STATUS_UPDATE`
- Events lookback: `created_at >= start_date - 7 days` (no upper bound, matching Metabase)
- Date filter on `first_executed` (exclusive end)

**TMS Updates = transit_updates_sent + stop_updates_sent** (combined into one number).

### Carrier Selection

| Metric | Definition |
|--------|-----------|
| **Bids Collected** | Count of bids with a valid amount, load, and source (call or email) |
| **Loads Booked** | Count of distinct loads where a bid led to a carrier booking |

**Bids source:** `raw_carrier_selection__bid`

**Bids filters:**
- `amount IS NOT NULL` (must have a price)
- `load_id IS NOT NULL` (must be associated with a load)
- `call_id IS NOT NULL OR email_thread_id IS NOT NULL` (must have a source)
- Date filter on `created_at` (exclusive end)

**Loads Booked logic:** Complex join chain matching bids to booked carriers via MC numbers:
1. `raw_load__carrier_details_log` — booking events
2. `raw_directory__carrier` — carrier MC/DOT numbers
3. `raw_carrier_selection__bid` — match on `load_id` + `mc_number`
4. Deduplicate by `load_id`, take `MIN(first_booking_time)`
5. Filter by `first_booking_time` date range and `brokerage_key`

**Known issue in source query:** The `all_records_with_booked_bid` CTE unions `mc_number_for_booked_load` with itself (instead of mc + dot). This is carried forward from the Metabase report as-is.

**Performance optimization:** Date predicates pushed into the `mc_number_for_booked_load` CTE (`cd.updated_at` and `b.created_at` filtered to date range) to avoid full-table scans. Reduced query time from 130s to ~17s.

### Load Building

| Metric | Definition |
|--------|-----------|
| **Loads Built** | Currently 0 — no dedicated outcome query |
| **Tender Acceptance Rate** | Currently 0 — no dedicated outcome query |

Load Building activity (calls, emails, hours) comes from the ROI query. Outcome metrics need a dedicated source table — to be addressed in a future iteration.

### Appointment Scheduling

Not yet active for most brokerages. Outcome metrics TBD.

---

## Date Filtering

All queries use **exclusive end dates**: `>= from AND < to`.

This matches the Metabase convention. A date range of "Feb 1 to Mar 1" includes all of February but excludes March 1.

---

## Excluded Brokerages

All queries exclude test/internal brokerages via `int_global_config__excluded_brokers`. This is a LEFT JOIN where matched rows (test brokerages) are filtered out with `WHERE ex.brokerage_key IS NULL`.

---

## Data Sources Summary

| Query | Source Tables | Filters on Date Column |
|-------|-------------|----------------------|
| Activity + Hours | `raw_voice__call`, `int_agent_orchestrator__email_events`, `int_agent_orchestrator__events_flattened` | `created_at` |
| DC Outcomes | `mart_agent_orchestrator__pod_collection_outcomes` | `INITIAL_OUTREACH_TIME` |
| T&T Outcomes | `mart_agent_orchestrator__workflow_loads_for_billing`, `INT_AGENT_ORCHESTRATOR__EVENTS_FLATTENED` | `first_executed` |
| CS Bids | `raw_carrier_selection__bid` | `created_at` |
| CS Booked | `raw_load__carrier_details_log`, `raw_directory__carrier`, `raw_carrier_selection__bid`, `raw_load__load` | `first_booking_time` |
| Brokerages list | `MART_REPORTING__ROI_BY_CUSTOMER_AND_WORKFLOW` | N/A |

---

## What Needs to Change in the dbt Mart

To move from the temporary raw-table queries back to reading from `MART_REPORTING__ROI_BY_CUSTOMER_AND_WORKFLOW`, the following changes are needed in `mart_reporting__roi_by_customer_and_workflow.sql`:

### Change 1: Call outcome filtering

In the `call_level_details` CTE, add two LEFT JOINs and WHERE filters:

```sql
-- Add joins:
LEFT JOIN int_voice__call_status_events cse ON (c.call_id = cse.call_id)
LEFT JOIN int_call_analyzer__call_analysis_parsed ca ON (c.call_id = ca.call_id)

-- Add WHERE filters:
AND COALESCE(cse.final_call_status, '') NOT IN ('NOT_STARTED', 'FAILED')
AND COALESCE(ca.call_outcome, '') NOT IN (
    'CALL_DISCONNECTED', 'NO_OUTCOME', 'NOT_STARTED',
    'ATTEMPT_FAILED', 'WRONG_NUMBER', 'INVALID_NUMBER', 'NO_ANSWER'
)
```

### Change 2: Hours saved formula

In the final SELECT, change `hours_saved` to use outbound emails/texts only with updated time assumptions:

```sql
-- Old:
(1 * emails_received + 1 * emails_sent + 1 * received_texts + 1 * sent_texts + 1 * tms) / 60.0
+ inbound_call_hours + outbound_call_hours

-- New:
(0.5 * emails_sent + 0.5 * sent_texts + 1 * tms) / 60.0
+ inbound_call_hours + outbound_call_hours
```

### Change 3: Fix email_type column

The `email_type` column used in the email aggregate CTE is largely NULL. Replace with `email_direction`:

```sql
-- Old:
COUNT(DISTINCT CASE WHEN email_type = 'SENT' THEN event_id END) emails_sent

-- New:
COUNT(DISTINCT CASE WHEN email_direction = 'SENT' THEN event_id END) emails_sent
```

After making these changes, do a **full refresh** (not incremental) since the historical data needs to be recomputed with the new filters.

Once the mart is updated, remove `lib/roi-query.ts` and revert `app/api/dashboard/route.ts` to read from the mart table.

---

## Open Questions

1. **Carrier Selection inbound emails:** When we receive an email from a carrier and disqualify them on that initial message, that is arguably value-added work (a human would have had to read and respond). Should `email_direction = 'RECEIVED'` count for CS specifically? This would require a per-workflow email counting rule rather than a universal "outbound only" rule.

2. **Voicemail granularity:** We currently count all voicemail outcomes as value-added. Should we distinguish between "voicemail message left" (clearly value-added) vs "reached automated voicemail" (less clear)?

3. **Load Building / Scheduling outcomes:** These workflows need dedicated outcome queries similar to DC, T&T, and CS. What are the right outcome metrics for each?
