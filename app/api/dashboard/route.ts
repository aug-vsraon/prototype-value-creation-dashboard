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
}

const WORKFLOW_COLORS: Record<string, string> = {
  dc: "#1D9E75",
  tt: "#378ADD",
  cs: "#7F77DD",
}

// ---------------------------------------------------------------------------
// Row types returned by Snowflake
// ---------------------------------------------------------------------------
interface RoiRow {
  WEEK_START: string
  WORKFLOW: string
  HOURS_SAVED: number
  OUTBOUND_CALLS: number
  EMAILS_SENT: number
  TEXTS_SENT: number
  TMS_UPDATES: number
}

interface LoadsRow {
  REPORTING_WEEK: string
  PODS_COLLECTED: number
  LOADS_ACTIONED: number
  BIDS_COLLECTED: number
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
    // Run both queries on the same connection (sequentially)
    const roiRows = await sf.query<RoiRow>(
      `SELECT
        TO_CHAR(DATE_TRUNC('WEEK', DATE), 'YYYY-MM-DD') AS WEEK_START,
        WORKFLOW,
        SUM(HOURS_SAVED) AS HOURS_SAVED,
        SUM(OUTBOUND_CALLS) AS OUTBOUND_CALLS,
        SUM(EMAILS_SENT) AS EMAILS_SENT,
        SUM(NUM_SENT_TEXTS) AS TEXTS_SENT,
        SUM(NUM_TMS_UPDATES_SENT) AS TMS_UPDATES
      FROM MART_REPORTING__ROI_BY_CUSTOMER_AND_WORKFLOW
      WHERE BROKERAGE_KEY = ?
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
        SUM(BID_COUNT) AS BIDS_COLLECTED
      FROM MART_WORKFLOW_LOADS_DAILY
      WHERE BROKERAGE_KEY = ?
      GROUP BY REPORTING_WEEK
      ORDER BY REPORTING_WEEK`,
      [brokerage],
    )

    // -----------------------------------------------------------------------
    // Build weekly map (all weeks, for trend computation)
    // -----------------------------------------------------------------------
    const weeklyMap = new Map<string, Map<string, RoiRow>>()
    for (const row of roiRows) {
      const wfKey = WORKFLOW_KEY_MAP[row.WORKFLOW]
      if (!wfKey) continue
      if (!weeklyMap.has(row.WEEK_START)) weeklyMap.set(row.WEEK_START, new Map())
      weeklyMap.get(row.WEEK_START)!.set(wfKey, row)
    }

    const allWeeks = Array.from(weeklyMap.keys()).sort()
    const inRange = (week: string) => week >= from && week <= to
    const filteredWeeks = allWeeks.filter(inRange)

    // -----------------------------------------------------------------------
    // Weekly stacked entries (filtered date range)
    // -----------------------------------------------------------------------
    const weeklyStacked: WeeklyStackedEntry[] = filteredWeeks.map((week) => {
      const wfMap = weeklyMap.get(week)!
      const dcRow = wfMap.get("dc")
      const ttRow = wfMap.get("tt")
      const csRow = wfMap.get("cs")

      const dcHrs = dcRow?.HOURS_SAVED ?? 0
      const ttHrs = ttRow?.HOURS_SAVED ?? 0
      const csHrs = csRow?.HOURS_SAVED ?? 0

      const sum = (r: RoiRow | undefined) =>
        r ? r.OUTBOUND_CALLS + r.EMAILS_SENT + r.TEXTS_SENT + r.TMS_UPDATES : 0

      return {
        week: formatWeekLabel(week),
        weekIso: week,
        dc: Math.round(dcHrs),
        tt: Math.round(ttHrs),
        cs: Math.round(csHrs),
        total: Math.round(dcHrs + ttHrs + csHrs),
        interactions: sum(dcRow) + sum(ttRow) + sum(csRow),
      }
    })

    // -----------------------------------------------------------------------
    // Per-workflow totals (filtered range)
    // -----------------------------------------------------------------------
    const empty = (): { hours: number; activity: ActivityTotals } => ({
      hours: 0,
      activity: { calls: 0, emails: 0, texts: 0, tmsUpdates: 0 },
    })
    const wfTotals: Record<string, ReturnType<typeof empty>> = {
      dc: empty(), tt: empty(), cs: empty(),
    }

    for (const week of filteredWeeks) {
      const wfMap = weeklyMap.get(week)!
      for (const [key, row] of wfMap) {
        const t = wfTotals[key]
        if (!t) continue
        t.hours += row.HOURS_SAVED
        t.activity.calls += row.OUTBOUND_CALLS
        t.activity.emails += row.EMAILS_SENT
        t.activity.texts += row.TEXTS_SENT
        t.activity.tmsUpdates += row.TMS_UPDATES
      }
    }

    // -----------------------------------------------------------------------
    // Trends (all weeks, not filtered)
    // -----------------------------------------------------------------------
    const weeklyHrs: Record<string, number[]> = { dc: [], tt: [], cs: [] }
    for (const week of allWeeks) {
      const wfMap = weeklyMap.get(week)!
      for (const key of ["dc", "tt", "cs"]) {
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
      }),
      { pods: 0, loads: 0, bids: 0 },
    )

    // -----------------------------------------------------------------------
    // Aggregate metrics
    // -----------------------------------------------------------------------
    const totalHours = wfTotals.dc.hours + wfTotals.tt.hours + wfTotals.cs.hours
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
    // Workflow cards
    // -----------------------------------------------------------------------
    const activeWorkflows: WorkflowCard[] = [
      {
        key: "dc",
        name: "Document Collection",
        status: "Active",
        color: WORKFLOW_COLORS.dc,
        activity: wfTotals.dc.activity,
        outcomes: [
          { label: "PODs Collected", value: loadsTotals.pods },
          { label: "Collection Rate (\u22643 days)", value: 0, format: "pct" },
        ],
        hoursSaved: wfTotals.dc.hours,
        trend: computeTrend(weeklyHrs.dc),
      },
      {
        key: "tt",
        name: "Track & Trace",
        status: "Active",
        color: WORKFLOW_COLORS.tt,
        activity: wfTotals.tt.activity,
        outcomes: [
          { label: "TMS Updates Posted", value: wfTotals.tt.activity.tmsUpdates },
          { label: "Loads Actioned", value: loadsTotals.loads },
        ],
        hoursSaved: wfTotals.tt.hours,
        trend: computeTrend(weeklyHrs.tt),
      },
      {
        key: "cs",
        name: "Carrier Selection",
        status: "Active",
        color: WORKFLOW_COLORS.cs,
        activity: wfTotals.cs.activity,
        outcomes: [
          { label: "Bids Collected", value: loadsTotals.bids },
          { label: "Loads Booked", value: 0 },
        ],
        hoursSaved: wfTotals.cs.hours,
        trend: computeTrend(weeklyHrs.cs),
      },
    ]

    const notLiveWorkflows: WorkflowCard[] = [
      {
        key: "lb", name: "Load Building", status: "Not Live", color: "#888780",
        activity: { calls: 0, emails: 0, texts: 0, tmsUpdates: 0 },
        outcomes: [{ label: "Loads Built", value: 0 }, { label: "Tender Acceptance Rate", value: 0, format: "pct" }],
        hoursSaved: 0, trend: null,
      },
      {
        key: "as", name: "Appointment Scheduling", status: "Not Live", color: "#B4B2A9",
        activity: { calls: 0, emails: 0, texts: 0, tmsUpdates: 0 },
        outcomes: [{ label: "Appts Scheduled", value: 0 }, { label: "On-Time Rate", value: 0, format: "pct" }],
        hoursSaved: 0, trend: null,
      },
      {
        key: "qt", name: "Quoting", status: "Not Live", color: "#A89F91",
        activity: { calls: 0, emails: 0, texts: 0, tmsUpdates: 0 },
        outcomes: [{ label: "Quotes Generated", value: 0 }, { label: "Quote-to-Book Rate", value: 0, format: "pct" }],
        hoursSaved: 0, trend: null,
      },
    ]

    const data: DashboardData = {
      brokerage: titleCase(brokerage),
      period: formatPeriod(from, to),
      lastUpdated,
      totalHours,
      avgHoursPerWeek,
      weeksCount,
      firstWeekPartial,
      weeklyStacked,
      workflows: [...activeWorkflows, ...notLiveWorkflows],
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Dashboard API error:", error)
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  } finally {
    sf.close()
  }
}
