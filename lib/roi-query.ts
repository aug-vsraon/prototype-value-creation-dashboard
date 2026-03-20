// TEMPORARY: Remove when dbt mart MART_REPORTING__ROI_BY_CUSTOMER_AND_WORKFLOW
// is updated with value-creation filtering (call outcomes, outbound-only emails/texts).
//
// This module replicates the mart query logic with three changes:
// 1. Calls: exclude NOT_STARTED, FAILED, CALL_DISCONNECTED, NO_OUTCOME,
//    ATTEMPT_FAILED, WRONG_NUMBER, INVALID_NUMBER, NO_ANSWER
// 2. Emails/Texts: outbound only (SENT / SENT_EXTERNAL_TEXT_MESSAGE)
// 3. Hours saved: recomputed from filtered counts

export function buildRoiQuery(opts: {
  brokerageKey: string
  dateFrom?: string
  dateTo?: string
}): { sql: string; binds: (string | number)[] } {
  const binds: (string | number)[] = []
  const hasDateFilter = !!(opts.dateFrom && opts.dateTo)

  // Helper to push brokerage + optional date binds and return the WHERE snippet
  function brokerageAndDateFilter(dateColumn: string): string {
    binds.push(opts.brokerageKey)
    let clause = ""
    if (hasDateFilter) {
      binds.push(opts.dateFrom!, opts.dateTo!)
      clause = `AND ${dateColumn} >= ? AND ${dateColumn} < ?`
    }
    return clause
  }

  const callDateFilter = brokerageAndDateFilter("c.created_at")
  const emailDateFilter = brokerageAndDateFilter("e.created_at")
  const textDateFilter = brokerageAndDateFilter("e.created_at")
  const tmsDateFilter = brokerageAndDateFilter("e.created_at")

  const sql = `
WITH filtered_calls AS (
  SELECT
    TO_CHAR(DATE_TRUNC('WEEK', c.created_at), 'YYYY-MM-DD') AS WEEK_START,
    CASE c.agent
      WHEN 'CARRIER_SELECTION_AGENT' THEN 'carrier_selection'
      WHEN 'POD_COLLECTION_AGENT' THEN 'pod_collection'
      WHEN 'TRACK_AND_TRACE_AGENT' THEN 'track_and_trace'
      WHEN 'LOAD_BUILDING_AGENT' THEN 'load_building'
      WHEN 'LOAD_SCHEDULING_AGENT' THEN 'scheduling'
    END AS WORKFLOW,
    c.call_id,
    c.call_direction
  FROM raw_voice__call c
  LEFT JOIN int_global_config__excluded_brokers ex ON c.brokerage_key = ex.brokerage_key
  LEFT JOIN int_voice__call_status_events cse ON c.call_id = cse.call_id
  LEFT JOIN int_call_analyzer__call_analysis_parsed ca ON c.call_id = ca.call_id
  WHERE ex.brokerage_key IS NULL
    AND c.brokerage_key = ?
    ${callDateFilter}
    AND c.agent IN (
      'CARRIER_SELECTION_AGENT', 'POD_COLLECTION_AGENT',
      'TRACK_AND_TRACE_AGENT', 'LOAD_BUILDING_AGENT', 'LOAD_SCHEDULING_AGENT'
    )
    AND COALESCE(cse.final_call_status, '') NOT IN ('NOT_STARTED', 'FAILED')
    AND COALESCE(ca.call_outcome, '') NOT IN (
      'CALL_DISCONNECTED', 'NO_OUTCOME', 'NOT_STARTED',
      'ATTEMPT_FAILED', 'WRONG_NUMBER', 'INVALID_NUMBER', 'NO_ANSWER'
    )
),
call_data AS (
  SELECT
    fc.WEEK_START,
    fc.WORKFLOW,
    fc.call_id,
    fc.call_direction,
    COALESCE(MIN(cl.duration_seconds), 0) AS call_length_seconds
  FROM filtered_calls fc
  LEFT JOIN raw_call_analyzer__main_call_metrics cl ON fc.call_id = cl.call_id
  GROUP BY 1, 2, 3, 4
),
call_summary AS (
  SELECT
    WEEK_START,
    WORKFLOW,
    COUNT(DISTINCT CASE WHEN call_direction = 'OUTBOUND' THEN call_id END) AS outbound_calls,
    ROUND(SUM(CASE WHEN call_direction = 'OUTBOUND' THEN call_length_seconds ELSE 0 END) / 3600.0, 1) AS outbound_call_hours,
    COUNT(DISTINCT CASE WHEN call_direction = 'INBOUND' THEN call_id END) AS inbound_calls,
    ROUND(SUM(CASE WHEN call_direction = 'INBOUND' THEN call_length_seconds ELSE 0 END) / 3600.0, 1) AS inbound_call_hours
  FROM call_data
  GROUP BY 1, 2
),
email_data AS (
  SELECT
    TO_CHAR(DATE_TRUNC('WEEK', e.created_at), 'YYYY-MM-DD') AS WEEK_START,
    e.workflow AS WORKFLOW,
    COUNT(DISTINCT e.id) AS emails_sent
  FROM int_agent_orchestrator__email_events e
  LEFT JOIN int_global_config__excluded_brokers ex ON e.brokerage_key = ex.brokerage_key
  WHERE ex.brokerage_key IS NULL
    AND e.brokerage_key = ?
    ${emailDateFilter}
    AND e.workflow != 'unknown'
    AND e.email_direction = 'SENT'
  GROUP BY 1, 2
),
text_data AS (
  SELECT
    TO_CHAR(DATE_TRUNC('WEEK', e.created_at), 'YYYY-MM-DD') AS WEEK_START,
    e.workflow AS WORKFLOW,
    COUNT(DISTINCT e.id) AS texts_sent
  FROM int_agent_orchestrator__events_flattened e
  LEFT JOIN int_global_config__excluded_brokers ex ON e.brokerage_key = ex.brokerage_key
  WHERE ex.brokerage_key IS NULL
    AND e.brokerage_key = ?
    ${textDateFilter}
    AND e.workflow != 'unknown'
    AND e.code = 'SENT_EXTERNAL_TEXT_MESSAGE'
  GROUP BY 1, 2
),
tms_data AS (
  SELECT
    TO_CHAR(DATE_TRUNC('WEEK', e.created_at), 'YYYY-MM-DD') AS WEEK_START,
    e.workflow AS WORKFLOW,
    COUNT(DISTINCT e.id) AS tms_updates
  FROM int_agent_orchestrator__events_flattened e
  LEFT JOIN int_global_config__excluded_brokers ex ON e.brokerage_key = ex.brokerage_key
  WHERE ex.brokerage_key IS NULL
    AND e.brokerage_key = ?
    ${tmsDateFilter}
    AND e.workflow != 'unknown'
    AND e.code IN ('LOAD_ACCESSORIAL_UPDATE', 'STOP_UPDATE', 'TRANSIT_UPDATE')
  GROUP BY 1, 2
),
all_keys AS (
  SELECT DISTINCT WEEK_START, WORKFLOW FROM call_summary
  UNION SELECT DISTINCT WEEK_START, WORKFLOW FROM email_data
  UNION SELECT DISTINCT WEEK_START, WORKFLOW FROM text_data
  UNION SELECT DISTINCT WEEK_START, WORKFLOW FROM tms_data
)
SELECT
  k.WEEK_START,
  k.WORKFLOW,
  ROUND(
    (0.5 * COALESCE(e.emails_sent, 0) + 0.5 * COALESCE(t.texts_sent, 0) + 1 * COALESCE(tm.tms_updates, 0)) / 60.0
    + COALESCE(c.outbound_call_hours, 0)
    + COALESCE(c.inbound_call_hours, 0),
    1
  ) AS HOURS_SAVED,
  COALESCE(c.outbound_calls, 0) AS OUTBOUND_CALLS,
  COALESCE(c.inbound_calls, 0) AS INBOUND_CALLS,
  COALESCE(e.emails_sent, 0) AS EMAILS_SENT,
  0 AS EMAILS_RECEIVED,
  COALESCE(t.texts_sent, 0) AS TEXTS_SENT,
  0 AS TEXTS_RECEIVED,
  COALESCE(tm.tms_updates, 0) AS TMS_UPDATES
FROM all_keys k
LEFT JOIN call_summary c ON k.WEEK_START = c.WEEK_START AND k.WORKFLOW = c.WORKFLOW
LEFT JOIN email_data e ON k.WEEK_START = e.WEEK_START AND k.WORKFLOW = e.WORKFLOW
LEFT JOIN text_data t ON k.WEEK_START = t.WEEK_START AND k.WORKFLOW = t.WORKFLOW
LEFT JOIN tms_data tm ON k.WEEK_START = tm.WEEK_START AND k.WORKFLOW = tm.WORKFLOW
ORDER BY k.WEEK_START, k.WORKFLOW`

  return { sql, binds }
}
