import { z } from "zod"
import rawJson from "@/lib/dashboard-data.json"

// ---------------------------------------------------------------------------
// Public interfaces — what the component receives
// ---------------------------------------------------------------------------
export interface TrendResult {
  direction: "up" | "down" | "flat"
  pct: number
}

export interface ActivityTotals {
  calls: number
  emails: number
  texts: number
  tmsUpdates: number
}

export interface WorkflowOutcome {
  label: string
  value: number
  format?: "pct"
}

export interface WorkflowCard {
  key: string
  name: string
  status: "Active" | "Not Live"
  color: string
  activity: ActivityTotals
  outcomes: WorkflowOutcome[]
  hoursSaved: number
  trend: TrendResult | null
}

export interface WeeklyStackedEntry {
  week: string
  weekIso: string
  dc: number
  tt: number
  cs: number
  lb: number
  as: number
  total: number
  interactions: number
}

export interface DashboardData {
  brokerage: string
  period: string
  lastUpdated: string
  totalHours: number
  avgHoursPerWeek: number
  weeksCount: number
  firstWeekPartial: boolean
  weeklyStacked: WeeklyStackedEntry[]
  workflows: WorkflowCard[]
}

// ---------------------------------------------------------------------------
// Zod schemas — validate raw JSON shape (private)
// ---------------------------------------------------------------------------
const RawDataSchema = z.object({
  meta: z.object({
    brokerage_display_name: z.string(),
    generated_date: z.string(),
  }),
  parameters: z.object({
    minutes_per_email: z.number(),
    minutes_per_call: z.number(),
    minutes_per_message: z.number(),
    minutes_per_tms_update: z.number(),
  }),
  tier1_program_value: z.object({
    summary: z.object({ period: z.string() }),
  }),
  track_and_trace: z.object({
    tier2_weekly_2026: z.array(z.object({
      week: z.string(), week_iso: z.string(),
      calls_made: z.number(), emails_sent: z.number(),
      sms_sent: z.number(), tms_updates: z.number(),
    })),
    tier3_weekly_impact: z.array(z.object({
      week_iso: z.string().optional(),
      loads_actioned: z.number(),
    })),
  }),
  document_collection: z.object({
    tier2_weekly_outreach: z.array(z.object({
      week: z.string(), week_iso: z.string(),
      calls_placed: z.number(), emails_sent: z.number(),
    })),
    tier2_pod_attribution_weekly: z.array(z.object({
      week_iso: z.string().optional(),
      pods_augie: z.number(),
      time_buckets: z.object({
        within_1_day: z.number(),
        within_2_days: z.number(),
        within_3_days: z.number(),
      }),
    })),
  }),
  carrier_selection: z.object({
    tier2_weekly: z.array(z.object({
      week: z.string(), week_iso: z.string(),
      bids_from_calls: z.number(), bids_from_emails: z.number(),
      bids_collected: z.number(), loads_booked: z.number(),
    })),
  }),
}).passthrough()

// ---------------------------------------------------------------------------
// Workflow display constants
// ---------------------------------------------------------------------------
const WORKFLOW_COLORS: Record<string, string> = {
  dc: "#1D9E75", tt: "#378ADD", cs: "#7F77DD",
  lb: "#888780", as: "#B4B2A9", qt: "#A89F91",
}

const NOT_LIVE_WORKFLOWS: WorkflowCard[] = [
  {
    key: "lb", name: "Load Building", status: "Not Live", color: WORKFLOW_COLORS.lb,
    activity: { calls: 0, emails: 0, texts: 0, tmsUpdates: 0 },
    outcomes: [{ label: "Loads Built", value: 0 }, { label: "Tender Acceptance Rate", value: 0, format: "pct" }],
    hoursSaved: 0, trend: null,
  },
  {
    key: "as", name: "Appointment Scheduling", status: "Not Live", color: WORKFLOW_COLORS.as,
    activity: { calls: 0, emails: 0, texts: 0, tmsUpdates: 0 },
    outcomes: [{ label: "Appointments Scheduled", value: 0 }, { label: "On-Time Rate", value: 0, format: "pct" }],
    hoursSaved: 0, trend: null,
  },
  {
    key: "qt", name: "Quoting", status: "Not Live", color: WORKFLOW_COLORS.qt,
    activity: { calls: 0, emails: 0, texts: 0, tmsUpdates: 0 },
    outcomes: [{ label: "Quotes Generated", value: 0 }, { label: "Quote-to-Book Rate", value: 0, format: "pct" }],
    hoursSaved: 0, trend: null,
  },
]

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------
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

function inRange(weekIso: string, from: string, to: string): boolean {
  return weekIso >= from && weekIso <= to
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function fetchDashboardData(from: string, to: string): DashboardData {
  const data = RawDataSchema.parse(rawJson)
  const p = data.parameters

  const hrs = (calls: number, emails: number, texts: number, tms: number) =>
    (calls * p.minutes_per_call + emails * p.minutes_per_email +
     texts * p.minutes_per_message + tms * p.minutes_per_tms_update) / 60

  const count = (calls: number, emails: number, texts: number, tms: number) =>
    calls + emails + texts + tms

  // Filter weekly data by date range
  const ttWeeks = data.track_and_trace.tier2_weekly_2026.filter(w => inRange(w.week_iso, from, to))
  const dcWeeks = data.document_collection.tier2_weekly_outreach.filter(w => inRange(w.week_iso, from, to))
  const csWeeks = data.carrier_selection.tier2_weekly.filter(w => inRange(w.week_iso, from, to))

  // Per-workflow activity totals
  const ttActivity: ActivityTotals = {
    calls: ttWeeks.reduce((s, w) => s + w.calls_made, 0),
    emails: ttWeeks.reduce((s, w) => s + w.emails_sent, 0),
    texts: ttWeeks.reduce((s, w) => s + w.sms_sent, 0),
    tmsUpdates: ttWeeks.reduce((s, w) => s + w.tms_updates, 0),
  }
  const dcActivity: ActivityTotals = {
    calls: dcWeeks.reduce((s, w) => s + w.calls_placed, 0),
    emails: dcWeeks.reduce((s, w) => s + w.emails_sent, 0),
    texts: 0, tmsUpdates: 0,
  }
  const csActivity: ActivityTotals = {
    calls: csWeeks.reduce((s, w) => s + w.bids_from_calls, 0),
    emails: csWeeks.reduce((s, w) => s + w.bids_from_emails, 0),
    texts: 0, tmsUpdates: 0,
  }

  // Hours per workflow
  const ttHours = hrs(ttActivity.calls, ttActivity.emails, ttActivity.texts, ttActivity.tmsUpdates)
  const dcHours = hrs(dcActivity.calls, dcActivity.emails, 0, 0)
  const csHours = hrs(csActivity.calls, csActivity.emails, 0, 0)
  const totalHours = ttHours + dcHours + csHours

  // Weekly stacked data
  const weeklyMap = new Map<string, WeeklyStackedEntry & { weekIso: string }>()

  const getOrCreate = (weekIso: string, label: string) => {
    if (!weeklyMap.has(weekIso)) {
      weeklyMap.set(weekIso, {
        week: label.replace(", 2026", "").replace(", 2025", ""),
        weekIso, dc: 0, tt: 0, cs: 0, lb: 0, as: 0, total: 0, interactions: 0,
      })
    }
    return weeklyMap.get(weekIso)!
  }

  for (const w of ttWeeks) {
    const e = getOrCreate(w.week_iso, w.week)
    e.tt = hrs(w.calls_made, w.emails_sent, w.sms_sent, w.tms_updates)
    e.interactions += count(w.calls_made, w.emails_sent, w.sms_sent, w.tms_updates)
  }
  for (const w of dcWeeks) {
    const e = getOrCreate(w.week_iso, w.week)
    e.dc = hrs(w.calls_placed, w.emails_sent, 0, 0)
    e.interactions += count(w.calls_placed, w.emails_sent, 0, 0)
  }
  for (const w of csWeeks) {
    const e = getOrCreate(w.week_iso, w.week)
    e.cs = hrs(w.bids_from_calls, w.bids_from_emails, 0, 0)
    e.interactions += count(w.bids_from_calls, w.bids_from_emails, 0, 0)
  }

  const weeklyStacked = Array.from(weeklyMap.values())
    .sort((a, b) => a.weekIso.localeCompare(b.weekIso))
    .map(w => ({ ...w, dc: Math.round(w.dc), tt: Math.round(w.tt), cs: Math.round(w.cs), lb: Math.round(w.lb), as: Math.round(w.as), total: Math.round(w.dc + w.tt + w.cs + w.lb + w.as) }))

  const weeksCount = weeklyStacked.length
  const avgHoursPerWeek = weeksCount > 0 ? totalHours / weeksCount : 0

  let firstWeekPartial = false
  if (weeklyStacked.length > 1) {
    const restAvg = weeklyStacked.slice(1).reduce((s, w) => s + w.total, 0) / (weeklyStacked.length - 1)
    firstWeekPartial = weeklyStacked[0].total < restAvg * 0.3
  }

  // Trends (use ALL data for trend computation, not just filtered range)
  const allTT = data.track_and_trace.tier2_weekly_2026
  const allDC = data.document_collection.tier2_weekly_outreach
  const allCS = data.carrier_selection.tier2_weekly

  const ttWeeklyHrs = allTT.map(w => hrs(w.calls_made, w.emails_sent, w.sms_sent, w.tms_updates))
  const dcWeeklyHrs = allDC.map(w => hrs(w.calls_placed, w.emails_sent, 0, 0))
  const csWeeklyHrs = allCS.map(w => hrs(w.bids_from_calls, w.bids_from_emails, 0, 0))

  // Outcomes (use ALL data, not filtered)
  const ttLoadsActioned = data.track_and_trace.tier3_weekly_impact.reduce((s, w) => s + w.loads_actioned, 0)
  const dcPodData = data.document_collection.tier2_pod_attribution_weekly
  const dcPods = dcPodData.reduce((s, w) => s + w.pods_augie, 0)
  const dcWithin3 = dcPodData.reduce((s, w) => s + w.time_buckets.within_1_day + w.time_buckets.within_2_days + w.time_buckets.within_3_days, 0)
  const dcRate = dcPods > 0 ? (dcWithin3 / dcPods) * 100 : 0
  const csBids = allCS.reduce((s, w) => s + w.bids_collected, 0)
  const csBooked = allCS.reduce((s, w) => s + w.loads_booked, 0)

  // Assemble active workflow cards
  const activeWorkflows: WorkflowCard[] = [
    {
      key: "dc", name: "Document Collection", status: "Active", color: WORKFLOW_COLORS.dc,
      activity: dcActivity,
      outcomes: [
        { label: "PODs Collected", value: dcPods },
        { label: "Collection Rate (\u22643 days)", value: dcRate, format: "pct" },
      ],
      hoursSaved: dcHours, trend: computeTrend(dcWeeklyHrs),
    },
    {
      key: "tt", name: "Track & Trace", status: "Active", color: WORKFLOW_COLORS.tt,
      activity: ttActivity,
      outcomes: [
        { label: "TMS Updates Posted", value: ttActivity.tmsUpdates },
        { label: "Loads Actioned", value: ttLoadsActioned },
      ],
      hoursSaved: ttHours, trend: computeTrend(ttWeeklyHrs),
    },
    {
      key: "cs", name: "Carrier Selection", status: "Active", color: WORKFLOW_COLORS.cs,
      activity: csActivity,
      outcomes: [
        { label: "Bids Collected", value: csBids },
        { label: "Loads Booked", value: csBooked },
      ],
      hoursSaved: csHours, trend: computeTrend(csWeeklyHrs),
    },
  ]

  return {
    brokerage: data.meta.brokerage_display_name,
    period: data.tier1_program_value.summary.period,
    lastUpdated: data.meta.generated_date,
    totalHours,
    avgHoursPerWeek,
    weeksCount,
    firstWeekPartial,
    weeklyStacked,
    workflows: [...activeWorkflows, ...NOT_LIVE_WORKFLOWS],
  }
}
