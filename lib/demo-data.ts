import {
  fetchDashboardData,
  type DashboardData,
  type WeeklyStackedEntry,
  type WorkflowCard,
} from "@/lib/dashboard-data-service"

// ---------------------------------------------------------------------------
// Demo brokerages
// ---------------------------------------------------------------------------
const DEFAULT_DEMO_BROKERAGES = [
  { key: "summit-freight", label: "Summit Freight" },
  { key: "blue-ridge-logistics", label: "Blue Ridge Logistics" },
  { key: "pacific-coast-transport", label: "Pacific Coast Transport" },
  { key: "heartland-carriers", label: "Heartland Carriers" },
  { key: "northern-star-shipping", label: "Northern Star Shipping" },
]

export function getDemoBrokerages(name?: string | null) {
  if (name) {
    return [{ key: "demo", label: name }]
  }
  return DEFAULT_DEMO_BROKERAGES
}

// ---------------------------------------------------------------------------
// Deterministic hash → scaling factor (0.6 – 1.4)
// ---------------------------------------------------------------------------
function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function scaleFor(key: string): number {
  const h = hashString(key)
  return 0.6 + (h % 800) / 1000 // 0.6 – 1.4
}

// ---------------------------------------------------------------------------
// Shift mock data dates so the most recent week aligns with "this week"
// ---------------------------------------------------------------------------
function shiftDates(data: DashboardData): DashboardData {
  const weeks = data.weeklyStacked
  if (weeks.length === 0) return data

  // Find the latest week_iso in the data
  const latestIso = weeks.reduce(
    (max, w) => (w.weekIso > max ? w.weekIso : max),
    weeks[0].weekIso,
  )

  // Current Monday (start of this week)
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  const currentMonday = monday.toISOString().slice(0, 10)

  // Compute offset in days between latest data week and current Monday
  const latestDate = new Date(latestIso)
  const currentDate = new Date(currentMonday)
  const offsetMs = currentDate.getTime() - latestDate.getTime()
  const offsetDays = Math.round(offsetMs / (1000 * 60 * 60 * 24))

  if (offsetDays === 0) return data

  const shiftIso = (iso: string): string => {
    const d = new Date(iso)
    d.setDate(d.getDate() + offsetDays)
    return d.toISOString().slice(0, 10)
  }

  const formatWeekLabel = (iso: string): string => {
    const [y, m, d] = iso.split("-").map(Number)
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return `${months[m - 1]} ${d}`
  }

  const shiftedWeeks: WeeklyStackedEntry[] = weeks.map((w) => {
    const newIso = shiftIso(w.weekIso)
    return { ...w, weekIso: newIso, week: formatWeekLabel(newIso) }
  })

  // Update period label
  const firstIso = shiftedWeeks[0].weekIso
  const lastIso = shiftedWeeks[shiftedWeeks.length - 1].weekIso
  const formatDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number)
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return `${months[m - 1]} ${d}, ${y}`
  }

  return {
    ...data,
    weeklyStacked: shiftedWeeks,
    period: `${formatDate(firstIso)} – ${formatDate(lastIso)}`,
    lastUpdated: new Date().toISOString().slice(0, 10),
  }
}

// ---------------------------------------------------------------------------
// Scale numeric values by a multiplier
// ---------------------------------------------------------------------------
function scaleData(data: DashboardData, multiplier: number): DashboardData {
  const s = (n: number) => Math.round(n * multiplier)

  const weeklyStacked: WeeklyStackedEntry[] = data.weeklyStacked.map((w) => ({
    ...w,
    dc: s(w.dc),
    tt: s(w.tt),
    cs: s(w.cs),
    lb: s(w.lb),
    as: s(w.as),
    total: s(w.total),
    interactions: s(w.interactions),
  }))

  const workflows: WorkflowCard[] = data.workflows.map((wf) => ({
    ...wf,
    hoursSaved: wf.hoursSaved * multiplier,
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
  }))

  return {
    ...data,
    totalHours: data.totalHours * multiplier,
    avgHoursPerWeek: data.avgHoursPerWeek * multiplier,
    weeklyStacked,
    workflows,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function getDemoDashboardData(
  from: string,
  to: string,
  brokerageKey: string,
  name?: string | null,
): DashboardData {
  // Get base data from static JSON
  let data = fetchDashboardData(from, to)

  // Shift dates to be current
  data = shiftDates(data)

  // Apply per-brokerage scaling
  const key = name || brokerageKey
  const multiplier = scaleFor(key)
  data = scaleData(data, multiplier)

  // Override brokerage display name
  const displayName =
    name ||
    DEFAULT_DEMO_BROKERAGES.find((b) => b.key === brokerageKey)?.label ||
    "Demo Company"

  return { ...data, brokerage: displayName }
}
