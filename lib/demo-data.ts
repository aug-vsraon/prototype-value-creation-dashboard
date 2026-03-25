import type { DashboardData, WeeklyStackedEntry, WorkflowCard, TrendResult } from "@/lib/dashboard-data-service"

// ---------------------------------------------------------------------------
// Curated weekly data — 10 weeks with a positive upward trend
// Weeks are placeholder dates; shiftDates() aligns them to the current week.
// ---------------------------------------------------------------------------
interface WeekRow {
  // Document Collection
  dc_calls: number; dc_emails: number
  dc_pods_collected: number; dc_loads_with_outreach: number
  // Track & Trace
  tt_calls: number; tt_emails: number; tt_texts: number; tt_tms: number
  tt_loads_actioned: number
  // Carrier Selection
  cs_calls: number; cs_emails: number
  cs_bids: number; cs_loads_booked: number
}

// 10 weeks of data — gradual upward trend, last 4 weeks notably higher than prior 4
const WEEKLY_DATA: WeekRow[] = [
  // --- Prior weeks (lower baseline) ---
  { dc_calls: 310, dc_emails: 280, dc_pods_collected: 185, dc_loads_with_outreach: 295, tt_calls: 3200, tt_emails: 2800, tt_texts: 950, tt_tms: 4100, tt_loads_actioned: 520, cs_calls: 420, cs_emails: 380, cs_bids: 610, cs_loads_booked: 42 },
  { dc_calls: 325, dc_emails: 290, dc_pods_collected: 192, dc_loads_with_outreach: 300, tt_calls: 3350, tt_emails: 2900, tt_texts: 1020, tt_tms: 4250, tt_loads_actioned: 540, cs_calls: 440, cs_emails: 395, cs_bids: 635, cs_loads_booked: 45 },
  // --- Prior 4 weeks (mid baseline for trend calc) ---
  { dc_calls: 340, dc_emails: 305, dc_pods_collected: 198, dc_loads_with_outreach: 310, tt_calls: 3500, tt_emails: 3050, tt_texts: 1100, tt_tms: 4400, tt_loads_actioned: 555, cs_calls: 460, cs_emails: 410, cs_bids: 660, cs_loads_booked: 48 },
  { dc_calls: 355, dc_emails: 315, dc_pods_collected: 205, dc_loads_with_outreach: 315, tt_calls: 3600, tt_emails: 3150, tt_texts: 1150, tt_tms: 4550, tt_loads_actioned: 570, cs_calls: 475, cs_emails: 425, cs_bids: 685, cs_loads_booked: 50 },
  { dc_calls: 350, dc_emails: 310, dc_pods_collected: 202, dc_loads_with_outreach: 312, tt_calls: 3550, tt_emails: 3100, tt_texts: 1130, tt_tms: 4480, tt_loads_actioned: 565, cs_calls: 470, cs_emails: 420, cs_bids: 675, cs_loads_booked: 49 },
  { dc_calls: 365, dc_emails: 325, dc_pods_collected: 210, dc_loads_with_outreach: 320, tt_calls: 3700, tt_emails: 3200, tt_texts: 1200, tt_tms: 4650, tt_loads_actioned: 585, cs_calls: 490, cs_emails: 440, cs_bids: 700, cs_loads_booked: 52 },
  // --- Last 4 weeks (higher — positive trend) ---
  { dc_calls: 410, dc_emails: 370, dc_pods_collected: 240, dc_loads_with_outreach: 345, tt_calls: 4100, tt_emails: 3600, tt_texts: 1400, tt_tms: 5200, tt_loads_actioned: 640, cs_calls: 550, cs_emails: 500, cs_bids: 790, cs_loads_booked: 60 },
  { dc_calls: 425, dc_emails: 385, dc_pods_collected: 250, dc_loads_with_outreach: 350, tt_calls: 4250, tt_emails: 3750, tt_texts: 1480, tt_tms: 5400, tt_loads_actioned: 660, cs_calls: 570, cs_emails: 515, cs_bids: 820, cs_loads_booked: 63 },
  { dc_calls: 440, dc_emails: 395, dc_pods_collected: 258, dc_loads_with_outreach: 360, tt_calls: 4400, tt_emails: 3850, tt_texts: 1550, tt_tms: 5600, tt_loads_actioned: 680, cs_calls: 590, cs_emails: 530, cs_bids: 850, cs_loads_booked: 66 },
  { dc_calls: 460, dc_emails: 410, dc_pods_collected: 270, dc_loads_with_outreach: 370, tt_calls: 4600, tt_emails: 4000, tt_texts: 1620, tt_tms: 5850, tt_loads_actioned: 710, cs_calls: 615, cs_emails: 550, cs_bids: 885, cs_loads_booked: 70 },
]

// Time assumptions (match the live dashboard)
const MIN_PER_EMAIL = 0.5
const MIN_PER_TEXT = 0.5
const MIN_PER_TMS = 1
const MIN_PER_CALL = 2

function hoursForActivity(calls: number, emails: number, texts: number, tms: number): number {
  return (calls * MIN_PER_CALL + emails * MIN_PER_EMAIL + texts * MIN_PER_TEXT + tms * MIN_PER_TMS) / 60
}

// ---------------------------------------------------------------------------
// Trend computation — identical to live dashboard
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

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatWeekLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[m - 1]} ${d}`
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[m - 1]} ${d}, ${y}`
}

// ---------------------------------------------------------------------------
// Build demo DashboardData from curated weekly rows for a given date range.
// All 10 weeks are used for trend computation, but only filtered weeks
// contribute to totals, workflow cards, and the chart.
// ---------------------------------------------------------------------------
function buildDemoData(filteredIndices: number[]): DashboardData {
  const baseMonday = "2026-01-05"

  // Build weekly stacked entries for filtered weeks only
  const weeks: WeeklyStackedEntry[] = filteredIndices.map((i) => {
    const row = WEEKLY_DATA[i]
    const weekIso = addDays(baseMonday, i * 7)
    const dcHrs = hoursForActivity(row.dc_calls, row.dc_emails, 0, 0)
    const ttHrs = hoursForActivity(row.tt_calls, row.tt_emails, row.tt_texts, row.tt_tms)
    const csHrs = hoursForActivity(row.cs_calls, row.cs_emails, 0, 0)
    const total = Math.round(dcHrs + ttHrs + csHrs)
    const interactions = row.dc_calls + row.dc_emails
      + row.tt_calls + row.tt_emails + row.tt_texts + row.tt_tms
      + row.cs_calls + row.cs_emails
    return {
      week: formatWeekLabel(weekIso),
      weekIso,
      dc: Math.round(dcHrs),
      tt: Math.round(ttHrs),
      cs: Math.round(csHrs),
      lb: 0,
      as: 0,
      total,
      interactions,
    }
  })

  // Aggregate totals from FILTERED weeks only
  const dcTotals = { calls: 0, emails: 0, pods: 0, loadsOutreach: 0 }
  const ttTotals = { calls: 0, emails: 0, texts: 0, tms: 0, loadsActioned: 0 }
  const csTotals = { calls: 0, emails: 0, bids: 0, booked: 0 }

  for (const i of filteredIndices) {
    const row = WEEKLY_DATA[i]
    dcTotals.calls += row.dc_calls; dcTotals.emails += row.dc_emails
    dcTotals.pods += row.dc_pods_collected; dcTotals.loadsOutreach += row.dc_loads_with_outreach
    ttTotals.calls += row.tt_calls; ttTotals.emails += row.tt_emails
    ttTotals.texts += row.tt_texts; ttTotals.tms += row.tt_tms
    ttTotals.loadsActioned += row.tt_loads_actioned
    csTotals.calls += row.cs_calls; csTotals.emails += row.cs_emails
    csTotals.bids += row.cs_bids; csTotals.booked += row.cs_loads_booked
  }

  const dcHoursTotal = hoursForActivity(dcTotals.calls, dcTotals.emails, 0, 0)
  const ttHoursTotal = hoursForActivity(ttTotals.calls, ttTotals.emails, ttTotals.texts, ttTotals.tms)
  const csHoursTotal = hoursForActivity(csTotals.calls, csTotals.emails, 0, 0)

  // Trends use ALL 10 weeks (not just filtered) so the 4-wk comparison works
  const dcWeeklyHrs = WEEKLY_DATA.map((r) => hoursForActivity(r.dc_calls, r.dc_emails, 0, 0))
  const ttWeeklyHrs = WEEKLY_DATA.map((r) => hoursForActivity(r.tt_calls, r.tt_emails, r.tt_texts, r.tt_tms))
  const csWeeklyHrs = WEEKLY_DATA.map((r) => hoursForActivity(r.cs_calls, r.cs_emails, 0, 0))

  const dcCollectionRate = dcTotals.loadsOutreach > 0
    ? Math.round((dcTotals.pods / dcTotals.loadsOutreach) * 1000) / 10
    : 0

  const workflows: WorkflowCard[] = [
    {
      key: "dc", name: "Document Collection", status: "Active", color: "#1D9E75",
      activity: { calls: dcTotals.calls, emails: dcTotals.emails, texts: 0, tmsUpdates: 0 },
      outcomes: [
        { label: "PODs Collected", value: dcTotals.pods },
        { label: "Collection Rate (≤3 days)", value: dcCollectionRate, format: "pct" },
      ],
      hoursSaved: dcHoursTotal,
      trend: computeTrend(dcWeeklyHrs),
    },
    {
      key: "tt", name: "Track & Trace", status: "Active", color: "#378ADD",
      activity: { calls: ttTotals.calls, emails: ttTotals.emails, texts: ttTotals.texts, tmsUpdates: ttTotals.tms },
      outcomes: [
        { label: "TMS Updates Posted", value: ttTotals.tms },
        { label: "Loads Actioned", value: ttTotals.loadsActioned },
      ],
      hoursSaved: ttHoursTotal,
      trend: computeTrend(ttWeeklyHrs),
    },
    {
      key: "cs", name: "Carrier Selection", status: "Active", color: "#7F77DD",
      activity: { calls: csTotals.calls, emails: csTotals.emails, texts: 0, tmsUpdates: 0 },
      outcomes: [
        { label: "Bids Collected", value: csTotals.bids },
        { label: "Loads Booked", value: csTotals.booked },
      ],
      hoursSaved: csHoursTotal,
      trend: computeTrend(csWeeklyHrs),
    },
    {
      key: "lb", name: "Load Building", status: "Not Live", color: "#E8913A",
      activity: { calls: 0, emails: 0, texts: 0, tmsUpdates: 0 },
      outcomes: [{ label: "Loads Built", value: 0 }, { label: "Tender Acceptance Rate", value: 0, format: "pct" }],
      hoursSaved: 0, trend: null,
    },
    {
      key: "as", name: "Appointment Scheduling", status: "Not Live", color: "#E05D9E",
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

  const totalHours = dcHoursTotal + ttHoursTotal + csHoursTotal
  const weeksCount = weeks.length
  const avgHoursPerWeek = weeksCount > 0 ? totalHours / weeksCount : 0

  let firstWeekPartial = false
  if (weeks.length > 1) {
    const restAvg = weeks.slice(1).reduce((s, w) => s + w.total, 0) / (weeks.length - 1)
    firstWeekPartial = weeks[0].total < restAvg * 0.3
  }

  return {
    brokerage: "Demo Company",
    period: "",
    lastUpdated: new Date().toISOString().slice(0, 10),
    totalHours,
    avgHoursPerWeek,
    weeksCount,
    firstWeekPartial,
    weeklyStacked: weeks,
    workflows,
  }
}

// ---------------------------------------------------------------------------
// Compute date shift and determine which week indices fall in range
// ---------------------------------------------------------------------------
function computeShiftAndFilteredIndices(from: string, to: string): { dayShift: number; filteredIndices: number[] } {
  const baseMonday = "2026-01-05"
  // Last week index = 9 (10 weeks total)
  const lastWeekIso = addDays(baseMonday, 9 * 7)
  const targetMonday = getMondayOfWeek(new Date(to))
  const lastMonday = new Date(lastWeekIso)
  const dayShift = Math.round((targetMonday.getTime() - lastMonday.getTime()) / (1000 * 60 * 60 * 24))

  const filteredIndices: number[] = []
  for (let i = 0; i < WEEKLY_DATA.length; i++) {
    const shiftedIso = addDays(addDays(baseMonday, i * 7), dayShift)
    if (shiftedIso >= from && shiftedIso <= to) {
      filteredIndices.push(i)
    }
  }

  return { dayShift, filteredIndices }
}

// ---------------------------------------------------------------------------
// Apply date shift to weekly entries
// ---------------------------------------------------------------------------
function shiftDates(data: DashboardData, dayShift: number): DashboardData {
  const weeklyStacked: WeeklyStackedEntry[] = data.weeklyStacked.map((w) => {
    const newIso = addDays(w.weekIso, dayShift)
    return { ...w, weekIso: newIso, week: formatWeekLabel(newIso) }
  })

  return { ...data, weeklyStacked, lastUpdated: new Date().toISOString().slice(0, 10) }
}

// ---------------------------------------------------------------------------
// Deterministic per-prospect scaling — varies numbers while keeping trends
// ---------------------------------------------------------------------------
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function scaleFor(name: string): number {
  const h = hashString(name.toLowerCase())
  return 0.7 + (h % 600) / 1000 // 0.7 – 1.3
}

function scaleData(data: DashboardData, multiplier: number): DashboardData {
  const s = (v: number) => Math.round(v * multiplier)

  const weeklyStacked: WeeklyStackedEntry[] = data.weeklyStacked.map((w) => {
    const dc = s(w.dc)
    const tt = s(w.tt)
    const cs = s(w.cs)
    return {
      ...w,
      dc, tt, cs, lb: 0, as: 0,
      total: dc + tt + cs,
      interactions: s(w.interactions),
    }
  })

  const workflows: WorkflowCard[] = data.workflows.map((wf) => ({
    ...wf,
    activity: {
      calls: s(wf.activity.calls),
      emails: s(wf.activity.emails),
      texts: s(wf.activity.texts),
      tmsUpdates: s(wf.activity.tmsUpdates),
    },
    outcomes: wf.outcomes.map((o) => ({
      ...o,
      value: o.format === "pct" ? o.value : s(o.value),
    })),
    hoursSaved: wf.hoursSaved * multiplier,
  }))

  const totalHours = workflows.reduce((sum, wf) => sum + wf.hoursSaved, 0)
  const weeksCount = weeklyStacked.length
  const avgHoursPerWeek = weeksCount > 0 ? totalHours / weeksCount : 0

  return { ...data, weeklyStacked, workflows, totalHours, avgHoursPerWeek, weeksCount }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function getDemoBrokerages(name?: string | null) {
  if (name) {
    const key = name.toLowerCase().replace(/\s+/g, "-")
    return [{ key, label: name }]
  }
  return [{ key: "demo-company", label: "Demo Company" }]
}

export function getDemoDashboardData(
  from: string,
  to: string,
  _brokerageKey: string,
  name?: string | null,
): DashboardData {
  // Determine which weeks fall in the requested range after date shifting
  const { dayShift, filteredIndices } = computeShiftAndFilteredIndices(from, to)

  // Build data with only the filtered weeks contributing to totals/workflows
  let data = buildDemoData(filteredIndices)

  // Shift dates so data looks current
  data = shiftDates(data, dayShift)

  // Scale per prospect name — different prospect = different numbers, same positive trends
  const key = name || "demo-company"
  data = scaleData(data, scaleFor(key))

  // Override brokerage display name with prospect name
  const displayName = name || "Demo Company"

  return {
    ...data,
    brokerage: displayName,
    period: `${formatDateLabel(from)} – ${formatDateLabel(to)}`,
  }
}
