-- =============================================================================
-- Diagnostic: verify daily "Loads Booked" for the Weekly Scorecard – Bid Booked
-- Metabase report (question 30454).
--
-- Symptom under investigation: Loads Booked shows 0 for Mon / Tue / Wed of the
-- week of 2026-05-13, non-zero later in the week. Is that real, or an artifact
-- of the complex bid<->booking join chain in the report?
--
-- This is a SEPARATE, SIMPLIFIED cross-check. It does NOT modify the Metabase
-- question or any query in this repo. Run each block on its own and compare the
-- daily counts against the report.
--
-- The report's known fragilities (see docs/metric-definitions.md, "Carrier
-- Selection"): it matches bids to bookings via MC/DOT numbers, the
-- `all_records_with_booked_bid` CTE unions the MC list with itself (instead of
-- mc + dot), and date predicates are pushed into an inner CTE. Any of these can
-- drop legitimate bookings on specific days. These queries strip all of that out
-- so you can isolate where the zeros come from.
--
-- PARAMETERS -- edit these two, then run:
--   Week window (exclusive end, matching the report's >= from AND < to convention):
--     from = 2026-05-11 (Mon)   to = 2026-05-18 (next Mon)
--   Brokerage: set :brokerage_key, or comment out the brokerage filters if the
--     report is not scoped to a single brokerage.
--
-- ASSUMPTIONS TO CONFIRM before trusting Query B/C (column names are inferred
-- from docs/metric-definitions.md, not verified against the live schema — run
-- Query 0 first):
--   * booking timestamp on raw_load__carrier_details_log is `updated_at`
--   * bid table raw_carrier_selection__bid has columns: amount, load_id,
--     call_id, email_thread_id, created_at, mc_number, brokerage_key
--   * brokerage_key lives on raw_load__load (used to scope + exclude test brokers)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Query 0 -- (run first) confirm the real column names so B/C don't fail silently
-- -----------------------------------------------------------------------------
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN (
  'RAW_LOAD__CARRIER_DETAILS_LOG',
  'RAW_CARRIER_SELECTION__BID',
  'RAW_LOAD__LOAD'
)
ORDER BY table_name, ordinal_position;


-- -----------------------------------------------------------------------------
-- Query A -- fastest cross-check: read the pre-aggregated mart at DAILY grain.
-- This is a completely different code path from the Metabase raw join chain.
-- If this shows non-zero for Mon/Tue/Wed while the report shows 0, the report
-- (not the underlying data) is wrong.  Columns here are known-good (they back
-- app/api/dashboard/route.ts).
-- -----------------------------------------------------------------------------
SELECT
  REPORTING_DATE,
  DAYNAME(REPORTING_DATE)                    AS dow,
  SUM(NUM_LOADS_BOOKED_FROM_BIDS)            AS loads_booked_from_bids,
  SUM(NUM_BIDS_COLLECTED)                    AS bids_collected
FROM dbt_prod.mart_reporting__carrier_selection_business_impact
WHERE REPORTING_DATE >= '2026-05-11'
  AND REPORTING_DATE <  '2026-05-18'
  -- AND BROKERAGE_KEY = 'your-brokerage-key'   -- uncomment to scope
GROUP BY 1, 2
ORDER BY 1;


-- -----------------------------------------------------------------------------
-- Query B -- independent raw check: were there ANY carrier bookings per day?
-- No bid attribution at all. This tells you whether Mon/Tue/Wed genuinely had
-- zero booking activity, or whether bookings existed and the report's bid
-- matching dropped them.
--   first_booking_time := MIN(updated_at) per load  (matches the report's dedup)
-- -----------------------------------------------------------------------------
WITH booked AS (
  SELECT
    cd.load_id,
    MIN(cd.updated_at) AS first_booking_time
  FROM raw_load__carrier_details_log cd
  WHERE cd.updated_at >= '2026-05-11'
    AND cd.updated_at <  '2026-05-18'
  GROUP BY cd.load_id
)
SELECT
  TO_DATE(bk.first_booking_time)       AS booking_day,
  DAYNAME(bk.first_booking_time)       AS dow,
  COUNT(DISTINCT bk.load_id)           AS loads_booked_any
FROM booked bk
JOIN raw_load__load l
  ON l.load_id = bk.load_id
LEFT JOIN int_global_config__excluded_brokers ex
  ON l.brokerage_key = ex.brokerage_key
WHERE ex.brokerage_key IS NULL              -- drop test/internal brokerages
  -- AND l.brokerage_key = 'your-brokerage-key'   -- uncomment to scope
GROUP BY 1, 2
ORDER BY 1;


-- -----------------------------------------------------------------------------
-- Query C -- simplified bid-attributed bookings per day.
-- Matches bids to bookings on load_id ONLY -- deliberately dropping the report's
-- MC/DOT-number matching, the self-union quirk, and the date-pushdown CTE.
-- Bid filters mirror the report's "Bids Collected" definition.
--
-- Compare C against the report's daily numbers:
--   * C == report (both 0 Mon-Wed)         -> zeros are real, not a query bug.
--   * C > 0 while report == 0 Mon-Wed       -> the report's MC-number matching /
--                                              self-union is dropping bookings.
--   * B > 0 but C == 0                       -> bookings exist but none trace to a
--                                              qualifying bid (attribution, not a bug).
-- -----------------------------------------------------------------------------
WITH booked AS (
  SELECT
    cd.load_id,
    MIN(cd.updated_at) AS first_booking_time
  FROM raw_load__carrier_details_log cd
  WHERE cd.updated_at >= '2026-05-11'
    AND cd.updated_at <  '2026-05-18'
  GROUP BY cd.load_id
),
qualifying_bids AS (
  SELECT DISTINCT b.load_id
  FROM raw_carrier_selection__bid b
  WHERE b.amount   IS NOT NULL
    AND b.load_id  IS NOT NULL
    AND (b.call_id IS NOT NULL OR b.email_thread_id IS NOT NULL)
    -- AND b.brokerage_key = 'your-brokerage-key'  -- uncomment to scope
)
SELECT
  TO_DATE(bk.first_booking_time)       AS booking_day,
  DAYNAME(bk.first_booking_time)       AS dow,
  COUNT(DISTINCT bk.load_id)           AS loads_booked_from_bids
FROM booked bk
JOIN qualifying_bids qb
  ON qb.load_id = bk.load_id
JOIN raw_load__load l
  ON l.load_id = bk.load_id
LEFT JOIN int_global_config__excluded_brokers ex
  ON l.brokerage_key = ex.brokerage_key
WHERE ex.brokerage_key IS NULL
  -- AND l.brokerage_key = 'your-brokerage-key'   -- uncomment to scope
GROUP BY 1, 2
ORDER BY 1;
