import { NextResponse } from "next/server"
import { getDemoBrokerages } from "@/lib/demo-data"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const name = url.searchParams.get("name")
  return NextResponse.json(getDemoBrokerages(name))
}
