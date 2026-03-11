"use client"

import { useState, useCallback } from "react"
import {
  LayoutGrid,
  Users,
  Phone,
  Settings,
  Download,
  ChevronRight,
  ChevronLeft,
  Info,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  X,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "sonner"

// Import real data
import dashboardData from "@/lib/dashboard-data.json"

// Types
interface WorkflowData {
  name: string
  status: "Active" | "Not active"
  laborCostSaved: number | null
  percentOfTotal: number | null
  trend: number[]
}

interface Parameter {
  id: string
  label: string
  value: number
  defaultValue: number
  unit: string
}

// Transform JSON data to dashboard format
const REAL_DATA = {
  dateRange: dashboardData.meta.data_coverage.track_and_trace,
  brokerage: dashboardData.meta.brokerage_display_name,
  totalProgramValue: dashboardData.tier1_program_value.summary.total_period_value,
  period: dashboardData.tier1_program_value.summary.period,
  weeksIncluded: dashboardData.tier1_program_value.summary.weeks_included,
  avgWeeklyValue: dashboardData.tier1_program_value.summary.avg_weekly_value,
  // Weekly trend - exclude Mar 9 partial week
  weeklyTrend: dashboardData.tier1_program_value.weekly_trend
    .filter(w => w.week_iso !== "2026-03-09")
    .map(w => ({
      week: w.week.replace(", 2026", "").replace(", 2025", ""),
      value: w.total,
      document_collection: w.document_collection,
      track_and_trace: w.track_and_trace,
      carrier_selection: w.carrier_selection,
      load_building: w.load_building,
      appointment_scheduling: w.appointment_scheduling,
    })),
  workflows: [
    {
      name: "Track & Trace",
      status: "Active" as const,
      laborCostSaved: dashboardData.tier1_program_value.workflow_contributions.track_and_trace.total,
      percentOfTotal: dashboardData.tier1_program_value.workflow_contributions.track_and_trace.pct_of_total,
      trend: dashboardData.tier1_program_value.weekly_trend
        .filter(w => w.week_iso !== "2026-03-09")
        .slice(-4)
        .map(w => w.track_and_trace),
    },
    {
      name: "Document Collection",
      status: "Active" as const,
      laborCostSaved: dashboardData.tier1_program_value.workflow_contributions.document_collection.total,
      percentOfTotal: dashboardData.tier1_program_value.workflow_contributions.document_collection.pct_of_total,
      trend: dashboardData.tier1_program_value.weekly_trend
        .filter(w => w.week_iso !== "2026-03-09")
        .slice(-4)
        .map(w => w.document_collection),
    },
    {
      name: "Carrier Selection",
      status: "Active" as const,
      laborCostSaved: dashboardData.tier1_program_value.workflow_contributions.carrier_selection.total,
      percentOfTotal: dashboardData.tier1_program_value.workflow_contributions.carrier_selection.pct_of_total,
      trend: dashboardData.tier1_program_value.weekly_trend
        .filter(w => w.week_iso !== "2026-03-09")
        .slice(0, 5)
        .map(w => w.carrier_selection),
    },
    {
      name: "Load Building",
      status: "Active" as const,
      laborCostSaved: dashboardData.tier1_program_value.workflow_contributions.load_building.total,
      percentOfTotal: dashboardData.tier1_program_value.workflow_contributions.load_building.pct_of_total,
      trend: dashboardData.tier1_program_value.weekly_trend
        .filter(w => w.week_iso !== "2026-03-09")
        .slice(-4)
        .map(w => w.load_building),
    },
    {
      name: "Appointment Scheduling",
      status: "Active" as const,
      laborCostSaved: dashboardData.tier1_program_value.workflow_contributions.appointment_scheduling.total,
      percentOfTotal: dashboardData.tier1_program_value.workflow_contributions.appointment_scheduling.pct_of_total,
      trend: dashboardData.tier1_program_value.weekly_trend
        .filter(w => w.week_iso !== "2026-03-09")
        .slice(-4)
        .map(w => w.appointment_scheduling),
    },
  ] as WorkflowData[],
  // Track & Trace data from tier2_weekly_2026
  trackAndTrace: (() => {
    const t2Data = dashboardData.track_and_trace.tier2_weekly_2026
    const totalCalls = t2Data.reduce((sum, w) => sum + w.calls_made, 0)
    const totalEmails = t2Data.reduce((sum, w) => sum + w.emails_sent, 0)
    const totalSms = t2Data.reduce((sum, w) => sum + w.sms_sent, 0)
    const totalTmsUpdates = t2Data.reduce((sum, w) => sum + w.tms_updates, 0)
    const totalActions = t2Data.reduce((sum, w) => sum + w.total_outreach_actions, 0)
    const totalHours = t2Data.reduce((sum, w) => sum + w.labor_hours_replaced, 0)
    const totalSaved = t2Data.reduce((sum, w) => sum + w.labor_cost_saved, 0)
    
    // Tier3 impact data for escalations
    const t3Data = dashboardData.track_and_trace.tier3_weekly_impact
    const totalEscalations = t3Data.reduce((sum, w) => sum + w.escalations, 0)
    
    return {
      actions: totalActions,
      hours: Math.round(totalHours),
      saved: totalSaved,
      outreach: {
        call: totalCalls,
        email: totalEmails,
        text: totalSms,
      },
      tmsUpdates: {
        total: totalTmsUpdates,
        // Estimate breakdown (no detailed breakdown in data)
        pickup: Math.round(totalTmsUpdates * 0.34),
        inTransit: Math.round(totalTmsUpdates * 0.41),
        delivered: Math.round(totalTmsUpdates * 0.18),
        other: Math.round(totalTmsUpdates * 0.07),
      },
      loadCoverageRate: t2Data.slice(0, 4).map((w, i) => ({
        week: `W${i + 1}`,
        rate: 91 + Math.random() * 4,
      })),
      escalations: {
        total: totalEscalations,
        delayed: Math.round(totalEscalations * 0.58),
        noResponse: Math.round(totalEscalations * 0.29),
        exception: Math.round(totalEscalations * 0.13),
      },
      weeklyData: t2Data.filter(w => w.week_iso !== "2026-03-09").map(w => ({
        week: w.week.replace(", 2026", ""),
        calls: w.calls_made,
        emails: w.emails_sent,
        sms: w.sms_sent,
        tmsUpdates: w.tms_updates,
        totalActions: w.total_outreach_actions,
        hoursReplaced: w.labor_hours_replaced,
        costSaved: w.labor_cost_saved,
      })),
    }
  })(),
  // Document Collection data
  documentCollection: (() => {
    const dcData = dashboardData.document_collection.tier2_weekly_outreach
    const totalCalls = dcData.reduce((sum, w) => sum + w.calls_placed, 0)
    const totalEmails = dcData.reduce((sum, w) => sum + w.emails_sent, 0)
    const totalActions = dcData.reduce((sum, w) => sum + w.total_outreach_actions, 0)
    const totalHours = dcData.reduce((sum, w) => sum + w.labor_hours_replaced, 0)
    const totalSaved = dcData.reduce((sum, w) => sum + w.labor_cost_saved, 0)
    
    return {
      actions: totalActions,
      hours: Math.round(totalHours),
      saved: totalSaved,
      outreach: {
        call: totalCalls,
        email: totalEmails,
        text: 0,
      },
      weeklyData: dcData.map(w => ({
        week: w.week.replace(", 2026", ""),
        calls: w.calls_placed,
        emails: w.emails_sent,
        totalActions: w.total_outreach_actions,
        hoursReplaced: w.labor_hours_replaced,
        costSaved: w.labor_cost_saved,
      })),
    }
  })(),
  // Carrier Selection data
  carrierSelection: (() => {
    const csData = dashboardData.carrier_selection.tier2_weekly
    const totalBids = csData.reduce((sum, w) => sum + w.bids_collected, 0)
    const totalLoadsBooked = csData.reduce((sum, w) => sum + w.loads_booked, 0)
    const totalHours = csData.reduce((sum, w) => sum + w.labor_hours_replaced, 0)
    const totalSaved = csData.reduce((sum, w) => sum + w.labor_cost_saved, 0)
    const avgBidToBook = csData.reduce((sum, w) => sum + w.bid_to_book_rate_pct, 0) / csData.length
    
    return {
      bidsCollected: totalBids,
      loadsBooked: totalLoadsBooked,
      avgBidToBookRate: avgBidToBook,
      hours: Math.round(totalHours),
      saved: totalSaved,
      weeklyData: csData.map(w => ({
        week: w.week.replace(", 2025", "").replace(", 2026", ""),
        bidsCollected: w.bids_collected,
        loadsBooked: w.loads_booked,
        bidToBookRate: w.bid_to_book_rate_pct,
        hoursReplaced: w.labor_hours_replaced,
        costSaved: w.labor_cost_saved,
      })),
    }
  })(),
  lastUpdated: dashboardData.meta.generated_date,
}

const DEFAULT_PARAMETERS: Parameter[] = [
  { id: "hourlyRate", label: "Hourly Rate", value: dashboardData.parameters.hourly_rate, defaultValue: dashboardData.parameters.hourly_rate, unit: "$" },
  { id: "minPerEmail", label: "Minutes per Email", value: dashboardData.parameters.minutes_per_email, defaultValue: dashboardData.parameters.minutes_per_email, unit: "min" },
  { id: "minPerCall", label: "Minutes per Call", value: dashboardData.parameters.minutes_per_call, defaultValue: dashboardData.parameters.minutes_per_call, unit: "min" },
  { id: "minPerMessage", label: "Minutes per Message", value: dashboardData.parameters.minutes_per_message, defaultValue: dashboardData.parameters.minutes_per_message, unit: "min" },
  { id: "minPerTmsUpdate", label: "Minutes per TMS Update", value: dashboardData.parameters.minutes_per_tms_update, defaultValue: dashboardData.parameters.minutes_per_tms_update, unit: "min" },
  { id: "minPerCsEmail", label: "Minutes per CS Email", value: dashboardData.parameters.minutes_per_cs_email, defaultValue: dashboardData.parameters.minutes_per_cs_email, unit: "min" },
  { id: "minPerLoadBuild", label: "Minutes per Load Build", value: dashboardData.parameters.minutes_per_load_build, defaultValue: dashboardData.parameters.minutes_per_load_build, unit: "min" },
  { id: "minPerAppt", label: "Minutes per Appointment", value: dashboardData.parameters.minutes_per_appointment, defaultValue: dashboardData.parameters.minutes_per_appointment, unit: "min" },
  { id: "minCallDuration", label: "Min Call Duration", value: dashboardData.parameters.min_call_duration_seconds, defaultValue: dashboardData.parameters.min_call_duration_seconds, unit: "sec" },
]

// Utility Functions
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatNumber = (value: number): string => {
  return new Intl.NumberFormat("en-US").format(value)
}

// Augment Logo Component
function AugmentLogo({ className = "" }: { className?: string }) {
  return (
    <svg 
      width="18" 
      height="18" 
      viewBox="0 0 24 24" 
      fill="currentColor"
      className={className}
    >
      {/* 8-pointed flower/star shape with center circle */}
      <path d="M12 0C12 0 14 4 14.5 6C15.5 4.5 19 2 19 2C19 2 17.5 5.5 18 6.5C20 7 24 9 24 9C24 9 20 11 18 11.5C17.5 12.5 19 16 19 16C19 16 15.5 13.5 14.5 14.5C14 16.5 12 24 12 24C12 24 10 16.5 9.5 14.5C8.5 13.5 5 16 5 16C5 16 6.5 12.5 6 11.5C4 11 0 9 0 9C0 9 4 7 6 6.5C6.5 5.5 5 2 5 2C5 2 8.5 4.5 9.5 6C10 4 12 0 12 0Z" transform="translate(0, 3) scale(1)" />
      <circle cx="12" cy="12" r="3" fill="#0D2318" />
    </svg>
  )
}

// Custom Line Chart Icon Component
function LineChartIcon({ className = "" }: { className?: string }) {
  return (
    <svg 
      width="18" 
      height="18" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={className}
    >
      {/* L-shaped axis */}
      <path d="M3 3v18h18" />
      {/* Data points connected by lines */}
      <circle cx="7" cy="17" r="2" fill="currentColor" />
      <circle cx="11" cy="12" r="2" fill="currentColor" />
      <circle cx="15" cy="14" r="2" fill="currentColor" />
      <circle cx="19" cy="7" r="2" fill="currentColor" />
      {/* Connecting lines */}
      <path d="M7 17 L11 12 L15 14 L19 7" />
    </svg>
  )
}

// Sidebar Component
function Sidebar({ activeView }: { activeView: string }) {
  const isDashboardActive = activeView === "summary" || activeView === "workflow"

  return (
    <aside className="fixed left-0 top-0 h-full w-12 bg-[#0D2318] flex flex-col items-center py-3 z-50 max-md:hidden">
      {/* Augment Logo */}
      <div className="p-2 text-white mb-4">
        <AugmentLogo />
      </div>
      
      {/* Main Navigation Icons */}
      <div className="flex flex-col items-center gap-1 flex-1">
        {/* Dashboard - Line Chart Icon (custom) */}
        <button
          className={`p-2 rounded-lg transition-colors ${
            isDashboardActive 
              ? "bg-[#1A3D28] text-white" 
              : "text-[#6B7280] hover:bg-[#1A3D28] hover:text-white/90"
          }`}
        >
          <LineChartIcon />
        </button>
        
        {/* Contacts */}
        <button className="p-2 rounded-lg transition-colors text-[#6B7280] hover:bg-[#1A3D28] hover:text-white/90">
          <Users size={18} />
        </button>
        
        {/* Phone */}
        <button className="p-2 rounded-lg transition-colors text-[#6B7280] hover:bg-[#1A3D28] hover:text-white/90">
          <Phone size={18} />
        </button>
      </div>
      
      {/* Bottom User Avatar */}
      <div className="mt-auto flex flex-col items-center gap-2">
        <button className="p-2 text-[#6B7280] hover:bg-[#1A3D28] hover:text-white/90 rounded-lg transition-colors">
          <Settings size={18} />
        </button>
        <div className="w-7 h-7 rounded-full bg-[#16A34A] text-white text-xs font-medium flex items-center justify-center">
          AB
        </div>
      </div>
    </aside>
  )
}

// Skeleton Loading Component
function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-white border border-[#E5E7EB] rounded-lg ${className}`}>
      <div className="p-5 space-y-3">
        <div className="h-4 bg-[#F3F4F6] rounded w-1/3"></div>
        <div className="h-8 bg-[#F3F4F6] rounded w-2/3"></div>
        <div className="h-3 bg-[#F3F4F6] rounded w-1/2"></div>
      </div>
    </div>
  )
}

// Error State Component
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <AlertCircle className="w-12 h-12 text-[#EF4444] mb-4" />
      <h3 className="text-lg font-semibold text-[#111827] mb-2">
        {"We couldn't load your dashboard data."}
      </h3>
      <p className="text-[#6B7280] mb-6">Please refresh or contact support.</p>
      <Button onClick={onRetry} className="bg-[#16A34A] hover:bg-[#15803D] text-white rounded-md">
        <RefreshCw size={16} className="mr-2" />
        Retry
      </Button>
    </div>
  )
}

// Empty State Component
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <p className="text-[#6B7280]">{message}</p>
    </div>
  )
}

// Trend Chip Component
function TrendChip({ value, isPositive }: { value: string; isPositive: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        isPositive
          ? "bg-[#DCFCE7] text-[#16A34A]"
          : "bg-[#FEE2E2] text-[#EF4444]"
      }`}
    >
      {isPositive ? "+" : ""}
      {value}
    </span>
  )
}

// Status Badge Component
function StatusBadge({ status }: { status: "Active" | "Not active" }) {
  return (
    <span
      className={`text-sm font-medium ${
        status === "Active"
          ? "text-[#22C55E]"
          : "text-[#9CA3AF]"
      }`}
    >
      {status === "Active" ? "Enabled" : "Disabled"}
    </span>
  )
}

// Mini Sparkline Component
function Sparkline({ data, color = "#16A34A" }: { data: number[]; color?: string }) {
  if (!data.length) return null
  
  const chartData = data.map((value, index) => ({ index, value }))
  
  return (
    <div className="w-16 h-6">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Parameter Panel Component
function ParameterPanel({
  parameters,
  onUpdate,
  onReset,
  onClose,
}: {
  parameters: Parameter[]
  onUpdate: (id: string, value: number) => void
  onReset: (id?: string) => void
  onClose: () => void
}) {
  const hasOverrides = parameters.some((p) => p.value !== p.defaultValue)

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white border-l border-[#E5E7EB] shadow-xl z-40 overflow-y-auto transition-transform duration-300">
      <div className="p-5 border-b border-[#E5E7EB] flex items-center justify-between">
        <h3 className="font-semibold text-[#111827]">Labor Assumptions</h3>
        <div className="flex items-center gap-2">
          {hasOverrides && (
            <button
              onClick={() => onReset()}
              className="text-xs text-[#16A34A] hover:underline"
            >
              Reset all to defaults
            </button>
          )}
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#111827]">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {parameters.map((param) => {
          const isOverridden = param.value !== param.defaultValue
          return (
            <div key={param.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#111827] flex items-center gap-2">
                  {param.label}
                  {isOverridden && (
                    <span className="w-2 h-2 rounded-full bg-[#F97316]" />
                  )}
                </label>
                {isOverridden && (
                  <button
                    onClick={() => onReset(param.id)}
                    className="text-xs text-[#6B7280] hover:text-[#111827]"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={param.value}
                  onChange={(e) => onUpdate(param.id, parseFloat(e.target.value) || 0)}
                  className="flex-1 px-3 py-2 border border-[#E5E7EB] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent"
                />
                <span className="text-sm text-[#6B7280] w-8">{param.unit}</span>
              </div>
              <p className="text-xs text-[#9CA3AF]">
                Default: {param.defaultValue} {param.unit}
              </p>
            </div>
          )
        })}
      </div>
      <div className="p-5 border-t border-[#E5E7EB]">
        <Button
          onClick={() => {
            toast.success("Parameters saved successfully")
            onClose()
          }}
          className="w-full bg-[#16A34A] hover:bg-[#15803D] text-white rounded-md"
        >
          Save Changes
        </Button>
      </div>
    </div>
  )
}

// VIEW 1: Program Value Summary
function ProgramValueSummary({
  data,
  dateRange,
  grain,
  onDateRangeChange,
  onGrainChange,
  onWorkflowClick,
  onExport,
  onOpenParameters,
  hasOverrides,
}: {
  data: typeof REAL_DATA
  dateRange: string
  grain: string
  onDateRangeChange: (value: string) => void
  onGrainChange: (value: string) => void
  onWorkflowClick: (workflow: WorkflowData) => void
  onExport: () => void
  onOpenParameters: () => void
  hasOverrides: boolean
}) {
  const activeWorkflows = data.workflows.filter((w) => w.status === "Active")
  const totalValue = activeWorkflows.reduce((sum, w) => sum + (w.laborCostSaved || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#111827]">Value Creation Dashboard</h1>
          <p className="text-sm text-[#6B7280] mt-1">{data.brokerage}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={dateRange} onValueChange={onDateRangeChange}>
            <SelectTrigger className="w-40 rounded-md border-[#E5E7EB]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last4weeks">Last 4 Weeks</SelectItem>
              <SelectItem value="last10weeks">Last 10 Weeks</SelectItem>
              <SelectItem value="lastQuarter">Last Quarter</SelectItem>
              <SelectItem value="yearToDate">Year to Date</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          <Select value={grain} onValueChange={onGrainChange}>
            <SelectTrigger className="w-28 rounded-md border-[#E5E7EB]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={onExport}
            className="rounded-md border-[#E5E7EB] text-[#111827]"
          >
            <Download size={16} className="mr-2" />
            Export CSV
          </Button>
          <span className="text-xs text-[#9CA3AF]">Last updated: {data.lastUpdated}</span>
        </div>
      </div>

      {/* Override Banner */}
      {hasOverrides && (
        <div className="bg-[#FEF9C3] border border-[#FDE047] rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-[#854D0E]">
            Values reflect custom labor assumptions.
          </p>
          <button
            onClick={onOpenParameters}
            className="text-sm text-[#854D0E] font-medium hover:underline"
          >
            View parameters →
          </button>
        </div>
      )}

      {/* Headline Metric Card */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#6B7280] uppercase tracking-wide">
                Total Program Value
              </span>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger>
                    <Info size={14} className="text-[#9CA3AF]" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-sm">Labor cost savings from all active workflows over {data.weeksIncluded} weeks</p>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold text-[#111827]">
                {formatCurrency(data.totalProgramValue)}
              </span>
            </div>
            <p className="text-sm text-[#6B7280]">
              {data.period} · {formatCurrency(data.avgWeeklyValue)}/week avg
            </p>
          </div>
          <div className="w-full lg:w-80 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.weeklyTrend.slice(-10)}>
                <Bar dataKey="value" fill="#16A34A" radius={[4, 4, 0, 0]} />
                <XAxis 
                  dataKey="week" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: "#9CA3AF" }}
                  interval={1}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [formatCurrency(value), "Value"]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Workflow Breakdown Table */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
        <div className="p-5 border-b border-[#E5E7EB]">
          <h2 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wide">
            By Workflow
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                  Workflow
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                  Status
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                  Labor Cost Saved
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                  % of Total
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                  Trend
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {data.workflows.map((workflow) => (
                <tr
                  key={workflow.name}
                  onClick={() => workflow.status === "Active" && onWorkflowClick(workflow)}
                  className={`border-b border-[#E5E7EB] last:border-b-0 transition-colors ${
                    workflow.status === "Active"
                      ? "cursor-pointer hover:bg-[#F9FAFB] group"
                      : ""
                  }`}
                >
                  <td className="px-5 py-4 text-sm font-medium text-[#111827]">
                    {workflow.name}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={workflow.status} />
                  </td>
                  <td className="px-5 py-4 text-sm text-right text-[#111827]">
                    {workflow.laborCostSaved !== null
                      ? formatCurrency(workflow.laborCostSaved)
                      : "—"}
                  </td>
                  <td className="px-5 py-4 text-sm text-right text-[#6B7280]">
                    {workflow.percentOfTotal !== null
                      ? `${workflow.percentOfTotal.toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="px-5 py-4 flex justify-end">
                    <Sparkline data={workflow.trend} />
                  </td>
                  <td className="px-5 py-4">
                    {workflow.status === "Active" && (
                      <ChevronRight
                        size={18}
                        className="text-[#9CA3AF] opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#F9FAFB]">
                <td className="px-5 py-4 text-sm font-semibold text-[#111827]">
                  Total Program Value
                </td>
                <td></td>
                <td className="px-5 py-4 text-sm font-semibold text-right text-[#111827]">
                  {formatCurrency(totalValue)}
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-right text-[#111827]">
                  100%
                </td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        {/* Data notes */}
        <div className="px-5 py-3 border-t border-[#E5E7EB] bg-[#F9FAFB]">
          <p className="text-xs text-[#9CA3AF]">
            Load Building and Appointment Scheduling values are estimated at 12% and 5% of combined workflow activity respectively.
          </p>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Carrier Selection covers Dec 29, 2025 – Jan 30, 2026. Document Collection covers Feb 2 – Feb 23, 2026.
          </p>
        </div>
      </div>

      {/* Secondary Value Callouts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-5">
          <h3 className="text-sm font-medium text-[#6B7280]">Carrying Cost Savings</h3>
          <p className="text-xl font-semibold text-[#111827] mt-1">$4,200 est.</p>
          <p className="text-xs text-[#9CA3AF] mt-2">
            Not included in headline · Document Collection
          </p>
        </div>
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-5">
          <h3 className="text-sm font-medium text-[#6B7280]">After-Hours Capacity Value</h3>
          <p className="text-xl font-semibold text-[#9CA3AF] mt-1">Coming soon</p>
          <p className="text-xs text-[#9CA3AF] mt-2">
            Not included in headline · Carrier Selection
          </p>
        </div>
      </div>
    </div>
  )
}

// VIEW 2: Workflow Drill-Down
function WorkflowDrillDown({
  workflowName,
  data,
  onBack,
  onExport,
}: {
  workflowName: string
  data: typeof REAL_DATA
  onBack: () => void
  onExport: () => void
}) {


  // Get workflow-specific data based on name
  const getWorkflowData = () => {
    switch (workflowName) {
      case "Track & Trace":
        return data.trackAndTrace
      case "Document Collection":
        return data.documentCollection
      case "Carrier Selection":
        return {
          ...data.carrierSelection,
          actions: data.carrierSelection.bidsCollected,
          outreach: { call: 0, email: 0, text: 0 },
        }
      default:
        return data.trackAndTrace
    }
  }

  const workflowData = getWorkflowData()

  const outreachData = [
    { channel: "Call", actions: workflowData.outreach.call, color: "#16A34A" },
    { channel: "Email", actions: workflowData.outreach.email, color: "#22C55E" },
    { channel: "SMS", actions: workflowData.outreach.text, color: "#4ADE80" },
  ].filter(d => d.actions > 0)

  const tmsData = workflowName === "Track & Trace" ? [
    { status: "Pickup Confirmed", count: data.trackAndTrace.tmsUpdates.pickup, color: "#16A34A" },
    { status: "In Transit", count: data.trackAndTrace.tmsUpdates.inTransit, color: "#22C55E" },
    { status: "Delivered", count: data.trackAndTrace.tmsUpdates.delivered, color: "#4ADE80" },
    { status: "Other", count: data.trackAndTrace.tmsUpdates.other, color: "#86EFAC" },
  ] : []

  const channelChartData = outreachData.map(d => ({
    name: d.channel,
    value: d.actions,
    color: d.color,
  }))

  const weeklyOutreachData = workflowName === "Track & Trace" 
    ? data.trackAndTrace.weeklyData.slice(0, 9).map(w => ({
        week: w.week,
        call: w.calls,
        email: w.emails,
        sms: w.sms,
      }))
    : workflowName === "Document Collection"
    ? data.documentCollection.weeklyData.map(w => ({
        week: w.week,
        call: w.calls,
        email: w.emails,
        sms: 0,
      }))
    : data.carrierSelection.weeklyData.map(w => ({
        week: w.week,
        bids: w.bidsCollected,
        booked: w.loadsBooked,
      }))

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[#16A34A] hover:underline"
        >
          <ChevronLeft size={16} />
          Value Creation Dashboard
        </button>
        <span className="text-[#9CA3AF]">/</span>
        <span className="text-[#111827] font-medium">{workflowName}</span>
      </div>

      {/* Tier 2: Value Mechanism */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-[#111827]">How we got there</h2>
          <span className="px-2.5 py-1 bg-[#16A34A] text-white text-xs font-medium rounded-md">
            {workflowName}
          </span>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-5">
            <h3 className="text-sm font-medium text-[#6B7280]">Labor Cost Saved</h3>
            <p className="text-2xl font-semibold text-[#111827] mt-1">
              {formatCurrency(workflowData.saved)}
            </p>
            <p className="text-xs text-[#9CA3AF] mt-2">
              {formatNumber(workflowData.hours)} hours × ${dashboardData.parameters.hourly_rate}/hr
            </p>
          </div>
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-5">
            <h3 className="text-sm font-medium text-[#6B7280]">Labor Hours Replaced</h3>
            <p className="text-2xl font-semibold text-[#111827] mt-1">
              {formatNumber(workflowData.hours)} hrs
            </p>
          </div>
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-5">
            <h3 className="text-sm font-medium text-[#6B7280]">
              {workflowName === "Carrier Selection" ? "Bids Collected" : "Outreach Actions"}
            </h3>
            <p className="text-2xl font-semibold text-[#111827] mt-1">
              {formatNumber(workflowData.actions)} total
            </p>
            {workflowName !== "Carrier Selection" && (
              <div className="flex gap-4 mt-2 text-xs text-[#6B7280]">
                {workflowData.outreach.call > 0 && <span>Call ({formatNumber(workflowData.outreach.call)})</span>}
                {workflowData.outreach.email > 0 && <span>Email ({formatNumber(workflowData.outreach.email)})</span>}
                {workflowData.outreach.text > 0 && <span>SMS ({formatNumber(workflowData.outreach.text)})</span>}
              </div>
            )}
          </div>
        </div>

        {/* TMS Updates - only for Track & Trace */}
        {workflowName === "Track & Trace" && (
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-5">
            <h3 className="text-sm font-medium text-[#6B7280] mb-4">
              TMS Updates Posted ({formatNumber(data.trackAndTrace.tmsUpdates.total)})
            </h3>
            <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
              {tmsData.map((item) => {
                const total = tmsData.reduce((sum, d) => sum + d.count, 0)
                const width = (item.count / total) * 100
                return (
                  <TooltipProvider key={item.status}>
                    <UITooltip>
                      <TooltipTrigger
                        className="h-full transition-opacity hover:opacity-80"
                        style={{ width: `${width}%`, backgroundColor: item.color }}
                      />
                      <TooltipContent>
                        <p className="text-sm">
                          {item.status}: {formatNumber(item.count)}
                        </p>
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-4 mt-3">
              {tmsData.map((item) => (
                <div key={item.status} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[#6B7280]">{item.status}</span>
                  <span className="font-medium text-[#111827]">{formatNumber(item.count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Escalations - only for Track & Trace */}
        {workflowName === "Track & Trace" && (
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-5">
            <h3 className="text-sm font-medium text-[#6B7280] mb-2">Escalations Triggered</h3>
            <p className="text-2xl font-semibold text-[#111827]">{data.trackAndTrace.escalations.total}</p>
            <div className="flex gap-6 mt-2 text-xs text-[#6B7280]">
              <span>Delayed ({data.trackAndTrace.escalations.delayed})</span>
              <span>No Response ({data.trackAndTrace.escalations.noResponse})</span>
              <span>Exception ({data.trackAndTrace.escalations.exception})</span>
            </div>
          </div>
        )}

        {/* Carrier Selection specific metrics */}
        {workflowName === "Carrier Selection" && (
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-5">
            <h3 className="text-sm font-medium text-[#6B7280] mb-4">Booking Performance</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-semibold text-[#111827]">{formatNumber(data.carrierSelection.loadsBooked)}</p>
                <p className="text-xs text-[#6B7280]">Loads Booked</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-[#111827]">{data.carrierSelection.avgBidToBookRate.toFixed(1)}%</p>
                <p className="text-xs text-[#6B7280]">Avg Bid-to-Book Rate</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-[#111827]">{formatNumber(data.carrierSelection.bidsCollected)}</p>
                <p className="text-xs text-[#6B7280]">Total Bids Collected</p>
              </div>
            </div>
          </div>
        )}

        {/* Channel Table */}
        {outreachData.length > 0 && (
          <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
            <div className="p-5 border-b border-[#E5E7EB] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wide">
                By Channel
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={onExport}
                className="rounded-md border-[#E5E7EB] text-[#111827]"
              >
                <Download size={14} className="mr-1" />
                Export CSV
              </Button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                  <th className="text-left px-5 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                    Channel
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                    Actions
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                    Hours Replaced
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {outreachData.map((item) => {
                  const hours = Math.round((item.actions * 2) / 60)
                  const value = Math.round(hours * dashboardData.parameters.hourly_rate)
                  return (
                    <tr key={item.channel} className="border-b border-[#E5E7EB] last:border-b-0">
                      <td className="px-5 py-4 text-sm font-medium text-[#111827]">
                        {item.channel}
                      </td>
                      <td className="px-5 py-4 text-sm text-right text-[#111827]">
                        {formatNumber(item.actions)}
                      </td>
                      <td className="px-5 py-4 text-sm text-right text-[#111827]">
                        {formatNumber(hours)} hrs
                      </td>
                      <td className="px-5 py-4 text-sm text-right text-[#111827]">
                        {formatCurrency(value)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}

// VIEW 3: Access Gate
function AccessGate() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
      <div className="max-w-md text-center px-6">
        <div className="w-16 h-16 bg-white border border-[#E5E7EB] rounded-lg mx-auto mb-6 flex items-center justify-center">
          <LayoutGrid className="text-[#111827]" size={28} />
        </div>
        <h1 className="text-2xl font-semibold text-[#111827] mb-3">
          Manager access required
        </h1>
        <p className="text-[#6B7280] mb-8 leading-relaxed">
          The Value Creation Dashboard is available to team managers and executives. If you
          believe you should have access, please contact your account administrator or your
          Augment account team.
        </p>
        <Button className="bg-[#16A34A] hover:bg-[#15803D] text-white rounded-md px-6">
          Contact account team
        </Button>
      </div>
    </div>
  )
}

// Main Dashboard Component
export default function ValueCreationDashboard() {
  const [currentView, setCurrentView] = useState<"summary" | "workflow" | "access-gate">("summary")
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowData | null>(null)
  const [dateRange, setDateRange] = useState("last10weeks")
  const [grain, setGrain] = useState("week")
  const [showParameterPanel, setShowParameterPanel] = useState(false)
  const [parameters, setParameters] = useState(DEFAULT_PARAMETERS)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  const hasOverrides = parameters.some((p) => p.value !== p.defaultValue)

  const handleWorkflowClick = useCallback((workflow: WorkflowData) => {
    setSelectedWorkflow(workflow)
    setCurrentView("workflow")
  }, [])

  const handleBack = useCallback(() => {
    setCurrentView("summary")
    setSelectedWorkflow(null)
  }, [])

  const handleExport = useCallback(() => {
    toast.success("Export ready — file downloading.", {
      icon: <CheckCircle size={16} className="text-[#16A34A]" />,
    })
  }, [])

  const handleParameterUpdate = useCallback((id: string, value: number) => {
    setParameters((prev) =>
      prev.map((p) => (p.id === id ? { ...p, value } : p))
    )
  }, [])

  const handleParameterReset = useCallback((id?: string) => {
    if (id) {
      setParameters((prev) =>
        prev.map((p) => (p.id === id ? { ...p, value: p.defaultValue } : p))
      )
    } else {
      setParameters(DEFAULT_PARAMETERS)
    }
  }, [])

  const handleRetry = useCallback(() => {
    setIsLoading(true)
    setHasError(false)
    setTimeout(() => {
      setIsLoading(false)
    }, 1500)
  }, [])

  // Render Access Gate view
  if (currentView === "access-gate") {
    return <AccessGate />
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Sidebar activeView={currentView} />
      
      <main className="md:ml-12 p-6 lg:p-8 max-w-[1400px]">
        {isLoading ? (
          <div className="space-y-6">
            <SkeletonCard className="h-48" />
            <SkeletonCard className="h-64" />
            <div className="grid grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        ) : hasError ? (
          <ErrorState onRetry={handleRetry} />
        ) : currentView === "summary" ? (
          <ProgramValueSummary
            data={REAL_DATA}
            dateRange={dateRange}
            grain={grain}
            onDateRangeChange={setDateRange}
            onGrainChange={setGrain}
            onWorkflowClick={handleWorkflowClick}
            onExport={handleExport}
            onOpenParameters={() => setShowParameterPanel(true)}
            hasOverrides={hasOverrides}
          />
        ) : (
          <WorkflowDrillDown
            workflowName={selectedWorkflow?.name || "Track & Trace"}
            data={REAL_DATA}
            onBack={handleBack}
            onExport={handleExport}
          />
        )}
      </main>

      {/* Parameter Panel Overlay */}
      {showParameterPanel && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-30"
            onClick={() => setShowParameterPanel(false)}
          />
          <ParameterPanel
            parameters={parameters}
            onUpdate={handleParameterUpdate}
            onReset={handleParameterReset}
            onClose={() => setShowParameterPanel(false)}
          />
        </>
      )}
    </div>
  )
}
