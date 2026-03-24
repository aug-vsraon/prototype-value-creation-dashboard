import { NextResponse } from "next/server"
import { createSnowflakeClient } from "@/lib/snowflake"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

interface BrokerageRow {
  BROKERAGE_KEY: string
  DAYS: number
}

const EXCLUDED = new Set([
  "null", "voice-demo", "augment-turvo", "augment-broker",
  "augment-brokerage-test", "test-brokerage", "augment-logistics",
  "augment-brokerag", "dynamic-logistix-test", "lds-logistics-test",
  "shanahan-trans-test", "arian-brokerage",
])

function titleCase(key: string): string {
  return key.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

export async function GET() {
  const sf = await createSnowflakeClient()
  try {
    const rows = await sf.query<BrokerageRow>(
      `SELECT DISTINCT BROKERAGE_KEY, COUNT(*) AS DAYS
       FROM MART_REPORTING__ROI_BY_CUSTOMER_AND_WORKFLOW
       WHERE BROKERAGE_KEY IS NOT NULL
       GROUP BY BROKERAGE_KEY
       ORDER BY DAYS DESC`,
    )

    const brokerages = rows
      .filter((r) => !EXCLUDED.has(r.BROKERAGE_KEY?.toLowerCase()))
      .map((r) => ({
        key: r.BROKERAGE_KEY,
        label: titleCase(r.BROKERAGE_KEY),
      }))

    return NextResponse.json(brokerages)
  } catch (error) {
    console.error("Brokerages API error:", error)
    return NextResponse.json({ error: "Failed to fetch brokerages" }, { status: 500 })
  } finally {
    sf.close()
  }
}
