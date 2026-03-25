import { NextResponse } from "next/server"
import { getDemoDashboardData } from "@/lib/demo-data"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const from = url.searchParams.get("from") ?? "2026-02-09"
  const to = url.searchParams.get("to") ?? "2026-03-08"
  const brokerage = url.searchParams.get("brokerage") ?? "acme-logistics"
  const name = url.searchParams.get("name")

  return NextResponse.json(getDemoDashboardData(from, to, brokerage, name))
}
