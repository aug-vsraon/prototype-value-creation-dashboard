import { NextResponse } from "next/server"
import { createSnowflakeClient } from "@/lib/snowflake"
import { buildRoiQuery } from "@/lib/roi-query"
import type {
  DashboardData,
  WeeklyStackedEntry,
  WorkflowCard,
  TrendResult,
  ActivityTotals,
} from "@/lib/dashboard-data-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

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
  POD_COLLECTED_WITHIN_3_DAYS: number
  POD_COLLECTED_PERCENT: number
}

interface TtOutcomeRow {
  NUM_ACTIONED_LOADS: number
  TRANSIT_UPDATES_SENT: number
  STOP_UPDATES_SENT: number
}

interface CsOutcomeRow {
  NUM_BIDS_COLLECTED: number
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

  // Two connections: sf1 for ROI activity queries, sf2 for outcome mart tables (in parallel)
  const [sf1, sf2] = await Promise.all([createSnowflakeClient(), createSnowflakeClient()])
  try {
    // -----------------------------------------------------------------------
    // Run ROI queries on sf1, outcome mart queries on sf2 (in parallel)
    // -----------------------------------------------------------------------
    // Extend date range 8 weeks back from `from` for trend computation
    // (avoids scanning all-time history — only need last 8 weeks before the range)
    const trendFrom = new Date(from)
    trendFrom.setDate(trendFrom.getDate() - 8 * 7)
    const trendFromStr = trendFrom.toISOString().slice(0, 10)

    const filteredQuery = buildRoiQuery({ brokerageKey: brokerage, dateFrom: from, dateTo: to })
    const trendQuery = buildRoiQuery({ brokerageKey: brokerage, dateFrom: trendFromStr, dateTo: to })

    const roiPromise = (async () => {
      const roiFiltered = await sf1.query<RoiRow>(filteredQuery.sql, filteredQuery.binds)
      const roiTrend = await sf1.query<RoiRow>(trendQuery.sql, trendQuery.binds)
      // Derive MAX_DATE from trend results
      const MAX_DATE = roiTrend.length > 0
        ? roiTrend.reduce((max, r) => (r.WEEK_START > max ? r.WEEK_START : max), roiTrend[0].WEEK_START)
        : new Date().toISOString().slice(0, 10)
      return { roiFiltered, roiTrend, MAX_DATE }
    })()

    const outcomePromise = (async () => {
      // All three outcome queries use pre-aggregated daily mart tables.
      // Run them in parallel on sf2 for maximum speed.
      const [dcOutcomeRows, ttOutcomeRows, csOutcomeRows] = await Promise.all([
        // Document Collection
        sf2.query<DcOutcomeRow>(
          `SELECT
            COALESCE(SUM(POD_COLLECTED_WITHIN_3_DAYS), 0) AS POD_COLLECTED_WITHIN_3_DAYS,
            CASE WHEN SUM(NUM_LOADS_WITH_OUTREACH) > 0
              THEN ROUND(SUM(POD_COLLECTED_WITHIN_3_DAYS) / SUM(NUM_LOADS_WITH_OUTREACH), 3) * 100.0
              ELSE 0 END AS POD_COLLECTED_PERCENT
          FROM dbt_prod.mart_reporting__pod_collection_business_impact
          WHERE REPORTING_DATE >= ? AND REPORTING_DATE < ?
            AND BROKERAGE_KEY = ?`,
          [from, to, brokerage],
        ),
        // Track & Trace
        sf2.query<TtOutcomeRow>(
          `SELECT
            COALESCE(SUM(NUM_ACTIONED_LOADS), 0) AS NUM_ACTIONED_LOADS,
            COALESCE(SUM(TRANSIT_UPDATES_SENT), 0) AS TRANSIT_UPDATES_SENT,
            COALESCE(SUM(STOP_UPDATES_SENT), 0) AS STOP_UPDATES_SENT
          FROM dbt_prod.mart_reporting__track_and_trace_business_impact
          WHERE REPORTING_DATE >= ? AND REPORTING_DATE < ?
            AND BROKERAGE_KEY = ?`,
          [from, to, brokerage],
        ),
        // Carrier Selection (bids + booked in one query)
        sf2.query<CsOutcomeRow>(
          `SELECT
            COALESCE(SUM(NUM_BIDS_COLLECTED), 0) AS NUM_BIDS_COLLECTED,
            COALESCE(SUM(NUM_LOADS_BOOKED_FROM_BIDS), 0) AS NUM_LOADS_BOOKED_FROM_BIDS
          FROM dbt_prod.mart_reporting__carrier_selection_business_impact
          WHERE REPORTING_DATE >= ? AND REPORTING_DATE < ?
            AND BROKERAGE_KEY = ?`,
          [from, to, brokerage],
        ),
      ])

      return { dcOutcomeRows, ttOutcomeRows, csOutcomeRows }
    })()

    // Await both connection groups in parallel
    const [roiResults, outcomeResults] = await Promise.all([roiPromise, outcomePromise])
    const { roiFiltered, roiTrend, MAX_DATE } = roiResults
    const { dcOutcomeRows, ttOutcomeRows, csOutcomeRows } = outcomeResults

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

    // Extended-range map for trends (8 weeks before `from` through `to`)
    const trendMap = buildMap(roiTrend)
    const trendWeeks = Array.from(trendMap.keys()).sort()

    // -----------------------------------------------------------------------
    // Weekly stacked entries (filtered date range)
    // -----------------------------------------------------------------------
    const interactions = (r: RoiRow | undefined) =>
      r ? (r.OUTBOUND_CALLS + r.INBOUND_CALLS) + r.EMAILS_SENT + r.TEXTS_SENT + r.TMS_UPDATES : 0

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
        t.activity.emails += row.EMAILS_SENT
        t.activity.texts += row.TEXTS_SENT
        t.activity.tmsUpdates += row.TMS_UPDATES
      }
    }

    // -----------------------------------------------------------------------
    // Trends (all weeks, not filtered)
    // -----------------------------------------------------------------------
    const weeklyHrs: Record<string, number[]> = {}
    for (const key of ALL_WORKFLOW_KEYS) weeklyHrs[key] = []
    for (const week of trendWeeks) {
      const wfMap = trendMap.get(week)!
      for (const key of ALL_WORKFLOW_KEYS) {
        weeklyHrs[key].push(wfMap.get(key)?.HOURS_SAVED ?? 0)
      }
    }

    // -----------------------------------------------------------------------
    // Outcome values from dedicated queries
    // -----------------------------------------------------------------------
    const dcOutcome = dcOutcomeRows[0] ?? { POD_COLLECTED_WITHIN_3_DAYS: 0, POD_COLLECTED_PERCENT: 0 }
    const ttOutcome = ttOutcomeRows[0] ?? { NUM_ACTIONED_LOADS: 0, TRANSIT_UPDATES_SENT: 0, STOP_UPDATES_SENT: 0 }
    const csOutcome = csOutcomeRows[0] ?? { NUM_BIDS_COLLECTED: 0, NUM_LOADS_BOOKED_FROM_BIDS: 0 }

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
      dc: [dcOutcome.POD_COLLECTED_WITHIN_3_DAYS, dcOutcome.POD_COLLECTED_PERCENT],
      tt: [ttOutcome.TRANSIT_UPDATES_SENT + ttOutcome.STOP_UPDATES_SENT, ttOutcome.NUM_ACTIONED_LOADS],
      cs: [csOutcome.NUM_BIDS_COLLECTED, csOutcome.NUM_LOADS_BOOKED_FROM_BIDS],
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
