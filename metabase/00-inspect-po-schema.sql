-- ============================================================================
-- STEP 0 — RUN THIS FIRST in Metabase (Snowflake connection).
--
-- Purpose: confirm the real JSON shape of DATA:emailAnalysisResult:purchaseOrders[]
-- so the field paths used in ferguson-po-reports.sql can be corrected.
--
-- Nothing downstream is trustworthy until the field names below are verified
-- against actual rows. The report SQL uses best-guess paths (marked "ASSUMED")
-- that almost certainly need renaming once you see the output of this query.
-- ============================================================================

-- 0a) One raw PO object, pretty-printed. Read the keys off this.
SELECT
  e.CREATED_AT,
  po.INDEX                                   AS po_index,
  po.VALUE                                   AS purchase_order_json  -- <-- inspect every key here
FROM AGENT_ORCHESTRATOR.EVENT e,
     LATERAL FLATTEN(input => e.DATA:emailAnalysisResult:purchaseOrders) po
WHERE e.CODE = 'NEW_EMAIL'
  AND e.BROKERAGEKEY = 'ferguson'
  AND e.DATA:emailAnalysisWorkflowId = '01kvrkq82ghcxgj2ba3nxpq64y'
ORDER BY e.CREATED_AT DESC
LIMIT 25;

-- 0b) Distinct status values actually present (confirms the bucket mapping).
--     Expected from staging: DELIVERED, EXCEPTION, OPEN, UNKNOWN — but confirm,
--     and watch for a SHIPPED/CANCELLED/BACKORDER value or an exceptionReason key.
SELECT
  po.VALUE:status::string        AS status,          -- ASSUMED key: "status"
  po.VALUE:exceptionReason::string AS exception_reason, -- may not exist yet (classifier dependency)
  COUNT(*)                       AS n
FROM AGENT_ORCHESTRATOR.EVENT e,
     LATERAL FLATTEN(input => e.DATA:emailAnalysisResult:purchaseOrders) po
WHERE e.CODE = 'NEW_EMAIL'
  AND e.BROKERAGEKEY = 'ferguson'
  AND e.DATA:emailAnalysisWorkflowId = '01kvrkq82ghcxgj2ba3nxpq64y'
GROUP BY 1, 2
ORDER BY n DESC;

-- 0c) Confirm the optional reference join key shape (original PO date etc).
SELECT l.CUSTOMDATA:purchaseOrder AS load_po_json
FROM LOAD.LOAD l
WHERE l.CUSTOMDATA:purchaseOrder IS NOT NULL
LIMIT 10;
