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
  // Load Building
  lb_calls: number; lb_emails: number; lb_texts: number; lb_tms: number
  lb_loads_built: number; lb_tenders_accepted: number
  // Appointment Scheduling
  as_calls: number; as_emails: number; as_texts: number; as_tms: number
  as_appts_scheduled: number; as_appts_ontime: number
  // Quoting
  qt_calls: number; qt_emails: number; qt_texts: number; qt_tms: number
  qt_quotes_generated: number; qt_quotes_booked: number
}

// 10 weeks of data — gradual upward trend, last 4 weeks notably higher than prior 4
const WEEKLY_DATA: WeekRow[] = [
  // --- Prior weeks (lower baseline) ---
  {
    dc_calls: 310, dc_emails: 280, dc_pods_collected: 185, dc_loads_with_outreach: 295,
    tt_calls: 3200, tt_emails: 2800, tt_texts: 950, tt_tms: 4100, tt_loads_actioned: 520,
    cs_calls: 420, cs_emails: 380, cs_bids: 610, cs_loads_booked: 42,
    lb_calls: 250, lb_emails: 350, lb_texts: 80, lb_tms: 280, lb_loads_built: 180, lb_tenders_accepted: 151,
    as_calls: 550, as_emails: 320, as_texts: 220, as_tms: 310, as_appts_scheduled: 340, as_appts_ontime: 292,
    qt_calls: 180, qt_emails: 450, qt_texts: 40, qt_tms: 20, qt_quotes_generated: 420, qt_quotes_booked: 80,
  },
  {
    dc_calls: 325, dc_emails: 290, dc_pods_collected: 192, dc_loads_with_outreach: 300,
    tt_calls: 3350, tt_emails: 2900, tt_texts: 1020, tt_tms: 4250, tt_loads_actioned: 540,
    cs_calls: 440, cs_emails: 395, cs_bids: 635, cs_loads_booked: 45,
    lb_calls: 265, lb_emails: 365, lb_texts: 85, lb_tms: 295, lb_loads_built: 190, lb_tenders_accepted: 161,
    as_calls: 575, as_emails: 335, as_texts: 230, as_tms: 325, as_appts_scheduled: 355, as_appts_ontime: 308,
    qt_calls: 190, qt_emails: 470, qt_texts: 42, qt_tms: 22, qt_quotes_generated: 440, qt_quotes_booked: 88,
  },
  // --- Prior 4 weeks (mid baseline for trend calc) ---
  {
    dc_calls: 340, dc_emails: 305, dc_pods_collected: 198, dc_loads_with_outreach: 310,
    tt_calls: 3500, tt_emails: 3050, tt_texts: 1100, tt_tms: 4400, tt_loads_actioned: 555,
    cs_calls: 460, cs_emails: 410, cs_bids: 660, cs_loads_booked: 48,
    lb_calls: 285, lb_emails: 390, lb_texts: 95, lb_tms: 315, lb_loads_built: 205, lb_tenders_accepted: 176,
    as_calls: 610, as_emails: 360, as_texts: 250, as_tms: 350, as_appts_scheduled: 385, as_appts_ontime: 339,
    qt_calls: 210, qt_emails: 510, qt_texts: 48, qt_tms: 25, qt_quotes_generated: 480, qt_quotes_booked: 101,
  },
  {
    dc_calls: 355, dc_emails: 315, dc_pods_collected: 205, dc_loads_with_outreach: 315,
    tt_calls: 3600, tt_emails: 3150, tt_texts: 1150, tt_tms: 4550, tt_loads_actioned: 570,
    cs_calls: 475, cs_emails: 425, cs_bids: 685, cs_loads_booked: 50,
    lb_calls: 300, lb_emails: 405, lb_texts: 100, lb_tms: 330, lb_loads_built: 215, lb_tenders_accepted: 187,
    as_calls: 640, as_emails: 375, as_texts: 260, as_tms: 365, as_appts_scheduled: 400, as_appts_ontime: 356,
    qt_calls: 220, qt_emails: 535, qt_texts: 50, qt_tms: 28, qt_quotes_generated: 505, qt_quotes_booked: 111,
  },
  {
    dc_calls: 350, dc_emails: 310, dc_pods_collected: 202, dc_loads_with_outreach: 312,
    tt_calls: 3550, tt_emails: 3100, tt_texts: 1130, tt_tms: 4480, tt_loads_actioned: 565,
    cs_calls: 470, cs_emails: 420, cs_bids: 675, cs_loads_booked: 49,
    lb_calls: 295, lb_emails: 400, lb_texts: 98, lb_tms: 325, lb_loads_built: 212, lb_tenders_accepted: 183,
    as_calls: 630, as_emails: 370, as_texts: 255, as_tms: 360, as_appts_scheduled: 395, as_appts_ontime: 349,
    qt_calls: 215, qt_emails: 525, qt_texts: 48, qt_tms: 26, qt_quotes_generated: 495, qt_quotes_booked: 104,
  },
  {
    dc_calls: 365, dc_emails: 325, dc_pods_collected: 210, dc_loads_with_outreach: 320,
    tt_calls: 3700, tt_emails: 3200, tt_texts: 1200, tt_tms: 4650, tt_loads_actioned: 585,
    cs_calls: 490, cs_emails: 440, cs_bids: 700, cs_loads_booked: 52,
    lb_calls: 315, lb_emails: 420, lb_texts: 105, lb_tms: 345, lb_loads_built: 225, lb_tenders_accepted: 198,
    as_calls: 660, as_emails: 390, as_texts: 275, as_tms: 380, as_appts_scheduled: 420, as_appts_ontime: 374,
    qt_calls: 235, qt_emails: 555, qt_texts: 55, qt_tms: 30, qt_quotes_generated: 530, qt_quotes_booked: 122,
  },
  // --- Last 4 weeks (higher — positive trend) ---
  {
    dc_calls: 410, dc_emails: 370, dc_pods_collected: 240, dc_loads_with_outreach: 345,
    tt_calls: 4100, tt_emails: 3600, tt_texts: 1400, tt_tms: 5200, tt_loads_actioned: 640,
    cs_calls: 550, cs_emails: 500, cs_bids: 790, cs_loads_booked: 60,
    lb_calls: 355, lb_emails: 475, lb_texts: 115, lb_tms: 385, lb_loads_built: 260, lb_tenders_accepted: 232,
    as_calls: 740, as_emails: 435, as_texts: 315, as_tms: 420, as_appts_scheduled: 480, as_appts_ontime: 437,
    qt_calls: 265, qt_emails: 620, qt_texts: 60, qt_tms: 34, qt_quotes_generated: 595, qt_quotes_booked: 143,
  },
  {
    dc_calls: 425, dc_emails: 385, dc_pods_collected: 250, dc_loads_with_outreach: 350,
    tt_calls: 4250, tt_emails: 3750, tt_texts: 1480, tt_tms: 5400, tt_loads_actioned: 660,
    cs_calls: 570, cs_emails: 515, cs_bids: 820, cs_loads_booked: 63,
    lb_calls: 370, lb_emails: 495, lb_texts: 120, lb_tms: 400, lb_loads_built: 275, lb_tenders_accepted: 248,
    as_calls: 770, as_emails: 455, as_texts: 330, as_tms: 440, as_appts_scheduled: 505, as_appts_ontime: 464,
    qt_calls: 280, qt_emails: 650, qt_texts: 65, qt_tms: 36, qt_quotes_generated: 625, qt_quotes_booked: 156,
  },
  {
    dc_calls: 440, dc_emails: 395, dc_pods_collected: 258, dc_loads_with_outreach: 360,
    tt_calls: 4400, tt_emails: 3850, tt_texts: 1550, tt_tms: 5600, tt_loads_actioned: 680,
    cs_calls: 590, cs_emails: 530, cs_bids: 850, cs_loads_booked: 66,
    lb_calls: 390, lb_emails: 520, lb_texts: 130, lb_tms: 425, lb_loads_built: 290, lb_tenders_accepted: 264,
    as_calls: 810, as_emails: 475, as_texts: 350, as_tms: 465, as_appts_scheduled: 540, as_appts_ontime: 500,
    qt_calls: 295, qt_emails: 680, qt_texts: 68, qt_tms: 38, qt_quotes_generated: 660, qt_quotes_booked: 172,
  },
  {
    dc_calls: 460, dc_emails: 410, dc_pods_collected: 270, dc_loads_with_outreach: 370,
    tt_calls: 4600, tt_emails: 4000, tt_texts: 1620, tt_tms: 5850, tt_loads_actioned: 710,
    cs_calls: 615, cs_emails: 550, cs_bids: 885, cs_loads_booked: 70,
    lb_calls: 420, lb_emails: 560, lb_texts: 140, lb_tms: 450, lb_loads_built: 310, lb_tenders_accepted: 282,
    as_calls: 880, as_emails: 510, as_texts: 380, as_tms: 490, as_appts_scheduled: 580, as_appts_ontime: 539,
    qt_calls: 310, qt_emails: 720, qt_texts: 75, qt_tms: 40, qt_quotes_generated: 700, qt_quotes_booked: 182,
  },
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
    const lbHrs = hoursForActivity(row.lb_calls, row.lb_emails, row.lb_texts, row.lb_tms)
    const asHrs = hoursForActivity(row.as_calls, row.as_emails, row.as_texts, row.as_tms)
    const qtHrs = hoursForActivity(row.qt_calls, row.qt_emails, row.qt_texts, row.qt_tms)
    const total = Math.round(dcHrs + ttHrs + csHrs + lbHrs + asHrs + qtHrs)
    const interactions = row.dc_calls + row.dc_emails
      + row.tt_calls + row.tt_emails + row.tt_texts + row.tt_tms
      + row.cs_calls + row.cs_emails
      + row.lb_calls + row.lb_emails + row.lb_texts + row.lb_tms
      + row.as_calls + row.as_emails + row.as_texts + row.as_tms
      + row.qt_calls + row.qt_emails + row.qt_texts + row.qt_tms
    return {
      week: formatWeekLabel(weekIso),
      weekIso,
      dc: Math.round(dcHrs),
      tt: Math.round(ttHrs),
      cs: Math.round(csHrs),
      lb: Math.round(lbHrs),
      as: Math.round(asHrs),
      qt: Math.round(qtHrs),
      total,
      interactions,
    }
  })

  // Aggregate totals from FILTERED weeks only
  const dcTotals = { calls: 0, emails: 0, pods: 0, loadsOutreach: 0 }
  const ttTotals = { calls: 0, emails: 0, texts: 0, tms: 0, loadsActioned: 0 }
  const csTotals = { calls: 0, emails: 0, bids: 0, booked: 0 }
  const lbTotals = { calls: 0, emails: 0, texts: 0, tms: 0, loadsBuilt: 0, tendersAccepted: 0 }
  const asTotals = { calls: 0, emails: 0, texts: 0, tms: 0, apptsScheduled: 0, apptsOntime: 0 }
  const qtTotals = { calls: 0, emails: 0, texts: 0, tms: 0, quotesGenerated: 0, quotesBooked: 0 }

  for (const i of filteredIndices) {
    const row = WEEKLY_DATA[i]
    dcTotals.calls += row.dc_calls; dcTotals.emails += row.dc_emails
    dcTotals.pods += row.dc_pods_collected; dcTotals.loadsOutreach += row.dc_loads_with_outreach
    ttTotals.calls += row.tt_calls; ttTotals.emails += row.tt_emails
    ttTotals.texts += row.tt_texts; ttTotals.tms += row.tt_tms
    ttTotals.loadsActioned += row.tt_loads_actioned
    csTotals.calls += row.cs_calls; csTotals.emails += row.cs_emails
    csTotals.bids += row.cs_bids; csTotals.booked += row.cs_loads_booked
    lbTotals.calls += row.lb_calls; lbTotals.emails += row.lb_emails
    lbTotals.texts += row.lb_texts; lbTotals.tms += row.lb_tms
    lbTotals.loadsBuilt += row.lb_loads_built; lbTotals.tendersAccepted += row.lb_tenders_accepted
    asTotals.calls += row.as_calls; asTotals.emails += row.as_emails
    asTotals.texts += row.as_texts; asTotals.tms += row.as_tms
    asTotals.apptsScheduled += row.as_appts_scheduled; asTotals.apptsOntime += row.as_appts_ontime
    qtTotals.calls += row.qt_calls; qtTotals.emails += row.qt_emails
    qtTotals.texts += row.qt_texts; qtTotals.tms += row.qt_tms
    qtTotals.quotesGenerated += row.qt_quotes_generated; qtTotals.quotesBooked += row.qt_quotes_booked
  }

  const dcHoursTotal = hoursForActivity(dcTotals.calls, dcTotals.emails, 0, 0)
  const ttHoursTotal = hoursForActivity(ttTotals.calls, ttTotals.emails, ttTotals.texts, ttTotals.tms)
  const csHoursTotal = hoursForActivity(csTotals.calls, csTotals.emails, 0, 0)
  const lbHoursTotal = hoursForActivity(lbTotals.calls, lbTotals.emails, lbTotals.texts, lbTotals.tms)
  const asHoursTotal = hoursForActivity(asTotals.calls, asTotals.emails, asTotals.texts, asTotals.tms)
  const qtHoursTotal = hoursForActivity(qtTotals.calls, qtTotals.emails, qtTotals.texts, qtTotals.tms)

  // Trends use ALL 10 weeks (not just filtered) so the 4-wk comparison works
  const dcWeeklyHrs = WEEKLY_DATA.map((r) => hoursForActivity(r.dc_calls, r.dc_emails, 0, 0))
  const ttWeeklyHrs = WEEKLY_DATA.map((r) => hoursForActivity(r.tt_calls, r.tt_emails, r.tt_texts, r.tt_tms))
  const csWeeklyHrs = WEEKLY_DATA.map((r) => hoursForActivity(r.cs_calls, r.cs_emails, 0, 0))
  const lbWeeklyHrs = WEEKLY_DATA.map((r) => hoursForActivity(r.lb_calls, r.lb_emails, r.lb_texts, r.lb_tms))
  const asWeeklyHrs = WEEKLY_DATA.map((r) => hoursForActivity(r.as_calls, r.as_emails, r.as_texts, r.as_tms))
  const qtWeeklyHrs = WEEKLY_DATA.map((r) => hoursForActivity(r.qt_calls, r.qt_emails, r.qt_texts, r.qt_tms))

  const dcCollectionRate = dcTotals.loadsOutreach > 0
    ? Math.round((dcTotals.pods / dcTotals.loadsOutreach) * 1000) / 10
    : 0
  const lbTenderRate = lbTotals.loadsBuilt > 0
    ? Math.round((lbTotals.tendersAccepted / lbTotals.loadsBuilt) * 1000) / 10
    : 0
  const asOntimeRate = asTotals.apptsScheduled > 0
    ? Math.round((asTotals.apptsOntime / asTotals.apptsScheduled) * 1000) / 10
    : 0
  const qtBookRate = qtTotals.quotesGenerated > 0
    ? Math.round((qtTotals.quotesBooked / qtTotals.quotesGenerated) * 1000) / 10
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
      key: "lb", name: "Load Building", status: "Active", color: "#E8913A",
      activity: { calls: lbTotals.calls, emails: lbTotals.emails, texts: lbTotals.texts, tmsUpdates: lbTotals.tms },
      outcomes: [
        { label: "Loads Built", value: lbTotals.loadsBuilt },
        { label: "Tender Acceptance Rate", value: lbTenderRate, format: "pct" },
      ],
      hoursSaved: lbHoursTotal,
      trend: computeTrend(lbWeeklyHrs),
    },
    {
      key: "as", name: "Appointment Scheduling", status: "Active", color: "#E05D9E",
      activity: { calls: asTotals.calls, emails: asTotals.emails, texts: asTotals.texts, tmsUpdates: asTotals.tms },
      outcomes: [
        { label: "Appointments Scheduled", value: asTotals.apptsScheduled },
        { label: "On-Time Rate", value: asOntimeRate, format: "pct" },
      ],
      hoursSaved: asHoursTotal,
      trend: computeTrend(asWeeklyHrs),
    },
    {
      key: "qt", name: "Quoting", status: "Active", color: "#A89F91",
      activity: { calls: qtTotals.calls, emails: qtTotals.emails, texts: qtTotals.texts, tmsUpdates: qtTotals.tms },
      outcomes: [
        { label: "Quotes Generated", value: qtTotals.quotesGenerated },
        { label: "Quote-to-Book Rate", value: qtBookRate, format: "pct" },
      ],
      hoursSaved: qtHoursTotal,
      trend: computeTrend(qtWeeklyHrs),
    },
  ]

  const totalHours = dcHoursTotal + ttHoursTotal + csHoursTotal + lbHoursTotal + asHoursTotal + qtHoursTotal
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
    const lb = s(w.lb)
    const as_ = s(w.as)
    const qt = s(w.qt)
    return {
      ...w,
      dc, tt, cs, lb, as: as_, qt,
      total: dc + tt + cs + lb + as_ + qt,
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
