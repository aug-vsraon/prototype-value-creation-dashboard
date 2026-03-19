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

interface LoadsRow {
  REPORTING_WEEK: string
  PODS_COLLECTED: number
  LOADS_ACTIONED: number
  BIDS_COLLECTED: number
  LOADS_BUILT: number
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

  const sf = await createSnowflakeClient()
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

    // Date-filtered query for display (day-level precision)
    const roiFiltered = await sf.query<RoiRow>(
      `${roiSql} AND DATE >= ? AND DATE <= ?
      GROUP BY WEEK_START, WORKFLOW
      ORDER BY WEEK_START, WORKFLOW`,
      [brokerage, from, to],
    )

    // Unfiltered query for trend computation (all history)
    const roiAll = await sf.query<RoiRow>(
      `${roiSql}
      GROUP BY WEEK_START, WORKFLOW
      ORDER BY WEEK_START, WORKFLOW`,
      [brokerage],
    )

    const [{ MAX_DATE }] = await sf.query<{ MAX_DATE: string }>(
      `SELECT TO_CHAR(MAX(DATE), 'YYYY-MM-DD') AS MAX_DATE
       FROM MART_REPORTING__ROI_BY_CUSTOMER_AND_WORKFLOW
       WHERE BROKERAGE_KEY = ?`,
      [brokerage],
    )

    const loadsRows = await sf.query<LoadsRow>(
      `SELECT
        TO_CHAR(REPORTING_WEEK, 'YYYY-MM-DD') AS REPORTING_WEEK,
        SUM(LOAD_COUNT_POD) AS PODS_COLLECTED,
        SUM(LOAD_COUNT_TNT) AS LOADS_ACTIONED,
        SUM(BID_COUNT) AS BIDS_COLLECTED,
        SUM(LOADS_BUILT) AS LOADS_BUILT
      FROM MART_WORKFLOW_LOADS_DAILY
      WHERE BROKERAGE_KEY = ?
      GROUP BY REPORTING_WEEK
      ORDER BY REPORTING_WEEK`,
      [brokerage],
    )

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
    // Outcome totals from loads table (all time)
    // -----------------------------------------------------------------------
    const loadsTotals = loadsRows.reduce(
      (acc, r) => ({
        pods: acc.pods + (r.PODS_COLLECTED ?? 0),
        loads: acc.loads + (r.LOADS_ACTIONED ?? 0),
        bids: acc.bids + (r.BIDS_COLLECTED ?? 0),
        loadsBuilt: acc.loadsBuilt + (r.LOADS_BUILT ?? 0),
      }),
      { pods: 0, loads: 0, bids: 0, loadsBuilt: 0 },
    )

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
    // Outcome values from loads table
    // -----------------------------------------------------------------------
    const outcomeValues: Record<string, number[]> = {
      dc: [loadsTotals.pods, 0],
      tt: [wfTotals.tt.activity.tmsUpdates, loadsTotals.loads],
      cs: [loadsTotals.bids, 0],
      lb: [loadsTotals.loadsBuilt, 0],
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
    console.error("Dashboard API error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  } finally {
    sf.close()
  }
}
