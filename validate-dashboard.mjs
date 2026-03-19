/**
 * Dashboard Data Validation Script
 *
 * Compares the dashboard API output against direct Snowflake queries
 * to flag any discrepancies. Run with:
 *
 *   node validate-dashboard.mjs [brokerage] [from] [to]
 *
 * Defaults: transportation-one, 2026-01-01, 2026-03-18
 */
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import snowflake from "snowflake-sdk";
snowflake.configure({ logLevel: "WARN" });

const brokerage = process.argv[2] ?? "transportation-one";
const from = process.argv[3] ?? "2026-01-01";
const to = process.argv[4] ?? "2026-03-18";

// --- Connect to Snowflake ---
const smClient = new SecretsManagerClient({ region: "us-east-1" });
const { SecretString } = await smClient.send(
  new GetSecretValueCommand({ SecretId: "ReportingInvestigationAgentSnowflake-prod" })
);
const creds = JSON.parse(SecretString);
const pk = creds.private_key
  .replace(/-----BEGIN PRIVATE KEY-----/, "")
  .replace(/-----END PRIVATE KEY-----/, "")
  .replace(/\s+/g, "")
  .match(/.{1,64}/g)
  .join("\n");

const conn = snowflake.createConnection({
  account: creds.account, username: creds.user,
  privateKey: `-----BEGIN PRIVATE KEY-----\n${pk}\n-----END PRIVATE KEY-----`,
  authenticator: "SNOWFLAKE_JWT", warehouse: creds.warehouse,
  database: creds.database, schema: creds.schema, role: creds.role,
});
await new Promise((r, e) => conn.connect((err) => (err ? e(err) : r())));
const q = (sql, binds) => new Promise((r, e) =>
  conn.execute({ sqlText: sql, binds, complete: (err, _, rows) => (err ? e(err) : r(rows)) })
);

console.log(`\n${"=".repeat(70)}`);
console.log(`DASHBOARD VALIDATION: ${brokerage}`);
console.log(`Date range: ${from} to ${to}`);
console.log(`${"=".repeat(70)}\n`);

// --- Ground truth: simple SUM with DATE filter, per workflow ---
const truthSql = `
SELECT
  WORKFLOW,
  SUM(HOURS_SAVED) AS HOURS_SAVED,
  SUM(OUTBOUND_CALLS) AS OUTBOUND_CALLS,
  SUM(INBOUND_CALLS) AS INBOUND_CALLS,
  SUM(OUTBOUND_CALLS + INBOUND_CALLS) AS TOTAL_CALLS,
  SUM(EMAILS_SENT) AS EMAILS_SENT,
  SUM(EMAILS_RECEIVED) AS EMAILS_RECEIVED,
  SUM(EMAILS_SENT + EMAILS_RECEIVED) AS TOTAL_EMAILS,
  SUM(NUM_SENT_TEXTS) AS TEXTS_SENT,
  SUM(NUM_RECEIVED_TEXTS) AS TEXTS_RECEIVED,
  SUM(NUM_SENT_TEXTS + NUM_RECEIVED_TEXTS) AS TOTAL_TEXTS,
  SUM(NUM_TMS_UPDATES_SENT) AS TMS_UPDATES,
  COUNT(DISTINCT DATE) AS DAYS_WITH_DATA,
  TO_CHAR(MIN(DATE), 'YYYY-MM-DD') AS FIRST_DATE,
  TO_CHAR(MAX(DATE), 'YYYY-MM-DD') AS LAST_DATE
FROM MART_REPORTING__ROI_BY_CUSTOMER_AND_WORKFLOW
WHERE BROKERAGE_KEY = ?
  AND DATE >= ?
  AND DATE <= ?
GROUP BY WORKFLOW
ORDER BY WORKFLOW`;

const truth = await q(truthSql, [brokerage, from, to]);

console.log("GROUND TRUTH (direct Snowflake SUM with DATE filter):");
console.log(`SQL: SELECT ... FROM MART_REPORTING__ROI_BY_CUSTOMER_AND_WORKFLOW`);
console.log(`     WHERE BROKERAGE_KEY = '${brokerage}' AND DATE >= '${from}' AND DATE <= '${to}'\n`);

const WORKFLOW_MAP = {
  track_and_trace: "tt", pod_collection: "dc",
  carrier_selection: "cs", load_building: "lb", scheduling: "as",
};

const truthByKey = {};
let truthTotalHours = 0;

for (const row of truth) {
  const key = WORKFLOW_MAP[row.WORKFLOW] ?? row.WORKFLOW;
  truthByKey[key] = row;
  truthTotalHours += row.HOURS_SAVED;
  console.log(`  ${row.WORKFLOW} (${key}):`);
  console.log(`    Hours saved:  ${row.HOURS_SAVED}`);
  console.log(`    Calls:        ${row.TOTAL_CALLS} (out: ${row.OUTBOUND_CALLS}, in: ${row.INBOUND_CALLS})`);
  console.log(`    Emails:       ${row.TOTAL_EMAILS} (sent: ${row.EMAILS_SENT}, recv: ${row.EMAILS_RECEIVED})`);
  console.log(`    Texts:        ${row.TOTAL_TEXTS} (sent: ${row.TEXTS_SENT}, recv: ${row.TEXTS_RECEIVED})`);
  console.log(`    TMS updates:  ${row.TMS_UPDATES}`);
  console.log(`    Date range:   ${row.FIRST_DATE} to ${row.LAST_DATE} (${row.DAYS_WITH_DATA} days)`);
  console.log();
}
console.log(`  TOTAL HOURS: ${truthTotalHours}\n`);

// --- Dashboard API output ---
const apiUrl = `http://localhost:3099/api/dashboard?from=${from}&to=${to}&brokerage=${encodeURIComponent(brokerage)}`;
let api;
try {
  const res = await fetch(apiUrl);
  api = await res.json();
} catch (e) {
  console.log(`\n❌ Could not reach dashboard API at ${apiUrl}`);
  console.log("   Start the dev server with: npx next dev --port 3099\n");
  conn.destroy(() => {});
  process.exit(1);
}

console.log("DASHBOARD API OUTPUT:");
console.log(`  Total hours: ${api.totalHours}`);
console.log(`  Weeks: ${api.weeksCount}\n`);

// --- Compare ---
console.log("COMPARISON (Ground Truth vs Dashboard API):");
console.log(`${"─".repeat(70)}`);
console.log(`${"Metric".padEnd(35)} ${"Snowflake".padStart(12)} ${"Dashboard".padStart(12)} ${"Match?".padStart(8)}`);
console.log(`${"─".repeat(70)}`);

let allMatch = true;

function compare(label, truthVal, apiVal, tolerance = 0.5) {
  const diff = Math.abs(truthVal - apiVal);
  const match = diff <= tolerance;
  if (!match) allMatch = false;
  const icon = match ? "  ✓" : "  ✗ DIFF";
  console.log(`${label.padEnd(35)} ${String(truthVal).padStart(12)} ${String(apiVal).padStart(12)} ${icon}`);
  if (!match) {
    console.log(`${"".padEnd(35)} ${"".padStart(12)} ${"".padStart(12)}   (off by ${diff.toFixed(1)})`);
  }
}

compare("Total Hours", Math.round(truthTotalHours), Math.round(api.totalHours));

for (const wf of api.workflows) {
  const t = truthByKey[wf.key];
  if (!t && wf.hoursSaved === 0 && wf.activity.calls === 0) continue; // skip Not Live with no truth data

  console.log(`${"─".repeat(70)}`);
  console.log(`${wf.name} (${wf.key}):`);

  if (!t) {
    if (wf.hoursSaved > 0 || wf.activity.calls > 0 || wf.activity.emails > 0) {
      console.log(`  ✗ Dashboard shows data but NO Snowflake data found!`);
      allMatch = false;
    }
    continue;
  }

  compare(`  Hours Saved`, Math.round(t.HOURS_SAVED), Math.round(wf.hoursSaved));
  compare(`  Calls (out+in)`, t.TOTAL_CALLS, wf.activity.calls, 0);
  compare(`  Emails (sent+recv)`, t.TOTAL_EMAILS, wf.activity.emails, 0);
  compare(`  Texts (sent+recv)`, t.TOTAL_TEXTS, wf.activity.texts, 0);
  compare(`  TMS Updates`, t.TMS_UPDATES, wf.activity.tmsUpdates, 0);
}

console.log(`${"─".repeat(70)}`);
console.log(`\n${allMatch ? "✅ ALL VALUES MATCH" : "❌ DISCREPANCIES FOUND — see above"}\n`);

conn.destroy(() => {});
