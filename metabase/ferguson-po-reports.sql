-- ============================================================================
-- Ferguson PO Outcome Reporting — Metabase native queries
--
-- HOW TO USE
--   Each numbered block below is ONE Metabase Question (native SQL query)
--   against the "Snowflake Prod" connection (database id 34).
--   Create the Question, paste the block, save it, then attach it to a
--   dashboard subscription (see metabase/README.md for cadence/per-logon setup).
--
-- STATUS OF THIS FILE
--   VERIFIED 2026-07-14 against live prod data and the existing WISMO Metabase
--   cards (collection 11683: "Ferguson Export - All Update Data (line level)",
--   "Ferguson Export - ETA Upload Template", "WISMO Custom - Non-Responder
--   Vendor Domains"). Every JSON path below was confirmed by probing
--   ANALYTICS.DBT_PROD.MART_AGENT_ORCHESTRATOR__EMAIL_EVENTS and
--   PROD.LOAD.LOAD with OBJECT_KEYS().
--
-- SCHEMA CHANGE vs THE ORIGINAL TECH DESIGN (important)
--   The design doc's path DATA:emailAnalysisResult:purchaseOrders[] is
--   OBSOLETE. Since 2026-07-06 the classifier emits an `updates[]` array:
--
--     emailAnalysisResult: {
--       emailClassification, emailClassifications, loadNumbers,
--       summary, supplierName,
--       updates: [{
--         poNumber, scope ('PO'|'LINE'), status,
--         shipDate, etaDate, etaText, deliveryDate,
--         trackingNumber, quantityShipped, lineIdentifier,
--         notes, evidence
--       }]
--     }
--
--   status enum (verified in prod since 2026-07-06):
--     SHIPPED | DELIVERED | PICKED_UP | NOT_SHIPPED | PARTIAL |
--     CANCELLED | NOT_FOUND | NEEDS_PO_COPY | UNKNOWN
--   -> NOT_FOUND and CANCELLED are first-class statuses. The old
--      status='EXCEPTION' + exceptionReason plan is no longer needed.
--
--   Line-item identity comes from the LOAD side, not the email side:
--     PROD.LOAD.LOAD.CUSTOMDATA:purchaseOrders[] =
--       { poNumber, account (= logon), poDate, updateDaysPastDue,
--         updatedArrivalDate,
--         lineItems: [{ poLine, alt1, orderQty, openQty,
--                       productDescription, productKey [, tier] }] }
--   Vendor = LOAD.CUSTOMERNAME. Scope rule: a scope='PO' update fans out to
--   every line on the PO; scope='LINE' matches lineIdentifier to alt1/poLine.
--
-- CONFIRMED NOT AVAILABLE (do not go hunting; see README caveats)
--   - buyer: not in the email extraction, not in load customData.
--   - POD-received flag: no structured field anywhere in emailAnalysisResult.
--
-- METABASE VARIABLES
--   {{logon}} — optional text variable for per-logon subscriptions, used via
--   Metabase optional-clause syntax [[ AND ... ]] so an unset variable is fine.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- SHARED BASE — repeated inline in each query so each Question is
-- self-contained (Metabase Questions can't share a CTE).
--
-- Grain: one row per (supplier update x matching PO line), deduped to the
-- LATEST update per (logon, po_number, line_number) so each PO-line appears
-- in exactly one outcome bucket (its most recent reported state).
--
--   WITH po_workflows AS (
--     SELECT wa.AGENTID
--     FROM PROD.AGENT_REGISTRY.WORKFLOWAGENT wa
--     JOIN PROD.AGENT_REGISTRY.WORKFLOW w ON w.ID = wa.WORKFLOWID
--     WHERE w.NAME ILIKE 'PO Visibility%'
--   ), ferg_loads AS (
--     SELECT l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
--     FROM PROD.LOAD.LOAD l
--     JOIN PROD.AGENT_PLATFORM.WORKFLOWSTATE ws
--       ON ws.ENTITYID = l.ID AND ws.ENTITY = 'LOAD'
--     JOIN po_workflows pw ON pw.AGENTID = ws.AGENTID
--     WHERE l.BROKERAGEKEY = 'ferguson'
--       AND l.BROKERAGELOADID NOT ILIKE 'test%'
--       AND l.BROKERAGELOADID NOT ILIKE 'MOCK%'
--     GROUP BY l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
--   ), load_lines AS (
--     ... FLATTEN CUSTOMDATA:purchaseOrders -> lineItems ...
--   ), po_updates AS (
--     ... FLATTEN EMAIL_ANALYSIS_RESULT_JSON:updates ...
--   ), line_rows AS (
--     ... join updates to lines (PO fan-out / LINE match), QUALIFY latest ...
--   )
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- REPORT 1 — SHIPPED  (ERP upload)
-- Columns: PO, line, status, ship date, expected arrival (= ship date + 3),
--          tracking number.
-- Includes PARTIAL (something shipped); status column distinguishes them.
-- ===========================================================================
WITH po_workflows AS (
  SELECT wa.AGENTID
  FROM PROD.AGENT_REGISTRY.WORKFLOWAGENT wa
  JOIN PROD.AGENT_REGISTRY.WORKFLOW w ON w.ID = wa.WORKFLOWID
  WHERE w.NAME ILIKE 'PO Visibility%'
), ferg_loads AS (
  SELECT l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
  FROM PROD.LOAD.LOAD l
  JOIN PROD.AGENT_PLATFORM.WORKFLOWSTATE ws ON ws.ENTITYID = l.ID AND ws.ENTITY = 'LOAD'
  JOIN po_workflows pw ON pw.AGENTID = ws.AGENTID
  WHERE l.BROKERAGEKEY = 'ferguson'
    AND l.BROKERAGELOADID NOT ILIKE 'test%' AND l.BROKERAGELOADID NOT ILIKE 'MOCK%'
  GROUP BY l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
), load_lines AS (
  SELECT fl.CUSTOMERNAME AS vendor,
         COALESCE(po.value:account::STRING, fl.CUSTOMDATA:account::STRING) AS logon,
         UPPER(TRIM(po.value:poNumber::STRING)) AS po_number,
         li.value:poLine::STRING AS line_number,
         li.value:alt1::STRING   AS alt1
  FROM ferg_loads fl,
       LATERAL FLATTEN(input => fl.CUSTOMDATA:purchaseOrders) po,
       LATERAL FLATTEN(input => po.value:lineItems, OUTER => TRUE) li
  WHERE po.value:poNumber IS NOT NULL
), po_updates AS (
  SELECT e.CREATED_AT AS response_at,
         UPPER(TRIM(u.value:poNumber::STRING)) AS po_number,
         u.value:status::STRING          AS status,
         u.value:shipDate::STRING        AS ship_date,
         u.value:etaDate::STRING         AS eta_date,
         u.value:deliveryDate::STRING    AS delivery_date,
         u.value:trackingNumber::STRING  AS tracking_number,
         u.value:lineIdentifier::STRING  AS line_identifier
  FROM ANALYTICS.DBT_PROD.MART_AGENT_ORCHESTRATOR__EMAIL_EVENTS e
  JOIN ferg_loads fl ON e.LOAD_ID::STRING = fl.ID,
       LATERAL FLATTEN(input => TRY_PARSE_JSON(TO_VARCHAR(e.EMAIL_ANALYSIS_RESULT_JSON)):updates) u
  WHERE (e.EMAIL_DIRECTION = 'INBOUND' OR e.CODE = 'NEW_EMAIL')
    AND e.CREATED_AT >= '2026-07-06'          -- updates[] schema validity floor
    AND u.value:poNumber IS NOT NULL
), line_rows AS (
  SELECT pu.*, ll.logon, ll.line_number, ll.alt1, ll.vendor
  FROM po_updates pu
  JOIN load_lines ll ON ll.po_number = pu.po_number
  WHERE pu.line_identifier IS NULL
     OR UPPER(TRIM(pu.line_identifier)) IN
        (UPPER(TRIM(COALESCE(ll.alt1, ''))), UPPER(TRIM(COALESCE(ll.line_number, ''))))
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY ll.logon, pu.po_number, ll.line_number ORDER BY pu.response_at DESC) = 1
)
SELECT
  po_number                                     AS "PO Number",
  line_number                                   AS "Line Item",
  status                                        AS "Status",           -- SHIPPED or PARTIAL
  TO_CHAR(TRY_TO_DATE(ship_date), 'MM/DD/YYYY') AS "Ship Date",
  TO_CHAR(COALESCE(
    DATEADD('day', 3, TRY_TO_DATE(ship_date)),  -- primary rule: ship + 3
    TRY_TO_DATE(eta_date),                      -- fallback: exact ETA
    TRY_TO_DATE(delivery_date)                  -- fallback: stated delivery
  ), 'MM/DD/YYYY')                              AS "Expected Arrival",
  tracking_number                               AS "Tracking Number"
FROM line_rows
WHERE status IN ('SHIPPED', 'PARTIAL')
  [[ AND logon = {{logon}} ]]
ORDER BY po_number, TRY_TO_NUMBER(line_number);


-- ===========================================================================
-- REPORT 2 — DELIVERED / CUSTOMER PICKUP  (ERP upload)
-- Columns: PO, line, result, ERP-usable date, POD received flag.
-- Date rule: Trilogy rejects past dates -> emit CURRENT_DATE (the send date),
--            which by construction is never in the past.
-- POD flag: NO structured field exists yet (verified) — emitted as blank.
-- ===========================================================================
WITH po_workflows AS (
  SELECT wa.AGENTID
  FROM PROD.AGENT_REGISTRY.WORKFLOWAGENT wa
  JOIN PROD.AGENT_REGISTRY.WORKFLOW w ON w.ID = wa.WORKFLOWID
  WHERE w.NAME ILIKE 'PO Visibility%'
), ferg_loads AS (
  SELECT l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
  FROM PROD.LOAD.LOAD l
  JOIN PROD.AGENT_PLATFORM.WORKFLOWSTATE ws ON ws.ENTITYID = l.ID AND ws.ENTITY = 'LOAD'
  JOIN po_workflows pw ON pw.AGENTID = ws.AGENTID
  WHERE l.BROKERAGEKEY = 'ferguson'
    AND l.BROKERAGELOADID NOT ILIKE 'test%' AND l.BROKERAGELOADID NOT ILIKE 'MOCK%'
  GROUP BY l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
), load_lines AS (
  SELECT COALESCE(po.value:account::STRING, fl.CUSTOMDATA:account::STRING) AS logon,
         UPPER(TRIM(po.value:poNumber::STRING)) AS po_number,
         li.value:poLine::STRING AS line_number,
         li.value:alt1::STRING   AS alt1
  FROM ferg_loads fl,
       LATERAL FLATTEN(input => fl.CUSTOMDATA:purchaseOrders) po,
       LATERAL FLATTEN(input => po.value:lineItems, OUTER => TRUE) li
  WHERE po.value:poNumber IS NOT NULL
), po_updates AS (
  SELECT e.CREATED_AT AS response_at,
         UPPER(TRIM(u.value:poNumber::STRING)) AS po_number,
         u.value:status::STRING         AS status,
         u.value:deliveryDate::STRING   AS delivery_date,
         u.value:lineIdentifier::STRING AS line_identifier
  FROM ANALYTICS.DBT_PROD.MART_AGENT_ORCHESTRATOR__EMAIL_EVENTS e
  JOIN ferg_loads fl ON e.LOAD_ID::STRING = fl.ID,
       LATERAL FLATTEN(input => TRY_PARSE_JSON(TO_VARCHAR(e.EMAIL_ANALYSIS_RESULT_JSON)):updates) u
  WHERE (e.EMAIL_DIRECTION = 'INBOUND' OR e.CODE = 'NEW_EMAIL')
    AND e.CREATED_AT >= '2026-07-06'
    AND u.value:poNumber IS NOT NULL
), line_rows AS (
  SELECT pu.*, ll.logon, ll.line_number, ll.alt1
  FROM po_updates pu
  JOIN load_lines ll ON ll.po_number = pu.po_number
  WHERE pu.line_identifier IS NULL
     OR UPPER(TRIM(pu.line_identifier)) IN
        (UPPER(TRIM(COALESCE(ll.alt1, ''))), UPPER(TRIM(COALESCE(ll.line_number, ''))))
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY ll.logon, pu.po_number, ll.line_number ORDER BY pu.response_at DESC) = 1
)
SELECT
  po_number                             AS "PO Number",
  line_number                           AS "Line Item",
  CASE status WHEN 'PICKED_UP' THEN 'CUSTOMER PICKUP' ELSE 'DELIVERED' END
                                        AS "Delivery Result",
  TO_CHAR(CURRENT_DATE(), 'MM/DD/YYYY') AS "Delivery Date",  -- ERP-usable, never past
  ''                                    AS "POD Received"    -- BLOCKED: no POD field in extraction yet
FROM line_rows
WHERE status IN ('DELIVERED', 'PICKED_UP')
  [[ AND logon = {{logon}} ]]
ORDER BY po_number, TRY_TO_NUMBER(line_number);


-- ===========================================================================
-- REPORT 3 — VENDOR DID NOT RECEIVE THE PO  (review-oriented, not ERP upload)
-- Columns: PO, logon, vendor, buyer, context.
-- Filter: NOT_FOUND (vendor has no record) + NEEDS_PO_COPY (vendor asked for
-- a copy = effectively no record). "Detail" column distinguishes the two.
-- Buyer: BLOCKED — no buyer field exists in extraction or load customData;
--        emitted blank so the CSV shape is stable when it ships.
-- PO-level report: updates here are PO-scoped, no line fan-out needed.
-- ===========================================================================
WITH po_workflows AS (
  SELECT wa.AGENTID
  FROM PROD.AGENT_REGISTRY.WORKFLOWAGENT wa
  JOIN PROD.AGENT_REGISTRY.WORKFLOW w ON w.ID = wa.WORKFLOWID
  WHERE w.NAME ILIKE 'PO Visibility%'
), ferg_loads AS (
  SELECT l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
  FROM PROD.LOAD.LOAD l
  JOIN PROD.AGENT_PLATFORM.WORKFLOWSTATE ws ON ws.ENTITYID = l.ID AND ws.ENTITY = 'LOAD'
  JOIN po_workflows pw ON pw.AGENTID = ws.AGENTID
  WHERE l.BROKERAGEKEY = 'ferguson'
    AND l.BROKERAGELOADID NOT ILIKE 'test%' AND l.BROKERAGELOADID NOT ILIKE 'MOCK%'
  GROUP BY l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
), load_pos AS (
  SELECT fl.CUSTOMERNAME AS vendor,
         COALESCE(po.value:account::STRING, fl.CUSTOMDATA:account::STRING) AS logon,
         UPPER(TRIM(po.value:poNumber::STRING)) AS po_number
  FROM ferg_loads fl,
       LATERAL FLATTEN(input => fl.CUSTOMDATA:purchaseOrders) po
  WHERE po.value:poNumber IS NOT NULL
  GROUP BY 1, 2, 3
), po_updates AS (
  SELECT e.CREATED_AT AS response_at,
         e.FROM_ADDRESS AS responder,
         UPPER(TRIM(u.value:poNumber::STRING)) AS po_number,
         u.value:status::STRING   AS status,
         u.value:notes::STRING    AS notes,
         u.value:evidence::STRING AS evidence
  FROM ANALYTICS.DBT_PROD.MART_AGENT_ORCHESTRATOR__EMAIL_EVENTS e
  JOIN ferg_loads fl ON e.LOAD_ID::STRING = fl.ID,
       LATERAL FLATTEN(input => TRY_PARSE_JSON(TO_VARCHAR(e.EMAIL_ANALYSIS_RESULT_JSON)):updates) u
  WHERE (e.EMAIL_DIRECTION = 'INBOUND' OR e.CODE = 'NEW_EMAIL')
    AND e.CREATED_AT >= '2026-07-06'
    AND u.value:poNumber IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY po_number ORDER BY e.CREATED_AT DESC) = 1
)
SELECT
  pu.po_number AS "PO Number",
  lp.logon     AS "Logon",
  lp.vendor    AS "Vendor",
  ''           AS "Buyer",     -- BLOCKED: no buyer field in any source yet
  CASE pu.status
    WHEN 'NOT_FOUND'     THEN 'Vendor has no record of PO'
    WHEN 'NEEDS_PO_COPY' THEN 'Vendor requested a copy of the PO'
  END          AS "Detail",
  COALESCE(pu.notes, pu.evidence) AS "Context",
  pu.responder AS "Vendor Contact",
  TO_CHAR(pu.response_at, 'MM/DD/YYYY') AS "Response Date"
FROM po_updates pu
JOIN load_pos lp ON lp.po_number = pu.po_number
WHERE pu.status IN ('NOT_FOUND', 'NEEDS_PO_COPY')
  [[ AND lp.logon = {{logon}} ]]
ORDER BY lp.logon, pu.po_number;


-- ===========================================================================
-- REPORT 4 — NOT SHIPPED  (ERP upload, one file per logon)
-- Columns: PO, line item, latest expected date.
-- ETA rule: prefer classifier-normalized etaDate (only set for unambiguous
-- dates like "8-26"); else normalize common fuzzy etaText patterns in SQL
-- ("mid-August" -> Aug 15, "early/beginning" -> 5th, "late/end of" -> 25th);
-- else fall back to load customData updatedArrivalDate; raw text is included
-- in its own column so nothing is silently dropped.
-- ===========================================================================
WITH po_workflows AS (
  SELECT wa.AGENTID
  FROM PROD.AGENT_REGISTRY.WORKFLOWAGENT wa
  JOIN PROD.AGENT_REGISTRY.WORKFLOW w ON w.ID = wa.WORKFLOWID
  WHERE w.NAME ILIKE 'PO Visibility%'
), ferg_loads AS (
  SELECT l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
  FROM PROD.LOAD.LOAD l
  JOIN PROD.AGENT_PLATFORM.WORKFLOWSTATE ws ON ws.ENTITYID = l.ID AND ws.ENTITY = 'LOAD'
  JOIN po_workflows pw ON pw.AGENTID = ws.AGENTID
  WHERE l.BROKERAGEKEY = 'ferguson'
    AND l.BROKERAGELOADID NOT ILIKE 'test%' AND l.BROKERAGELOADID NOT ILIKE 'MOCK%'
  GROUP BY l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
), load_lines AS (
  SELECT COALESCE(po.value:account::STRING, fl.CUSTOMDATA:account::STRING) AS logon,
         UPPER(TRIM(po.value:poNumber::STRING)) AS po_number,
         po.value:updatedArrivalDate::STRING AS erp_arrival_date,
         li.value:poLine::STRING AS line_number,
         li.value:alt1::STRING   AS alt1
  FROM ferg_loads fl,
       LATERAL FLATTEN(input => fl.CUSTOMDATA:purchaseOrders) po,
       LATERAL FLATTEN(input => po.value:lineItems, OUTER => TRUE) li
  WHERE po.value:poNumber IS NOT NULL
), po_updates AS (
  SELECT e.CREATED_AT AS response_at,
         UPPER(TRIM(u.value:poNumber::STRING)) AS po_number,
         u.value:status::STRING         AS status,
         u.value:etaDate::STRING        AS eta_date,
         u.value:etaText::STRING        AS eta_text,
         u.value:shipDate::STRING       AS ship_date,
         u.value:lineIdentifier::STRING AS line_identifier
  FROM ANALYTICS.DBT_PROD.MART_AGENT_ORCHESTRATOR__EMAIL_EVENTS e
  JOIN ferg_loads fl ON e.LOAD_ID::STRING = fl.ID,
       LATERAL FLATTEN(input => TRY_PARSE_JSON(TO_VARCHAR(e.EMAIL_ANALYSIS_RESULT_JSON)):updates) u
  WHERE (e.EMAIL_DIRECTION = 'INBOUND' OR e.CODE = 'NEW_EMAIL')
    AND e.CREATED_AT >= '2026-07-06'
    AND u.value:poNumber IS NOT NULL
), line_rows AS (
  SELECT pu.*, ll.logon, ll.line_number, ll.alt1, ll.erp_arrival_date
  FROM po_updates pu
  JOIN load_lines ll ON ll.po_number = pu.po_number
  WHERE pu.line_identifier IS NULL
     OR UPPER(TRIM(pu.line_identifier)) IN
        (UPPER(TRIM(COALESCE(ll.alt1, ''))), UPPER(TRIM(COALESCE(ll.line_number, ''))))
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY ll.logon, pu.po_number, ll.line_number ORDER BY pu.response_at DESC) = 1
)
SELECT
  po_number AS "PO Number",
  line_number AS "Line Item",
  TO_CHAR(COALESCE(
    TRY_TO_DATE(eta_date),                                -- classifier-normalized exact ETA
    -- fuzzy month phrases -> anchored day-of-month
    CASE
      WHEN REGEXP_SUBSTR(LOWER(eta_text),
        'january|february|march|april|may|june|july|august|september|october|november|december') IS NOT NULL
      THEN TRY_TO_DATE(
             YEAR(CURRENT_DATE())::STRING || ' ' ||
             REGEXP_SUBSTR(LOWER(eta_text),
               'january|february|march|april|may|june|july|august|september|october|november|december') || ' ' ||
             CASE
               WHEN LOWER(eta_text) LIKE '%mid%'                                    THEN '15'
               WHEN LOWER(eta_text) LIKE '%early%' OR LOWER(eta_text) LIKE '%beginning%'
                 OR LOWER(eta_text) LIKE '%first week%'                             THEN '05'
               WHEN LOWER(eta_text) LIKE '%late%' OR LOWER(eta_text) LIKE '%end%'   THEN '25'
               ELSE '15'                                    -- bare month -> mid-month
             END,
             'YYYY MMMM DD')
    END,
    DATEADD('day', 3, TRY_TO_DATE(ship_date)),             -- claimed future ship date + 3
    TRY_TO_DATE(erp_arrival_date)                          -- Ferguson's own ERP arrival date
  ), 'MM/DD/YYYY')  AS "Latest Expected Date",
  eta_text          AS "ETA As Stated By Vendor"           -- raw text, for review / unparseable cases
FROM line_rows
WHERE status = 'NOT_SHIPPED'
  [[ AND logon = {{logon}} ]]
ORDER BY po_number, TRY_TO_NUMBER(line_number);


-- ===========================================================================
-- REPORT 5 — CANCELLED  (ERP upload, one file per logon)
-- Columns: PO, line, status — for Trilogy cleanup.
-- CANCELLED is a first-class status since 2026-07-06 (33 updates in the first
-- week); no exceptionReason dependency.
-- ===========================================================================
WITH po_workflows AS (
  SELECT wa.AGENTID
  FROM PROD.AGENT_REGISTRY.WORKFLOWAGENT wa
  JOIN PROD.AGENT_REGISTRY.WORKFLOW w ON w.ID = wa.WORKFLOWID
  WHERE w.NAME ILIKE 'PO Visibility%'
), ferg_loads AS (
  SELECT l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
  FROM PROD.LOAD.LOAD l
  JOIN PROD.AGENT_PLATFORM.WORKFLOWSTATE ws ON ws.ENTITYID = l.ID AND ws.ENTITY = 'LOAD'
  JOIN po_workflows pw ON pw.AGENTID = ws.AGENTID
  WHERE l.BROKERAGEKEY = 'ferguson'
    AND l.BROKERAGELOADID NOT ILIKE 'test%' AND l.BROKERAGELOADID NOT ILIKE 'MOCK%'
  GROUP BY l.ID, l.CUSTOMERNAME, l.CUSTOMDATA
), load_lines AS (
  SELECT COALESCE(po.value:account::STRING, fl.CUSTOMDATA:account::STRING) AS logon,
         UPPER(TRIM(po.value:poNumber::STRING)) AS po_number,
         li.value:poLine::STRING AS line_number,
         li.value:alt1::STRING   AS alt1
  FROM ferg_loads fl,
       LATERAL FLATTEN(input => fl.CUSTOMDATA:purchaseOrders) po,
       LATERAL FLATTEN(input => po.value:lineItems, OUTER => TRUE) li
  WHERE po.value:poNumber IS NOT NULL
), po_updates AS (
  SELECT e.CREATED_AT AS response_at,
         UPPER(TRIM(u.value:poNumber::STRING)) AS po_number,
         u.value:status::STRING         AS status,
         u.value:notes::STRING          AS notes,
         u.value:lineIdentifier::STRING AS line_identifier
  FROM ANALYTICS.DBT_PROD.MART_AGENT_ORCHESTRATOR__EMAIL_EVENTS e
  JOIN ferg_loads fl ON e.LOAD_ID::STRING = fl.ID,
       LATERAL FLATTEN(input => TRY_PARSE_JSON(TO_VARCHAR(e.EMAIL_ANALYSIS_RESULT_JSON)):updates) u
  WHERE (e.EMAIL_DIRECTION = 'INBOUND' OR e.CODE = 'NEW_EMAIL')
    AND e.CREATED_AT >= '2026-07-06'
    AND u.value:poNumber IS NOT NULL
), line_rows AS (
  SELECT pu.*, ll.logon, ll.line_number, ll.alt1
  FROM po_updates pu
  JOIN load_lines ll ON ll.po_number = pu.po_number
  WHERE pu.line_identifier IS NULL
     OR UPPER(TRIM(pu.line_identifier)) IN
        (UPPER(TRIM(COALESCE(ll.alt1, ''))), UPPER(TRIM(COALESCE(ll.line_number, ''))))
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY ll.logon, pu.po_number, ll.line_number ORDER BY pu.response_at DESC) = 1
)
SELECT
  po_number   AS "PO Number",
  line_number AS "Line Item",
  'CANCELLED' AS "Status",
  notes       AS "Notes"
FROM line_rows
WHERE status = 'CANCELLED'
  [[ AND logon = {{logon}} ]]
ORDER BY po_number, TRY_TO_NUMBER(line_number);


-- ===========================================================================
-- REPORT 6 — VENDOR NEVER RESPONDED  (weekly, review-oriented)
-- Columns: vendor contact + domain, affected POs (with logon), first/last
--          outreach, outreach count — threads past the grace period with no
--          non-bounce inbound reply.
-- Source: outbound-vs-inbound thread join on the email-events mart (same
-- pattern as the existing "WISMO Custom - Non-Responder Vendor Domains" card).
-- {{grace_days}} — number variable; SET A DEFAULT OF 7 in the Metabase
-- variable sidebar (unset required variables error in Metabase).
-- ===========================================================================
WITH po_workflows AS (
  SELECT wa.AGENTID
  FROM PROD.AGENT_REGISTRY.WORKFLOWAGENT wa
  JOIN PROD.AGENT_REGISTRY.WORKFLOW w ON w.ID = wa.WORKFLOWID
  WHERE w.NAME ILIKE 'PO Visibility%'
), ferg_loads AS (
  SELECT l.ID, l.CUSTOMERNAME,
         ARRAY_AGG(DISTINCT COALESCE(po.value:account::STRING, l.CUSTOMDATA:account::STRING)
                   || ' / ' || po.value:poNumber::STRING) AS logon_pos
  FROM PROD.LOAD.LOAD l
  JOIN PROD.AGENT_PLATFORM.WORKFLOWSTATE ws ON ws.ENTITYID = l.ID AND ws.ENTITY = 'LOAD'
  JOIN po_workflows pw ON pw.AGENTID = ws.AGENTID,
       LATERAL FLATTEN(input => l.CUSTOMDATA:purchaseOrders) po
  WHERE l.BROKERAGEKEY = 'ferguson'
    AND l.BROKERAGELOADID NOT ILIKE 'test%' AND l.BROKERAGELOADID NOT ILIKE 'MOCK%'
    AND po.value:poNumber IS NOT NULL
  GROUP BY l.ID, l.CUSTOMERNAME
), emails AS (
  SELECT fl.ID AS load_id, fl.CUSTOMERNAME AS vendor, fl.logon_pos,
         e.THREAD_ID, e.CREATED_AT, e.TO_ADDRESS, e.FROM_ADDRESS, e.EMAIL_SUBJECT,
         CASE WHEN e.EMAIL_DIRECTION = 'OUTBOUND' OR e.CODE IN ('SEND_EMAIL','SENT_EMAIL') THEN 'OUT'
              WHEN e.EMAIL_DIRECTION = 'INBOUND'  OR e.CODE = 'NEW_EMAIL' THEN 'IN' END AS dir,
         CASE WHEN COALESCE(e.FROM_ADDRESS,'') ILIKE '%mailer-daemon%'
                OR COALESCE(e.FROM_ADDRESS,'') ILIKE '%postmaster%'
                OR COALESCE(e.EMAIL_SUBJECT,'') ILIKE '%undeliverable%'
                OR COALESCE(e.EMAIL_SUBJECT,'') ILIKE '%delivery status notification%'
                OR COALESCE(e.EMAIL_SUBJECT,'') ILIKE '%delivery has failed%'
              THEN 1 ELSE 0 END AS is_bounce
  FROM ANALYTICS.DBT_PROD.MART_AGENT_ORCHESTRATOR__EMAIL_EVENTS e
  JOIN ferg_loads fl ON e.LOAD_ID::STRING = fl.ID
), threads AS (
  SELECT load_id, vendor, logon_pos, THREAD_ID,
         MIN(CASE WHEN dir = 'OUT' THEN CREATED_AT END) AS first_out,
         MAX(CASE WHEN dir = 'OUT' THEN CREATED_AT END) AS last_out,
         COUNT(CASE WHEN dir = 'OUT' THEN 1 END)        AS outreach_count,
         MAX(CASE WHEN dir = 'IN' AND is_bounce = 0 THEN 1 ELSE 0 END) AS responded,
         MAX(CASE WHEN dir = 'IN' AND is_bounce = 1 THEN 1 ELSE 0 END) AS bounced,
         -- prefer a non-Ferguson recipient: some outreach goes to the Ferguson
         -- buyer (@ferguson.com), which is not a vendor contact to repair
         COALESCE(
           MIN(CASE WHEN dir = 'OUT' AND TO_ADDRESS NOT ILIKE '%@ferguson.com'
                    THEN LOWER(TO_ADDRESS) END),
           MIN(CASE WHEN dir = 'OUT' THEN LOWER(TO_ADDRESS) END)
         ) AS vendor_contact
  FROM emails
  GROUP BY 1, 2, 3, 4
  HAVING first_out IS NOT NULL
)
SELECT
  vendor                                        AS "Vendor",
  vendor_contact                                AS "Vendor Contact",
  SPLIT_PART(vendor_contact, '@', 2)            AS "Vendor Domain",
  ARRAY_TO_STRING(logon_pos, '; ')              AS "Logon / POs On Load",
  TO_CHAR(first_out, 'MM/DD/YYYY')              AS "First Outreach",
  TO_CHAR(last_out,  'MM/DD/YYYY')              AS "Last Outreach",
  outreach_count                                AS "Outreach Emails Sent",
  CASE WHEN bounced = 1 THEN 'YES' ELSE 'NO' END AS "Bounced"
FROM threads
WHERE responded = 0
  AND first_out < DATEADD('day', -{{grace_days}}, CURRENT_DATE())
ORDER BY outreach_count DESC, vendor, first_out;
