-- ============================================================================
-- Ferguson PO Outcome Reporting — Metabase native queries
--
-- HOW TO USE
--   Each numbered block below is ONE Metabase Question (native SQL query).
--   Create the Question, paste the block, save it, then attach it to a
--   dashboard subscription (see metabase/README.md for cadence/per-logon setup).
--
-- STATUS OF THIS FILE
--   DRAFT. Every JSON path tagged "ASSUMED" must be confirmed against the
--   output of 00-inspect-po-schema.sql before this is trusted. The confident
--   parts are: the base table, the ferguson/workflow filter, and the FLATTEN
--   over purchaseOrders[]. The uncertain parts are: the sub-field names inside
--   each PO object, and the status -> bucket mapping.
--
-- KNOWN DATA GAP
--   "PO not found" (report 3) vs "Cancelled" (report 5) both live under
--   status = 'EXCEPTION' until the `exceptionReason` classifier field ships.
--   Until then those two queries overlap — see the note on each.
--
-- METABASE FILTER
--   {{logon}} is an optional Metabase Field Filter / text variable used to
--   drive per-logon subscriptions. Leave it unset for a consolidated file.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- SHARED BASE (conceptual) — repeated inline in each query as a CTE so each
-- Question is self-contained (Metabase Questions can't share a CTE).
--
--   WITH po AS (
--     SELECT
--       e.CREATED_AT                              AS event_at,
--       f.VALUE:poNumber::string                  AS po_number,      -- ASSUMED
--       f.VALUE:lineItem::string                  AS line_item,      -- ASSUMED
--       f.VALUE:logon::string                     AS logon,          -- ASSUMED
--       f.VALUE:vendor::string                    AS vendor,         -- ASSUMED
--       f.VALUE:buyer::string                     AS buyer,          -- ASSUMED (route on this; never "writer")
--       f.VALUE:status::string                    AS status,         -- confirmed key exists
--       f.VALUE:exceptionReason::string           AS exception_reason,-- may be NULL until classifier ships
--       f.VALUE:shipDate::string                  AS ship_date_raw,  -- ASSUMED
--       f.VALUE:expectedShipDate::string          AS eta_raw,        -- ASSUMED
--       f.VALUE:trackingNumber::string            AS tracking,       -- ASSUMED
--       f.VALUE:podReceived::boolean              AS pod_received    -- ASSUMED
--     FROM AGENT_ORCHESTRATOR.EVENT e,
--          LATERAL FLATTEN(input => e.DATA:emailAnalysisResult:purchaseOrders) f
--     WHERE e.CODE = 'NEW_EMAIL'
--       AND e.BROKERAGEKEY = 'ferguson'
--       AND e.DATA:emailAnalysisWorkflowId = '01kvrkq82ghcxgj2ba3nxpq64y'
--   )
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- REPORT 1 — SHIPPED
-- Columns: PO, line, shipped status, shipped-or-derived date, tracking.
-- Date rule: use reported ship date; expected arrival = ship date + 3 days.
-- ===========================================================================
WITH po AS (
  SELECT
    f.VALUE:poNumber::string        AS po_number,      -- ASSUMED
    f.VALUE:lineItem::string        AS line_item,      -- ASSUMED
    f.VALUE:logon::string           AS logon,          -- ASSUMED
    f.VALUE:status::string          AS status,
    f.VALUE:shipDate::string        AS ship_date_raw,  -- ASSUMED
    f.VALUE:trackingNumber::string  AS tracking        -- ASSUMED
  FROM AGENT_ORCHESTRATOR.EVENT e,
       LATERAL FLATTEN(input => e.DATA:emailAnalysisResult:purchaseOrders) f
  WHERE e.CODE = 'NEW_EMAIL'
    AND e.BROKERAGEKEY = 'ferguson'
    AND e.DATA:emailAnalysisWorkflowId = '01kvrkq82ghcxgj2ba3nxpq64y'
)
SELECT
  po_number                                   AS "PO Number",
  line_item                                   AS "Line Item",
  'SHIPPED'                                    AS "Status",
  TO_CHAR(TRY_TO_DATE(ship_date_raw), 'MM/DD/YYYY')                    AS "Ship Date",
  TO_CHAR(DATEADD('day', 3, TRY_TO_DATE(ship_date_raw)), 'MM/DD/YYYY') AS "Expected Arrival",
  tracking                                    AS "Tracking Number"
FROM po
-- ASSUMED mapping: a "shipped" PO has a ship date but is not yet delivered.
-- Confirm whether there is an explicit SHIPPED status value in 0b before relying on this.
WHERE ship_date_raw IS NOT NULL
  AND status NOT IN ('DELIVERED')
  AND ( {{logon}} IS NULL OR logon = {{logon}} )
ORDER BY po_number, line_item;


-- ===========================================================================
-- REPORT 2 — DELIVERED / CUSTOMER PICKUP
-- Columns: PO, line, delivery result, ERP-usable date, POD received flag.
-- Date rule: Trilogy may reject past dates -> use CURRENT_DATE, or +1 if late.
-- ===========================================================================
WITH po AS (
  SELECT
    f.VALUE:poNumber::string   AS po_number,     -- ASSUMED
    f.VALUE:lineItem::string   AS line_item,      -- ASSUMED
    f.VALUE:logon::string      AS logon,          -- ASSUMED
    f.VALUE:status::string     AS status,
    f.VALUE:podReceived::boolean AS pod_received  -- ASSUMED
  FROM AGENT_ORCHESTRATOR.EVENT e,
       LATERAL FLATTEN(input => e.DATA:emailAnalysisResult:purchaseOrders) f
  WHERE e.CODE = 'NEW_EMAIL'
    AND e.BROKERAGEKEY = 'ferguson'
    AND e.DATA:emailAnalysisWorkflowId = '01kvrkq82ghcxgj2ba3nxpq64y'
)
SELECT
  po_number                                    AS "PO Number",
  line_item                                    AS "Line Item",
  'DELIVERED'                                  AS "Delivery Result",
  TO_CHAR(CURRENT_DATE(), 'MM/DD/YYYY')        AS "Delivery Date",   -- ERP-usable, never past
  CASE WHEN COALESCE(pod_received, FALSE) THEN 'YES' ELSE 'NO' END AS "POD Received"
FROM po
WHERE status = 'DELIVERED'
  AND ( {{logon}} IS NULL OR logon = {{logon}} )
ORDER BY po_number, line_item;


-- ===========================================================================
-- REPORT 3 — VENDOR DID NOT RECEIVE THE PO  (review-oriented, not ERP upload)
-- Columns: PO, logon, vendor, buyer, context.
-- NOTE: until `exceptionReason` ships, this overlaps REPORT 5. Once it ships,
--       change the filter to: status='EXCEPTION' AND exception_reason='NOT_FOUND'.
-- ===========================================================================
WITH po AS (
  SELECT
    f.VALUE:poNumber::string        AS po_number,       -- ASSUMED
    f.VALUE:logon::string           AS logon,           -- ASSUMED
    f.VALUE:vendor::string          AS vendor,          -- ASSUMED
    f.VALUE:buyer::string           AS buyer,           -- ASSUMED
    f.VALUE:status::string          AS status,
    f.VALUE:exceptionReason::string AS exception_reason,
    f.VALUE:summary::string         AS context          -- ASSUMED
  FROM AGENT_ORCHESTRATOR.EVENT e,
       LATERAL FLATTEN(input => e.DATA:emailAnalysisResult:purchaseOrders) f
  WHERE e.CODE = 'NEW_EMAIL'
    AND e.BROKERAGEKEY = 'ferguson'
    AND e.DATA:emailAnalysisWorkflowId = '01kvrkq82ghcxgj2ba3nxpq64y'
)
SELECT
  po_number   AS "PO Number",
  logon       AS "Logon",
  vendor      AS "Vendor",
  buyer       AS "Buyer",
  context     AS "Context"
FROM po
WHERE status = 'EXCEPTION'
  AND (exception_reason = 'NOT_FOUND' OR exception_reason IS NULL) -- IS NULL = pre-classifier fallback
  AND ( {{logon}} IS NULL OR logon = {{logon}} )
ORDER BY logon, po_number;


-- ===========================================================================
-- REPORT 4 — NOT SHIPPED  (ERP upload, one file per logon)
-- Columns: PO, line item, latest expected ship date.
-- Date rule: latest ETA; normalize fuzzy responses ("mid-August" -> Aug 15).
-- ===========================================================================
WITH po AS (
  SELECT
    f.VALUE:poNumber::string   AS po_number,   -- ASSUMED
    f.VALUE:lineItem::string   AS line_item,    -- ASSUMED
    f.VALUE:logon::string      AS logon,        -- ASSUMED
    f.VALUE:status::string     AS status,
    f.VALUE:expectedShipDate::string AS eta_raw -- ASSUMED (may be a fuzzy string)
  FROM AGENT_ORCHESTRATOR.EVENT e,
       LATERAL FLATTEN(input => e.DATA:emailAnalysisResult:purchaseOrders) f
  WHERE e.CODE = 'NEW_EMAIL'
    AND e.BROKERAGEKEY = 'ferguson'
    AND e.DATA:emailAnalysisWorkflowId = '01kvrkq82ghcxgj2ba3nxpq64y'
)
SELECT
  po_number   AS "PO Number",
  line_item   AS "Line Item",
  -- Best-effort fuzzy-date normalization. Prefer moving this into the classifier;
  -- SQL can only cover a handful of patterns. Falls back to raw text if unparseable.
  COALESCE(
    TO_CHAR(TRY_TO_DATE(eta_raw), 'MM/DD/YYYY'),
    TO_CHAR(TRY_TO_DATE(eta_raw, 'Mon DD YYYY'), 'MM/DD/YYYY'),
    CASE
      WHEN eta_raw ILIKE 'mid-%'   THEN 'see raw: ' || eta_raw  -- e.g. map mid-<month> -> 15th upstream
      WHEN eta_raw ILIKE 'early %' THEN 'see raw: ' || eta_raw
      WHEN eta_raw ILIKE 'late %'  THEN 'see raw: ' || eta_raw
      ELSE eta_raw
    END
  )           AS "Latest Expected Ship Date"
FROM po
-- ASSUMED: "not shipped, still open" = OPEN with no delivery and no ship date.
WHERE status = 'OPEN'
  AND ( {{logon}} IS NULL OR logon = {{logon}} )
ORDER BY po_number, line_item;


-- ===========================================================================
-- REPORT 5 — CANCELLED  (ERP upload, one file per logon)
-- Columns: cancelled PO / line + status for Trilogy cleanup.
-- NOTE: until `exceptionReason` ships, this overlaps REPORT 3. Once it ships,
--       change the filter to: status='EXCEPTION' AND exception_reason='CANCELLED'.
-- ===========================================================================
WITH po AS (
  SELECT
    f.VALUE:poNumber::string        AS po_number,      -- ASSUMED
    f.VALUE:lineItem::string        AS line_item,       -- ASSUMED
    f.VALUE:logon::string           AS logon,           -- ASSUMED
    f.VALUE:status::string          AS status,
    f.VALUE:exceptionReason::string AS exception_reason
  FROM AGENT_ORCHESTRATOR.EVENT e,
       LATERAL FLATTEN(input => e.DATA:emailAnalysisResult:purchaseOrders) f
  WHERE e.CODE = 'NEW_EMAIL'
    AND e.BROKERAGEKEY = 'ferguson'
    AND e.DATA:emailAnalysisWorkflowId = '01kvrkq82ghcxgj2ba3nxpq64y'
)
SELECT
  po_number       AS "PO Number",
  line_item       AS "Line Item",
  'CANCELLED'     AS "Status"
FROM po
WHERE status = 'EXCEPTION'
  AND exception_reason = 'CANCELLED'   -- requires classifier field; empty until it ships
  AND ( {{logon}} IS NULL OR logon = {{logon}} )
ORDER BY po_number, line_item;


-- ===========================================================================
-- REPORT 6 — VENDOR NEVER RESPONDED  (weekly, review-oriented)
-- Columns: nonresponsive vendor contact + affected POs, after the grace period.
-- Different query shape: absence of a reply within N days. This is a PLACEHOLDER
-- because the "no reply within N days" signal is not confirmed to live on the
-- NEW_EMAIL extraction — it likely needs an outbound-vs-inbound event join
-- (see int_agent_orchestrator__email_events in the existing dashboard).
-- Confirm the source before relying on this one.
-- ===========================================================================
-- TODO: define once the no-response signal / grace-period source is confirmed.
SELECT 'REPORT 6 not yet implemented — needs no-reply-within-N-days source' AS note;
