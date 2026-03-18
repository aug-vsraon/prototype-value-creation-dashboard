"use client"

import { useState, useMemo, useCallback } from "react"
import {
  Phone,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
  LabelList,
} from "recharts"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

import {
  fetchDashboardData,
  type DashboardData,
  type WorkflowCard as WorkflowCardData,
  type TrendResult,
} from "@/lib/dashboard-data-service"

// ---------------------------------------------------------------------------
// Constants (presentation only)
// ---------------------------------------------------------------------------
const WORKFLOW_COLORS: Record<string, string> = {
  dc: "#1D9E75", tt: "#378ADD", cs: "#7F77DD",
  lb: "#888780", as: "#B4B2A9", qt: "#A89F91",
}

const WORKFLOW_LABELS: Record<string, string> = {
  dc: "Document Collection", tt: "Track & Trace", cs: "Carrier Selection",
  lb: "Load Building", as: "Scheduling", qt: "Quoting",
}

const COL_GRID = "180px 80px 120px 120px 80px 80px 80px 80px 80px 120px"

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
const formatNumber = (value: number): string =>
  new Intl.NumberFormat("en-US").format(value)

const formatCompact = (value: number): string =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)

// ---------------------------------------------------------------------------
// Shared UI Components
// ---------------------------------------------------------------------------

function AugmentIconMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <mask id="iconMask" style={{ maskType: "luminance" }} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <path d="M32 16C32 7.16344 24.8366 0 16 0C7.16344 0 0 7.16344 0 16C0 24.8366 7.16344 32 16 32C24.8366 32 32 24.8366 32 16Z" fill="white" />
      </mask>
      <g mask="url(#iconMask)">
        <path opacity="0.5" fillRule="evenodd" clipRule="evenodd" d="M20.2892 5.64611C19.5491 5.33955 17.7938 6.63278 15.9995 8.9858C14.2054 6.63318 12.4503 5.34021 11.7103 5.64674C10.9703 5.95326 10.6436 8.10838 11.0384 11.0404C8.10607 10.6455 5.95069 10.9722 5.64415 11.7122C5.3376 12.4523 6.63078 14.2075 8.98372 16.0018C6.63083 17.796 5.33768 19.5513 5.64423 20.2913C5.95077 21.0314 8.10619 21.3581 11.0386 20.9631C10.6437 23.8953 10.9704 26.0505 11.7104 26.357C12.4504 26.6636 14.2054 25.3707 15.9995 23.0181C17.7937 25.3711 19.549 26.6642 20.289 26.3577C21.0291 26.0511 21.3559 23.8954 20.9608 20.9628C23.8931 21.3578 26.0485 21.031 26.3551 20.291C26.6616 19.5509 25.3687 17.7959 23.0161 16.0018C25.3687 14.2077 26.6617 12.4526 26.3552 11.7126C26.0486 10.9725 23.8932 10.6458 20.9609 11.0408C21.356 8.10823 21.0292 5.95266 20.2892 5.64611ZM15.9997 20.4012C18.4297 20.4012 20.3997 18.4313 20.3997 16.0012C20.3997 13.5712 18.4297 11.6012 15.9997 11.6012C13.5696 11.6012 11.5997 13.5712 11.5997 16.0012C11.5997 18.4313 13.5696 20.4012 15.9997 20.4012Z" fill="white" />
        <path fillRule="evenodd" clipRule="evenodd" d="M15.9996 4.12061C15.1507 4.12061 13.9566 6.09853 13.154 9.1299C10.443 7.5539 8.2001 6.99964 7.59981 7.59995C6.9995 8.20024 7.55376 10.4432 9.12979 13.1542C6.0982 13.9568 4.12012 15.1509 4.12012 15.9999C4.12012 16.8489 6.0982 18.043 9.12978 18.8456C7.55376 21.5566 6.9995 23.7996 7.5998 24.3999C8.20009 25.0002 10.443 24.4459 13.154 22.87C13.9565 25.9014 15.1506 27.8794 15.9996 27.8794C16.8486 27.8794 18.0427 25.9013 18.8453 22.8698C21.5564 24.4459 23.7995 25.0002 24.3998 24.3999C25.0001 23.7996 24.4458 21.5566 22.8697 18.8455C25.901 18.0429 27.8789 16.8488 27.8789 15.9999C27.8789 15.151 25.901 13.9569 22.8697 13.1543C24.4458 10.4432 25.0001 8.20022 24.3998 7.59992C23.7995 6.9996 21.5564 7.55391 18.8452 9.13002C18.0427 6.09857 16.8486 4.12061 15.9996 4.12061ZM15.9999 19.9598C18.1868 19.9598 19.9597 18.1869 19.9597 16C19.9597 13.813 18.1868 12.0401 15.9999 12.0401C13.8129 12.0401 12.04 13.813 12.04 16C12.04 18.1869 13.8129 19.9598 15.9999 19.9598Z" fill="white" />
      </g>
    </svg>
  )
}

function LineChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <circle cx="7" cy="17" r="2" fill="currentColor" />
      <circle cx="11" cy="12" r="2" fill="currentColor" />
      <circle cx="15" cy="14" r="2" fill="currentColor" />
      <circle cx="19" cy="7" r="2" fill="currentColor" />
      <path d="M7 17 L11 12 L15 14 L19 7" />
    </svg>
  )
}

function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-12 bg-[#0D2318] flex flex-col items-center py-3 z-50 max-md:hidden">
      <div className="flex items-center justify-center mb-4"><AugmentIconMark /></div>
      <div className="flex flex-col items-center gap-1 flex-1">
        <button className="p-2 rounded-lg bg-[#1A3D28] text-white"><LineChartIcon /></button>
        <button className="p-2 rounded-lg text-[#6B7280] hover:bg-[#1A3D28] hover:text-white/90"><Phone size={18} /></button>
      </div>
      <div className="mt-auto">
        <div className="w-7 h-7 rounded-full bg-[#16A34A] text-white text-xs font-medium flex items-center justify-center">AB</div>
      </div>
    </aside>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <AlertCircle className="w-12 h-12 text-[#EF4444] mb-4" />
      <h3 className="text-lg font-semibold text-[#111827] mb-2">{"We couldn't load your dashboard data."}</h3>
      <p className="text-[#6B7280] mb-6">Please refresh or contact support.</p>
      <Button onClick={onRetry} className="bg-[#16A34A] hover:bg-[#15803D] text-white rounded-md">
        <RefreshCw size={16} className="mr-2" />Retry
      </Button>
    </div>
  )
}

function StatusBadge({ status }: { status: "Active" | "Not Live" }) {
  if (status === "Active") {
    return <span className="px-2 py-0.5 text-xs font-medium rounded bg-[#DCFCE7] text-[#16A34A]">Active</span>
  }
  return <span className="px-2 py-0.5 text-xs font-medium rounded bg-[#F3F4F6] text-[#9CA3AF]">Not Live</span>
}

// ---------------------------------------------------------------------------
// Section 2 — Assumptions Bar
// ---------------------------------------------------------------------------
function AssumptionsBar() {
  return (
    <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
      <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Assumptions</span>
      <span className="text-xs text-[#6B7280]">Emails &amp; texts: <span className="font-medium text-[#374151]">30 sec each</span></span>
      <span className="text-xs text-[#6B7280]">TMS updates: <span className="font-medium text-[#374151]">1 min each</span></span>
      <span className="text-xs text-[#6B7280]">Calls: <span className="font-medium text-[#374151]">Actual duration</span></span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stacked bar chart tooltip
// ---------------------------------------------------------------------------
function StackedBarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; fill: string; payload?: Record<string, number> }>; label?: string }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + p.value, 0)
  const interactionsVal = payload[0]?.payload?.interactions ?? 0
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg p-3 shadow-sm text-xs">
      <p className="font-medium text-[#111827] mb-1.5">{label}</p>
      {payload.filter(p => p.value > 0).reverse().map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
            <span className="text-[#6B7280]">{WORKFLOW_LABELS[entry.dataKey] || entry.dataKey}</span>
          </div>
          <span className="font-medium text-[#111827]">{formatNumber(entry.value)} hrs</span>
        </div>
      ))}
      <div className="border-t border-[#E5E7EB] mt-1.5 pt-1.5 space-y-0.5">
        <div className="flex justify-between font-semibold text-[#111827]">
          <span>Total hours</span><span>{formatNumber(total)} hrs</span>
        </div>
        {interactionsVal > 0 && (
          <div className="flex justify-between text-[#6B7280]">
            <span>Total interactions</span><span>{formatNumber(interactionsVal)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom X-Axis Tick
// ---------------------------------------------------------------------------
function CustomXTick({ x, y, payload, firstWeekPartial }: { x: number; y: number; payload: { value: string }; index: number; firstWeekPartial: boolean }) {
  const isPartial = payload.value === WORKFLOW_LABELS.dc ? false : firstWeekPartial
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#9CA3AF" fontSize={10}>{payload.value}</text>
      {isPartial && (
        <text x={0} y={0} dy={23} textAnchor="middle" fill="#9CA3AF" fontSize={8} fontStyle="italic">partial</text>
      )}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Section 3 — Total Time Saved
// ---------------------------------------------------------------------------
function TimeSavedSection({ data }: { data: DashboardData }) {
  const avgRounded = Math.round(data.avgHoursPerWeek)

  // Bind firstWeekPartial into the tick renderer
  const renderTick = useCallback(
    (props: { x: number; y: number; payload: { value: string }; index: number }) => (
      <CustomXTick {...props} firstWeekPartial={data.firstWeekPartial} />
    ),
    [data.firstWeekPartial],
  )

  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] p-6">
      <div className="space-y-1 mb-5">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-[#111827]">{formatNumber(Math.round(data.totalHours))}</span>
          <span className="text-lg text-[#9CA3AF]">hours saved</span>
        </div>
        <p className="text-sm text-[#6B7280]">{data.period} · {avgRounded} hrs/week avg</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3">
        {(["dc", "tt", "cs", "lb", "as", "qt"] as const).map((key) => (
          <div key={key} className="flex items-center gap-1.5 text-xs text-[#6B7280]">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: WORKFLOW_COLORS[key] }} />
            {WORKFLOW_LABELS[key]}
          </div>
        ))}
      </div>

      {/* Stacked bar chart */}
      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.weeklyStacked} barCategoryGap="15%" margin={{ top: 20, right: 60, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="week"
              axisLine={false}
              tickLine={false}
              tick={renderTick as unknown as React.ComponentType}
              interval={0}
              height={data.firstWeekPartial ? 40 : 28}
            />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} width={40} />
            <Tooltip content={<StackedBarTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <ReferenceLine
              y={avgRounded}
              stroke="#9CA3AF"
              strokeDasharray="5 5"
              label={{ value: `${avgRounded} avg`, position: "right", fill: "#9CA3AF", fontSize: 10 }}
            />
            <Bar dataKey="dc" stackId="hours" fill={WORKFLOW_COLORS.dc} />
            <Bar dataKey="tt" stackId="hours" fill={WORKFLOW_COLORS.tt} />
            <Bar dataKey="cs" stackId="hours" fill={WORKFLOW_COLORS.cs} radius={[3, 3, 0, 0]}>
              <LabelList
                dataKey="interactions"
                position="top"
                offset={4}
                fontSize={9}
                fill="#9CA3AF"
                formatter={(v: number) => v > 0 ? formatCompact(v) : ""}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 4 — By Workflow (fixed 10-column grid)
// ---------------------------------------------------------------------------
function TrendCell({ trend }: { trend: TrendResult | null }) {
  if (!trend) return <span className="text-sm text-[#D1D5DB]">{"\u2014"}</span>
  if (trend.direction === "flat") return <span className="text-sm text-[#9CA3AF]">{"\u2192"} 0%</span>
  if (trend.direction === "up") return <span className="text-sm font-medium text-[#16A34A]">{"\u2191"} {trend.pct}%</span>
  return <span className="text-sm font-medium text-[#EF4444]">{"\u2193"} {trend.pct}%</span>
}

function Val({ value, format }: { value: number; format?: "pct" }) {
  if (value === 0) return <span className="text-[#D1D5DB]">{"\u2014"}</span>
  if (format === "pct") return <span>{value.toFixed(1)}%</span>
  return <span>{formatNumber(Math.round(value))}</span>
}

function WorkflowRow({ workflow }: { workflow: WorkflowCardData }) {
  const isNotLive = workflow.status === "Not Live"
  return (
    <div
      className={`grid items-center rounded-lg border border-[#E5E7EB] ${isNotLive ? "bg-[#FAFAFA]" : "bg-white"}`}
      style={{ gridTemplateColumns: COL_GRID, minWidth: "1020px" }}
    >
      <div className="px-3 py-3 flex items-center gap-2 overflow-hidden">
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: workflow.color }} />
        <span className="text-sm font-semibold text-[#111827] truncate">{workflow.name}</span>
      </div>
      <div className="px-2 py-3"><StatusBadge status={workflow.status} /></div>
      <div className="px-3 py-2 text-right border-l border-[#E5E7EB]">
        <p className="text-[10px] text-[#9CA3AF] leading-tight mb-0.5 truncate">{workflow.outcomes[0].label}</p>
        <p className="text-sm font-semibold text-[#111827]"><Val value={workflow.outcomes[0].value} format={workflow.outcomes[0].format} /></p>
      </div>
      <div className="px-3 py-2 text-right">
        <p className="text-[10px] text-[#9CA3AF] leading-tight mb-0.5 truncate">{workflow.outcomes[1].label}</p>
        <p className="text-sm font-semibold text-[#111827]"><Val value={workflow.outcomes[1].value} format={workflow.outcomes[1].format} /></p>
      </div>
      <div className="px-3 py-3 text-right text-sm font-semibold text-[#111827] border-l border-[#E5E7EB]"><Val value={workflow.activity.calls} /></div>
      <div className="px-3 py-3 text-right text-sm font-semibold text-[#111827]"><Val value={workflow.activity.emails} /></div>
      <div className="px-3 py-3 text-right text-sm font-semibold text-[#111827]"><Val value={workflow.activity.texts} /></div>
      <div className="px-3 py-3 text-right text-sm font-semibold text-[#111827]"><Val value={workflow.activity.tmsUpdates} /></div>
      <div className="px-3 py-3 text-center border-l border-[#E5E7EB]"><TrendCell trend={workflow.trend} /></div>
      <div className="px-3 py-3 text-right">
        {workflow.hoursSaved > 0 ? (
          <span className="text-[20px] font-bold text-[#16A34A] whitespace-nowrap leading-tight">
            {formatNumber(Math.round(workflow.hoursSaved))} <span className="text-xs font-medium">hrs</span>
          </span>
        ) : (
          <span className="text-[20px] font-bold text-[#D1D5DB]">{"\u2014"}</span>
        )}
      </div>
    </div>
  )
}

function ByWorkflowSection({ workflows }: { workflows: WorkflowCardData[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wide">By Workflow</h2>
      <div className="overflow-x-auto">
        <div style={{ minWidth: "1020px" }}>
          {/* Shared header — group labels */}
          <div className="grid text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider" style={{ gridTemplateColumns: COL_GRID }}>
            <div className="col-span-2" />
            <div className="col-span-2 px-3 pb-0.5 border-l border-[#E5E7EB]">Outcomes</div>
            <div className="col-span-4 px-3 pb-0.5 border-l border-[#E5E7EB]">Activity</div>
            <div className="col-span-2" />
          </div>
          {/* Shared header — column names */}
          <div className="grid text-[10px] text-[#9CA3AF] uppercase tracking-wider pb-1.5" style={{ gridTemplateColumns: COL_GRID }}>
            <div className="px-3" />
            <div className="px-2" />
            <div className="px-3 text-right border-l border-[#E5E7EB]" />
            <div className="px-3 text-right" />
            <div className="px-3 text-right border-l border-[#E5E7EB]">Calls</div>
            <div className="px-3 text-right">Emails</div>
            <div className="px-3 text-right">Texts</div>
            <div className="px-3 text-right">TMS</div>
            <div className="px-3 text-center border-l border-[#E5E7EB]">Trend</div>
            <div className="px-3 text-right">Hours Saved</div>
          </div>
          {/* Cards */}
          <div className="space-y-2">
            {workflows.map((wf) => (
              <WorkflowRow key={wf.key} workflow={wf} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------
export default function ValueCreationDashboard() {
  const [dateFrom, setDateFrom] = useState("2026-02-09")
  const [dateTo, setDateTo] = useState("2026-03-08")
  const [hasError, setHasError] = useState(false)

  const dashData = useMemo(() => fetchDashboardData(dateFrom, dateTo), [dateFrom, dateTo])

  const handleExport = useCallback(() => {
    toast.success("Export ready \u2014 file downloading.", {
      icon: <CheckCircle size={16} className="text-[#16A34A]" />,
    })
  }, [])

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Sidebar />

      <main className="md:ml-12 p-6 lg:p-8 max-w-[1400px] mx-auto">
        {hasError ? (
          <ErrorState onRetry={() => setHasError(false)} />
        ) : (
          <div className="space-y-6">
            {/* Section 1 — Header */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-xl font-semibold text-[#111827]">Value Creation Dashboard</h1>
                <p className="text-sm text-[#6B7280] mt-0.5">{dashData.brokerage}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <label className="text-xs text-[#6B7280]">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-2.5 py-1.5 border border-[#E5E7EB] rounded-md text-sm text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent"
                  />
                  <label className="text-xs text-[#6B7280]">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-2.5 py-1.5 border border-[#E5E7EB] rounded-md text-sm text-[#111827] bg-white focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent"
                  />
                </div>
                <Button variant="outline" onClick={handleExport} className="rounded-md border-[#E5E7EB] text-[#111827]">
                  <Download size={16} className="mr-2" />Export CSV
                </Button>
                <span className="text-xs text-[#9CA3AF]">Last updated: {dashData.lastUpdated}</span>
              </div>
            </div>

            {/* Section 2 — Assumptions Bar */}
            <AssumptionsBar />

            {/* Section 3 — Total Time Saved */}
            <TimeSavedSection data={dashData} />

            {/* Section 4 — By Workflow */}
            <ByWorkflowSection workflows={dashData.workflows} />
          </div>
        )}
      </main>
    </div>
  )
}
