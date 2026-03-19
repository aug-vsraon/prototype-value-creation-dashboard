import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET() {
  const checks: Record<string, string> = {}

  // Check env vars
  checks.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ? "set (" + process.env.AWS_ACCESS_KEY_ID.slice(0, 8) + "...)" : "MISSING"
  checks.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ? "set (****)" : "MISSING"
  checks.AWS_REGION = process.env.AWS_REGION ?? "not set (will default)"

  // Check snowflake-sdk import
  try {
    const snowflake = await import("snowflake-sdk")
    checks.snowflake_sdk = "loaded OK (v" + (snowflake.default?.version ?? "unknown") + ")"
  } catch (e) {
    checks.snowflake_sdk = "IMPORT FAILED: " + (e instanceof Error ? e.message : String(e))
  }

  // Check AWS SDK import
  try {
    const { SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager")
    checks.aws_sdk = "loaded OK"

    // Try to fetch the secret
    try {
      const { GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager")
      const client = new SecretsManagerClient({ region: "us-east-1" })
      const { SecretString } = await client.send(
        new GetSecretValueCommand({ SecretId: "ReportingInvestigationAgentSnowflake-prod" })
      )
      const creds = JSON.parse(SecretString!)
      checks.secret_fetch = "OK (account: " + creds.account + ", user: " + creds.user + ")"
    } catch (e) {
      checks.secret_fetch = "FAILED: " + (e instanceof Error ? e.message : String(e))
    }
  } catch (e) {
    checks.aws_sdk = "IMPORT FAILED: " + (e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json(checks, { status: 200 })
}
