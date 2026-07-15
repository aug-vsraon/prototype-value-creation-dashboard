#!/usr/bin/env python3
"""Create the 6 Ferguson PO report cards + dashboard in Metabase (WISMO collection)."""
import json, re, sys, uuid, urllib.request

BASE = "https://augment.metabaseapp.com"
KEY = json.load(open("/Users/vs/.claude.json"))["mcpServers"]["metabase"]["env"]["METABASE_API_KEY"]
SQL_FILE = "/private/tmp/claude-501/-Users-vs-Desktop-augie-chat-prototype/41694883-5ec0-4008-bc7c-310de587edc9/scratchpad/prototype-value-creation-dashboard/metabase/ferguson-po-reports.sql"
COLLECTION = 11683   # WISMO
DATABASE = 34        # Snowflake Prod

def api(method, path, payload=None):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"x-api-key": KEY, "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:2000]
        sys.exit(f"{method} {path} -> {e.code}: {body}")

# ---- split the SQL file into the six report queries ----
text = open(SQL_FILE).read()
blocks = re.split(r"^-- =+$", text, flags=re.M)
reports = {}
for i, b in enumerate(blocks):
    m = re.match(r"\s*-- REPORT (\d)", b)
    if not m:
        continue
    n = int(m.group(1))
    # SQL starts at the first WITH after the comment header (in the NEXT block,
    # since the closing ==== line splits header from body)
    body = blocks[i + 1]
    sql = body[body.index("WITH"):].strip().rstrip(";").strip()
    reports[n] = sql
assert sorted(reports) == [1, 2, 3, 4, 5, 6], f"parsed reports: {sorted(reports)}"

def tag(name, display, type_, required=False, default=None):
    t = {"id": str(uuid.uuid4()), "name": name, "display-name": display,
         "type": type_, "required": required}
    if default is not None:
        t["default"] = default
    return {name: t}

CARDS = {
    1: ("Ferguson PO Report — 1 Shipped",
        "ERP upload: PO-lines whose latest supplier update is SHIPPED or PARTIAL. "
        "Ship date + expected arrival (ship+3, else exact ETA, else stated delivery) + tracking. "
        "updates[] schema, data from 2026-07-06. Latest-update-wins per PO-line. "
        "Optional {{logon}} for per-logon subscription files."),
    2: ("Ferguson PO Report — 2 Delivered / Pickup",
        "ERP upload: PO-lines whose latest update is DELIVERED or PICKED_UP. Delivery date = "
        "CURRENT_DATE (never past, Trilogy-safe). POD Received is BLANK — no structured POD "
        "field exists in the extraction yet (eng follow-up). Optional {{logon}}."),
    3: ("Ferguson PO Report — 3 PO Not Found",
        "Review file: POs whose latest update is NOT_FOUND (vendor has no record) or "
        "NEEDS_PO_COPY (vendor asked for a copy). Buyer is BLANK — field exists in no source yet. "
        "Context = classifier notes/evidence; includes responder address. Optional {{logon}}."),
    4: ("Ferguson PO Report — 4 Not Shipped (Latest ETA)",
        "ERP upload: PO-lines whose latest update is NOT_SHIPPED, with best expected date: "
        "classifier etaDate, else SQL-normalized fuzzy month text (mid→15th, early→5th, "
        "late/end→25th), else claimed ship date+3, else load updatedArrivalDate. Verbatim vendor "
        "ETA text included. Optional {{logon}}."),
    5: ("Ferguson PO Report — 5 Cancelled",
        "ERP upload (Trilogy cleanup): PO-lines whose latest update is CANCELLED, with classifier "
        "notes. CANCELLED is a first-class status since 2026-07-06 — no exceptionReason "
        "dependency. Optional {{logon}}."),
    6: ("Ferguson PO Report — 6 Never Responded",
        "Weekly review file: vendor contacts with zero non-bounce replies on any thread older "
        "than {{grace_days}} (default 7). Prefers non-@ferguson.com outreach addresses. Caveat: "
        "bounces are not observable in this pipeline, so silent deliverability failures look "
        "identical to non-response."),
}

card_ids = {}
for n in sorted(CARDS):
    name, desc = CARDS[n]
    sql = reports[n]
    tags = {}
    if "{{logon}}" in sql:
        tags.update(tag("logon", "Logon", "text"))
    if "{{grace_days}}" in sql:
        tags.update(tag("grace_days", "Grace Days", "number", required=True, default="7"))
    payload = {
        "name": name,
        "description": desc,
        "collection_id": COLLECTION,
        "display": "table",
        "visualization_settings": {},
        "dataset_query": {
            "type": "native",
            "database": DATABASE,
            "native": {"query": sql, "template-tags": tags},
        },
    }
    card = api("POST", "/api/card", payload)
    card_ids[n] = card["id"]
    print(f"card {n}: id={card['id']} {name}")

# ---- dashboard ----
dash = api("POST", "/api/dashboard", {
    "name": "Ferguson PO Outcome Reports",
    "collection_id": COLLECTION,
    "description": (
        "Six outcome buckets for the Ferguson PO Outcome Reporting pilot, one card per "
        "CSV subscription. Data: emailAnalysisResult.updates[] (since 2026-07-06) joined to "
        "load customData; latest update wins per PO-line. Use the Logon filter to pin "
        "per-logon subscriptions (reports 1-5); Grace Days feeds report 6. "
        "Known blanks: POD Received (report 2), Buyer (report 3) — fields don't exist upstream yet."
    ),
})
dash_id = dash["id"]
print(f"dashboard: id={dash_id}")

logon_param = {"id": "a1b2c3d4", "name": "Logon", "slug": "logon",
               "type": "string/=", "sectionId": "string"}
grace_param = {"id": "e5f6a7b8", "name": "Grace Days", "slug": "grace_days",
               "type": "number/=", "sectionId": "number"}

dashcards = []
row = 0
for n in sorted(CARDS):
    cid = card_ids[n]
    mappings = []
    if "{{logon}}" in reports[n]:
        mappings.append({"parameter_id": logon_param["id"], "card_id": cid,
                         "target": ["variable", ["template-tag", "logon"]]})
    if "{{grace_days}}" in reports[n]:
        mappings.append({"parameter_id": grace_param["id"], "card_id": cid,
                         "target": ["variable", ["template-tag", "grace_days"]]})
    dashcards.append({"id": -n, "card_id": cid, "row": row, "col": 0,
                      "size_x": 24, "size_y": 7, "series": [],
                      "visualization_settings": {},
                      "parameter_mappings": mappings})
    row += 7

api("PUT", f"/api/dashboard/{dash_id}", {
    "parameters": [logon_param, grace_param],
    "dashcards": dashcards,
})
print(f"done: {BASE}/dashboard/{dash_id}")
