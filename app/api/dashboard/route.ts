import { NextResponse } from "next/server"
import { createSnowflakeClient } from "@/lib/snowflake"
import type {
  DashboardData,
  WeeklyStackedEntry,
  WorkflowCard,
  TrendResult,
  ActivityTotals,
} from "@/lib/dashboard-data-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

// ---------------------------------------------------------------------------
// Snowflake workflow key → dashboard key
// ---------------------------------------------------------------------------
const WORKFLOW_KEY_MAP: Record<string, string> = {
  track_and_trace: "tt",
  pod_collection: "dc",
  carrier_selection: "cs",
  load_building: "lb",
  scheduling: "as",
}

const WORKFLOW_COLORS: Record<string, string> = {
  dc: "#1D9E75",
  tt: "#378ADD",
  cs: "#7F77DD",
  lb: "#E8913A",
  as: "#E05D9E",
}

const WORKFLOW_NAMES: Record<string, string> = {
  dc: "Document Collection",
  tt: "Track & Trace",
  cs: "Carrier Selection",
  lb: "Load Building",
  as: "Appointment Scheduling",
}

const WORKFLOW_OUTCOMES: Record<string, { label: string; format?: "pct" }[]> = {
  dc: [{ label: "PODs Collected" }, { label: "Collection Rate (\u22643 days)", format: "pct" }],
  tt: [{ label: "TMS Updates Posted" }, { label: "Loads Actioned" }],
  cs: [{ label: "Bids Collected" }, { label: "Loads Booked" }],
  lb: [{ label: "Loads Built" }, { label: "Tender Acceptance Rate", format: "pct" }],
  as: [{ label: "Appts Scheduled" }, { label: "On-Time Rate", format: "pct" }],
}

const ALL_WORKFLOW_KEYS = ["dc", "tt", "cs", "lb", "as"] as const

// ---------------------------------------------------------------------------
// Row types returned by Snowflake
// ---------------------------------------------------------------------------
interface RoiRow {
  WEEK_START: string
  WORKFLOW: string
  HOURS_SAVED: number
  OUTBOUND_CALLS: number
  INBOUND_CALLS: number
  EMAILS_SENT: number
  EMAILS_RECEIVED: number
  TEXTS_SENT: number
  TEXTS_RECEIVED: number
  TMS_UPDATES: number
}

interface DcOutcomeRow {
  POD_COLLECTED_WITH_3_DAYS: number
  POD_COLLECTED_PERCENT: number
}

interface TtOutcomeRow {
  NUM_ACTIONED_LOADS: number
  TRANSIT_UPDATES_SENT: number
  STOP_UPDATES_SENT: number
}

interface CsBidsRow {
  NUM_BIDS_COLLECTED: number
}

interface CsBookedRow {
  NUM_LOADS_BOOKED_FROM_BIDS: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatWeekLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[date.getMonth()]} ${date.getDate()}`
}

function formatPeriod(from: string, to: string): string {
  const fromYear = from.slice(0, 4)
  const toYear = to.slice(0, 4)
  if (fromYear === toYear) {
    return `${formatWeekLabel(from)} – ${formatWeekLabel(to)}, ${toYear}`
  }
  return `${formatWeekLabel(from)}, ${fromYear} – ${formatWeekLabel(to)}, ${toYear}`
}

function computeTrend(weeklyHours: number[]): TrendResult | null {
  if (weeklyHours.length < 8) return null
  const last4 = weeklyHours.slice(-4)
  const prior4 = weeklyHours.slice(-8, -4)
  const avgLast = last4.reduce((s, v) => s + v, 0) / 4
  const avgPrior = prior4.reduce((s, v) => s + v, 0) / 4
  if (avgPrior === 0) return null
  const pct = ((avgLast - avgPrior) / avgPrior) * 100
  if (Math.abs(pct) < 1) return { direction: "flat", pct: 0 }
  return { direction: pct > 0 ? "up" : "down", pct: Math.abs(Math.round(pct)) }
}

function titleCase(key: string): string {
  return key.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

// ---------------------------------------------------------------------------
// GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&brokerage=key
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const url = new URL(request.url)
  const from = url.searchParams.get("from") ?? "2026-02-09"
  const to = url.searchParams.get("to") ?? "2026-03-08"
  const brokerage = url.searchParams.get("brokerage") ?? "transportation-one"

  // Two connections for parallel query execution
  const [sf1, sf2] = await Promise.all([createSnowflakeClient(), createSnowflakeClient()])
  try {
    const roiSql = `SELECT
        TO_CHAR(DATE_TRUNC('WEEK', DATE), 'YYYY-MM-DD') AS WEEK_START,
        WORKFLOW,
        SUM(HOURS_SAVED) AS HOURS_SAVED,
        SUM(OUTBOUND_CALLS) AS OUTBOUND_CALLS,
        SUM(INBOUND_CALLS) AS INBOUND_CALLS,
        SUM(EMAILS_SENT) AS EMAILS_SENT,
        SUM(EMAILS_RECEIVED) AS EMAILS_RECEIVED,
        SUM(NUM_SENT_TEXTS) AS TEXTS_SENT,
        SUM(NUM_RECEIVED_TEXTS) AS TEXTS_RECEIVED,
        SUM(NUM_TMS_UPDATES_SENT) AS TMS_UPDATES
      FROM MART_REPORTING__ROI_BY_CUSTOMER_AND_WORKFLOW
      WHERE BROKERAGE_KEY = ?`

    // -----------------------------------------------------------------------
    // Run ROI queries on sf1, outcome queries on sf2 (in parallel)
    // -----------------------------------------------------------------------
    const roiPromise = (async () => {
      const roiFiltered = await sf1.query<RoiRow>(
        `${roiSql} AND DATE >= ? AND DATE < ?
        GROUP BY WEEK_START, WORKFLOW
        ORDER BY WEEK_START, WORKFLOW`,
        [brokerage, from, to],
      )
      const roiAll = await sf1.query<RoiRow>(
        `${roiSql}
        GROUP BY WEEK_START, WORKFLOW
        ORDER BY WEEK_START, WORKFLOW`,
        [brokerage],
      )
      const [{ MAX_DATE }] = await sf1.query<{ MAX_DATE: string }>(
        `SELECT TO_CHAR(MAX(DATE), 'YYYY-MM-DD') AS MAX_DATE
         FROM MART_REPORTING__ROI_BY_CUSTOMER_AND_WORKFLOW
         WHERE BROKERAGE_KEY = ?`,
        [brokerage],
      )
      return { roiFiltered, roiAll, MAX_DATE }
    })()

    const outcomePromise = (async () => {
      // Document Collection: PODs collected within 72h + collection rate
      const dcOutcomeRows = await sf2.query<DcOutcomeRow>(
      `SELECT
        SUM(CASE
          WHEN pod_collected_time >= INITIAL_OUTREACH_TIME
            AND pod_collected_time < INITIAL_OUTREACH_TIME + INTERVAL '72 hours'
          THEN 1 ELSE 0 END) AS POD_COLLECTED_WITH_3_DAYS,
        CASE WHEN COUNT(*) > 0
          THEN ROUND(
            SUM(CASE
              WHEN pod_collected_time >= INITIAL_OUTREACH_TIME
                AND pod_collected_time < INITIAL_OUTREACH_TIME + INTERVAL '72 hours'
              THEN 1 ELSE 0 END)
            / COUNT(*), 3) * 100.0
          ELSE 0 END AS POD_COLLECTED_PERCENT
      FROM mart_agent_orchestrator__pod_collection_outcomes oc
      LEFT JOIN int_global_config__excluded_brokers ex
        ON oc.brokerage_key = ex.brokerage_key
      WHERE oc.INITIAL_OUTREACH_TIME IS NOT NULL
        AND ex.brokerage_key IS NULL
        AND oc.INITIAL_OUTREACH_TIME >= ?
        AND oc.INITIAL_OUTREACH_TIME < ?
        AND oc.brokerage_key = ?`,
      [from, to, brokerage],
    )

    // Track & Trace: loads actioned + transit/stop updates
    // Matches Metabase logic: LEFT JOIN from billing loads to events,
    // GROUP BY e.load_id, then SUM(1) for actioned loads count
    const ttOutcomeRows = await sf2.query<TtOutcomeRow>(
      `WITH billed_loads AS (
        SELECT *
        FROM mart_agent_orchestrator__workflow_loads_for_billing
        WHERE workflow_name = 'TRACK_AND_TRACE'
          AND first_executed >= ?
          AND first_executed < ?
          AND brokerage_key = ?
      ),
      load_level_info AS (
        SELECT
          e.load_id,
          COUNT(DISTINCT CASE WHEN e.code = 'TRANSIT_UPDATE' THEN e.id END) AS transit_updates_sent,
          COUNT(DISTINCT CASE WHEN e.code = 'STOP_UPDATE' THEN e.id END) AS stop_updates_sent
        FROM billed_loads b
        LEFT JOIN INT_AGENT_ORCHESTRATOR__EVENTS_FLATTENED e
          ON b.load_id = e.load_id
          AND e.workflow = 'track_and_trace'
          AND e.created_at >= DATEADD('day', -7, ?::DATE)
          AND e.code IN ('STOP_UPDATE', 'TRANSIT_UPDATE', 'WORKFLOW_STATUS_UPDATE')
        GROUP BY 1
      )
      SELECT
        SUM(1) AS NUM_ACTIONED_LOADS,
        SUM(transit_updates_sent) AS TRANSIT_UPDATES_SENT,
        SUM(stop_updates_sent) AS STOP_UPDATES_SENT
      FROM load_level_info`,
      [from, to, brokerage, from],
    )

    // Carrier Selection — bids collected
    const csBidsRows = await sf2.query<CsBidsRow>(
      `SELECT COUNT(*) AS NUM_BIDS_COLLECTED
      FROM raw_carrier_selection__bid
      WHERE amount IS NOT NULL
        AND load_id IS NOT NULL
        AND (call_id IS NOT NULL OR email_thread_id IS NOT NULL)
        AND created_at >= ?
        AND created_at < ?
        AND brokerage_key = ?`,
      [from, to, brokerage],
    )

    // Carrier Selection — loads booked from bids (via MC number matching)
    // Date predicates pushed into CTEs to narrow scans on large tables
    const csBookedRows = await sf2.query<CsBookedRow>(
      `WITH mc_number_for_booked_load AS (
        SELECT
          cd.load_id,
          TO_VARCHAR(c.mc_number) AS booked_mc,
          MIN(cd.updated_at) AS first_booking_time,
          MIN(b.created_at) AS first_bid_that_is_booked
        FROM raw_load__carrier_details_log cd
        INNER JOIN raw_directory__carrier c ON cd.carrier_id = c.id
        INNER JOIN raw_carrier_selection__bid b
          ON cd.load_id::VARCHAR = b.load_id::VARCHAR
          AND c.mc_number::VARCHAR = b.carrier_mc_number::VARCHAR
          AND b.amount IS NOT NULL
        WHERE c.mc_number IS NOT NULL
          AND cd.updated_at >= ?
          AND cd.updated_at < ?
          AND b.created_at >= ?
          AND b.created_at < ?
        GROUP BY 1, 2
      ),
      all_records_with_booked_bid AS (
        SELECT load_id, first_booking_time, first_bid_that_is_booked
          FROM mc_number_for_booked_load
        UNION ALL
        SELECT load_id, first_booking_time, first_bid_that_is_booked
          FROM mc_number_for_booked_load
      ),
      booked_load_info AS (
        SELECT
          load_id,
          MIN(first_booking_time) AS first_booking_time
        FROM all_records_with_booked_bid
        GROUP BY 1
      )
      SELECT COUNT(*) AS NUM_LOADS_BOOKED_FROM_BIDS
      FROM booked_load_info b
      INNER JOIN raw_load__load l ON b.load_id = l.id
      WHERE b.first_booking_time >= ?
        AND b.first_booking_time < ?
        AND l.brokerage_key = ?`,
      [from, to, from, to, from, to, brokerage],
    )

      return { dcOutcomeRows, ttOutcomeRows, csBidsRows, csBookedRows }
    })()

    // Await both connection groups in parallel
    const [roiResults, outcomeResults] = await Promise.all([roiPromise, outcomePromise])
    const { roiFiltered, roiAll, MAX_DATE } = roiResults
    const { dcOutcomeRows, ttOutcomeRows, csBidsRows, csBookedRows } = outcomeResults

    // -----------------------------------------------------------------------
    // Build weekly maps
    // -----------------------------------------------------------------------
    const buildMap = (rows: RoiRow[]) => {
      const map = new Map<string, Map<string, RoiRow>>()
      for (const row of rows) {
        const wfKey = WORKFLOW_KEY_MAP[row.WORKFLOW]
        if (!wfKey) continue
        if (!map.has(row.WEEK_START)) map.set(row.WEEK_START, new Map())
        map.get(row.WEEK_START)!.set(wfKey, row)
      }
      return map
    }

    // Filtered map for display
    const filteredMap = buildMap(roiFiltered)
    const filteredWeeks = Array.from(filteredMap.keys()).sort()

    // All-time map for trends
    const allMap = buildMap(roiAll)
    const allWeeks = Array.from(allMap.keys()).sort()

    // -----------------------------------------------------------------------
    // Weekly stacked entries (filtered date range)
    // -----------------------------------------------------------------------
    const interactions = (r: RoiRow | undefined) =>
      r ? (r.OUTBOUND_CALLS + r.INBOUND_CALLS) + (r.EMAILS_SENT + r.EMAILS_RECEIVED) + (r.TEXTS_SENT + r.TEXTS_RECEIVED) + r.TMS_UPDATES : 0

    const weeklyStacked: WeeklyStackedEntry[] = filteredWeeks.map((week) => {
      const wfMap = filteredMap.get(week)!
      const hrs: Record<string, number> = {}
      let totalHrs = 0
      let totalInteractions = 0
      for (const key of ALL_WORKFLOW_KEYS) {
        const row = wfMap.get(key)
        hrs[key] = Math.round(row?.HOURS_SAVED ?? 0)
        totalHrs += row?.HOURS_SAVED ?? 0
        totalInteractions += interactions(row)
      }
      return {
        week: formatWeekLabel(week),
        weekIso: week,
        dc: hrs.dc, tt: hrs.tt, cs: hrs.cs, lb: hrs.lb, as: hrs.as,
        total: Math.round(totalHrs),
        interactions: totalInteractions,
      }
    })

    // -----------------------------------------------------------------------
    // Per-workflow totals (filtered range)
    // -----------------------------------------------------------------------
    const empty = (): { hours: number; activity: ActivityTotals } => ({
      hours: 0,
      activity: { calls: 0, emails: 0, texts: 0, tmsUpdates: 0 },
    })
    const wfTotals: Record<string, ReturnType<typeof empty>> = {}
    for (const key of ALL_WORKFLOW_KEYS) wfTotals[key] = empty()

    for (const week of filteredWeeks) {
      const wfMap = filteredMap.get(week)!
      for (const [key, row] of wfMap) {
        const t = wfTotals[key]
        if (!t) continue
        t.hours += row.HOURS_SAVED
        t.activity.calls += row.OUTBOUND_CALLS + row.INBOUND_CALLS
        t.activity.emails += row.EMAILS_SENT + row.EMAILS_RECEIVED
        t.activity.texts += row.TEXTS_SENT + row.TEXTS_RECEIVED
        t.activity.tmsUpdates += row.TMS_UPDATES
      }
    }

    // -----------------------------------------------------------------------
    // Trends (all weeks, not filtered)
    // -----------------------------------------------------------------------
    const weeklyHrs: Record<string, number[]> = {}
    for (const key of ALL_WORKFLOW_KEYS) weeklyHrs[key] = []
    for (const week of allWeeks) {
      const wfMap = allMap.get(week)!
      for (const key of ALL_WORKFLOW_KEYS) {
        weeklyHrs[key].push(wfMap.get(key)?.HOURS_SAVED ?? 0)
      }
    }

    // -----------------------------------------------------------------------
    // Outcome values from dedicated queries
    // -----------------------------------------------------------------------
    const dcOutcome = dcOutcomeRows[0] ?? { POD_COLLECTED_WITH_3_DAYS: 0, POD_COLLECTED_PERCENT: 0 }
    const ttOutcome = ttOutcomeRows[0] ?? { NUM_ACTIONED_LOADS: 0, TRANSIT_UPDATES_SENT: 0, STOP_UPDATES_SENT: 0 }
    const csBids = csBidsRows[0] ?? { NUM_BIDS_COLLECTED: 0 }
    const csBooked = csBookedRows[0] ?? { NUM_LOADS_BOOKED_FROM_BIDS: 0 }

    // -----------------------------------------------------------------------
    // Aggregate metrics
    // -----------------------------------------------------------------------
    const totalHours = ALL_WORKFLOW_KEYS.reduce((s, k) => s + wfTotals[k].hours, 0)
    const weeksCount = weeklyStacked.length
    const avgHoursPerWeek = weeksCount > 0 ? totalHours / weeksCount : 0

    let firstWeekPartial = false
    if (weeklyStacked.length > 1) {
      const restAvg =
        weeklyStacked.slice(1).reduce((s, w) => s + w.total, 0) / (weeklyStacked.length - 1)
      firstWeekPartial = weeklyStacked[0].total < restAvg * 0.3
    }

    const lastUpdated = MAX_DATE ?? new Date().toISOString().slice(0, 10)

    // -----------------------------------------------------------------------
    // Outcome values mapped to workflow card slots
    // -----------------------------------------------------------------------
    const outcomeValues: Record<string, number[]> = {
      dc: [dcOutcome.POD_COLLECTED_WITH_3_DAYS, dcOutcome.POD_COLLECTED_PERCENT],
      tt: [ttOutcome.TRANSIT_UPDATES_SENT + ttOutcome.STOP_UPDATES_SENT, ttOutcome.NUM_ACTIONED_LOADS],
      cs: [csBids.NUM_BIDS_COLLECTED, csBooked.NUM_LOADS_BOOKED_FROM_BIDS],
      lb: [0, 0],
      as: [0, 0],
    }

    // -----------------------------------------------------------------------
    // Workflow cards — active if they have any data, otherwise not live
    // -----------------------------------------------------------------------
    const workflows: WorkflowCard[] = ALL_WORKFLOW_KEYS.map((key) => {
      const t = wfTotals[key]
      const hasData = t.hours > 0 || t.activity.calls > 0 || t.activity.emails > 0 || t.activity.texts > 0 || t.activity.tmsUpdates > 0
      const outcomes = WORKFLOW_OUTCOMES[key] ?? []
      const values = outcomeValues[key] ?? [0, 0]
      return {
        key,
        name: WORKFLOW_NAMES[key] ?? key,
        status: hasData ? "Active" : "Not Live",
        color: WORKFLOW_COLORS[key] ?? "#888780",
        activity: t.activity,
        outcomes: outcomes.map((o, i) => ({ ...o, value: values[i] ?? 0 })),
        hoursSaved: t.hours,
        trend: computeTrend(weeklyHrs[key]),
      } satisfies WorkflowCard
    })

    // Add Quoting as always "Not Live" (no Snowflake data exists)
    workflows.push({
      key: "qt", name: "Quoting", status: "Not Live", color: "#A89F91",
      activity: { calls: 0, emails: 0, texts: 0, tmsUpdates: 0 },
      outcomes: [{ label: "Quotes Generated", value: 0 }, { label: "Quote-to-Book Rate", value: 0, format: "pct" }],
      hoursSaved: 0, trend: null,
    })

    const data: DashboardData = {
      brokerage: titleCase(brokerage),
      period: formatPeriod(from, to),
      lastUpdated,
      totalHours,
      avgHoursPerWeek,
      weeksCount,
      firstWeekPartial,
      weeklyStacked,
      workflows,
    }

    return NextResponse.json(data)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error("Dashboard API error:", msg, error)
    return NextResponse.json({ error: "Failed to fetch dashboard data", detail: msg }, { status: 500 })
  } finally {
    sf1.close()
    sf2.close()
  }
}
