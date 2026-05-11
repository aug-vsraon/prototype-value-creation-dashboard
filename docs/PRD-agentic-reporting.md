# PRD: Agentic Reporting — Portal Dashboard & Reporting Vision

**Author:** Vikram Sraon  
**Status:** Draft  
**Last Updated:** 2026-05-11  
**Scope:** This document defines the user stories, product requirements, and iterative roadmap for Augment's portal-native reporting product — spanning standard workflow dashboards, the Value Creation Dashboard, and the agentic (conversational) report-building layer.

---

## 1. Background & Context

Augment launched V1 of portal-native reporting on May 1, 2026, replacing Metabase embedded links with a first-party reporting layer for POD, Track & Trace, and Carrier Selection workflows. The launch confirmed strong latent demand — immediate customer feedback requests poured in and CRST flagged that their ops team could not meaningfully use the portal without better filtering and drill-down.

Separately, a Value Creation Dashboard has been in development — a board-level ROI narrative that translates Augment's workflow activity into a single "Total Program Value" dollar figure. A working Vercel prototype and a full metric PRD exist but the experience has not yet been integrated into the portal.

The next product iteration sits at the intersection of these two threads: take the reporting surface from a Metabase clone to a product that only Augment can build — one where Augie builds and customizes reports for users through a conversational interface, using live knowledge of the underlying data schema.

---

## 2. Problem Statement

**For customers:** There is no self-serve reporting layer that (a) is visually compelling enough for a VP to present at a board meeting, (b) is operationally detailed enough for a driver manager monitoring 300+ loads, and (c) adapts to a customer's specific workflows, data definitions, and organizational structure without a custom engineering request.

**For Augment:** Every custom reporting request today flows to a small engineering team. Metabase has been the escape valve, but it produces per-customer debt, inconsistent metric definitions, and zero product stickiness. The portal is the right surface — but only if it can fulfill the range of reporting needs without infinite one-off build work.

**The opportunity:** Augment's data models (Snowflake + dbt mart tables), combined with a conversational AI layer already proven internally via "Mr. SQL," can enable a class of reporting experience that no incumbent TMS or logistics BI tool offers: a user describes what they want to know, and Augie builds the report in real time, persists it to a dashboard, and answers follow-up questions — all inside the portal. Over time, this turns Augie into the operator's **system of record** — the place they go to understand their own business, displacing ad-hoc TMS exports and Metabase one-offs with a living, self-improving reporting layer. This is especially high-leverage given that most freight brokerages have poor internal data infrastructure; Augie fills a gap that their own TMS cannot.

---

## 3. User Personas

### Persona 1 — Executive / Board Sponsor
VP of Operations, CxO, Board Member. Opens reporting at renewal conversations, board prep, budget reviews. Needs one headline number. Can't be asked to navigate or configure. Exports for a deck or a board report in under 30 seconds.

**Success:** Total Program Value is the first thing visible. No navigation required. Can export in under 30 seconds.

### Persona 2 — Operations Manager / Finance
Director of Operations, Finance Business Partner, Controller. Opens reporting at budget cycles, assumption validation, ahead of renewals. Needs to understand how the headline number was calculated and verify the underlying assumptions match their actual labor costs.

**Success:** Formula is transparent: volumes × minutes × rate. Each parameter is visible and overridable. Recalculation is immediate.

### Persona 3 — Operations Manager / Workflow Owner
Head of Operations, Carrier Rep Managers, Director of Brokerage Operations. Opens reporting weekly for workflow performance checks. Needs to understand how a specific workflow is performing, see coverage rates, throughput, booking rates.

**Success:** Drill-down reveals actionable operational detail without requiring knowledge of Augment's internal architecture. Can filter by date, export, and share.

### Persona 4 — Driver Manager / Ops Coordinator (Load Building)
Front-line operator managing a subset of shippers and loads. Needs a real-time operational view of loads that are relevant to them — not a company-wide feed. Needs to act on failed or flagged loads immediately.

**Success:** Can filter the portal to their assigned loads and customers. Sees failed/flagged loads without scrolling through hundreds of irrelevant entries.

### Persona 5 — CS / Account Manager (Internal)
Augment customer success rep. Needs to validate that portal reporting numbers match what the customer's TMS shows, answer customer questions about metric definitions, and quickly pull data for a QBR or renewal conversation without filing an engineering ticket.

**Success:** Can open a customer's dashboard, verify the data is consistent with their source system, and export or share a view directly with the customer.

---

## 4. Use Cases / User Stories

### 4A. Standard Workflow Reporting

**US-01 — Executive Summary View**
As a VP of Operations preparing for a QBR, I want to open a single dashboard and see a time-trended summary of Augment's impact across all active workflows for my brokerage, so I can validate ROI without navigating multiple reports or writing SQL.

**US-02 — Workflow Drill-Down**
As an operations manager, I want to click into any active workflow and see the full operational detail — coverage rates, action volumes, error rates, booking outcomes — so I can assess whether the workflow is performing to expectation.

**US-03 — Date Range & Grain Control**
As any reporting user, I want to adjust the reporting date range (custom, last 4 weeks, last quarter, YTD) and granularity (day/week/month/quarter), so I can look at trends, compare periods, and align reports to my business review cadence.

**US-04 — Timezone & Week Definition**
As a customer whose operations run in a non-CST timezone or whose internal reporting uses a Monday–Sunday week definition, I want the portal to respect my timezone and week boundary so that my portal numbers match my internal systems.

**US-05 — CSV Export**
As any reporting user, I want to export the data in the currently visible view (with all applied filters and date ranges) to a CSV, so I can include it in a board deck, share it with finance, or upload it to my own tools.

**US-06 — Load Building Dashboard**
As a CRST operations manager, I want to see load building reporting in the portal — including loads built, draft accuracy rate, error rate, and loads needing review — so I can manage my load building operation without relying on Metabase.

**US-07 — Load-Level Drill-Down (Operations)**
As a driver manager managing load building for a specific shipper, I want to click from a summary metric (e.g., "4 loads need attention this week") into the specific load records that comprise that number, so I can act on them immediately without running a separate query.

**US-08 — Customer / Shipper Filter**
As a CRST operations manager with multiple active shippers, I want to filter all reporting views by customer or customer code, so I can isolate performance for a specific shipper rather than viewing all CRST traffic combined.

**US-09 — User / Rep Level Filter**
As a driver manager, I want to filter reporting to loads or interactions assigned to me or my team, so I can monitor my own performance without seeing company-wide data.

**US-10 — Escalation Reporting**
As a Track & Trace operations manager, I want to see a breakdown of escalations that Augie triggered — by category, volume, and trend — so I can understand where communication issues are occurring and optimize my SOP.

**US-11 — Appointment Scheduling Dashboard**
As a workflow owner for appointment scheduling, I want to see booking success rates, booking latency, and requests per load, so I can identify scheduling bottlenecks across facilities.

**US-12 — New Workflow Auto-Reporting**
As a brokerage enabling a new Augment workflow, I want standard reporting for that workflow to appear in my portal automatically — without a custom build request to Augment — so my team can begin measuring performance from day one.

**US-13 — Scheduled / Emailed Exports**
As an Augment customer using reporting for weekly ops reviews, I want to receive a scheduled CSV export of my standard reports via email, so my team gets consistent reporting without logging into the portal.

---

### 4B. Value Creation Dashboard

**US-14 — Total Program Value Headline**
As a VP of Operations or CFO preparing for a contract renewal, I want to open a dashboard and immediately see a single dollar figure representing the total labor cost saved by Augment across all active workflows, so I can validate the ROI claim without manual calculations or slide-deck preparation.

**US-15 — Workflow Contribution Breakdown**
As a VP of Operations, I want to see how Total Program Value breaks down by workflow (Document Collection, Track & Trace, Carrier Selection, Load Building, Appointment Scheduling), so I can understand which workflows drive the most value and make expansion decisions.

**US-16 — Value Formula Transparency**
As a Director of Operations or Finance Business Partner, I want to see the formula behind the dollar figures (volume × minutes per action × hourly rate), so I can validate that the assumptions are reasonable and confidently present the numbers internally.

**US-17 — Configurable Labor Rate Parameters**
As a brokerage operations leader, I want to override the default labor rate and task duration assumptions with my actual costs, so the Total Program Value reflects my specific context rather than industry-average estimates.

**US-18 — Inactive Workflow Signaling**
As an executive viewing the dashboard, I want inactive (not yet deployed) workflows to be visually distinct from active workflows with no data — and shown as "future value unlock" — so I can understand both what Augment is delivering today and what growth potential remains.

**US-19 — Period-over-Period Comparison**
As a Finance Business Partner validating Augment's value at a budget cycle, I want to compare Total Program Value (and per-workflow contributions) across two time periods, so I can show value growth over time.

**US-20 — Dashboard Export for Board / QBR**
As an executive, I want to export the current dashboard view (with my applied date range and parameters) in a format I can embed in a board deck or QBR, so I can share the numbers without screenshots or manual re-entry.

**US-21 — Emotional Storytelling / Visual Narrative**
As a VP of Operations sharing this dashboard with her CFO, I want the dashboard to feel like a premium, purpose-built product — not a generic BI tool — so the visual presentation reinforces the credibility of the ROI claim. *(Art's direction, May 4, 2026: "The dashboard's emotional storytelling is incredibly important and needs to be visually compelling beyond just rendering standard charts and tables." This user story is a first-class product requirement, not a nice-to-have.)*

---

### 4C. Agentic / Conversational Reporting

**US-22 — Ask a Question About Existing Reports**
As any reporting user viewing a dashboard or report, I want to ask Augie a natural-language question about the data I'm looking at ("Why did my T&T coverage rate drop last week?"), so I can get an immediate interpretation without opening Metabase or filing a ticket.

**US-23 — Create a New Report via Conversation**
As an operations manager who wants a custom view, I want to describe what I'm looking for in plain English ("Show me load building requests by status for my top 5 shippers this month") and have Augie generate a report for me, so I never need to write SQL or wait for an engineering ticket.

**US-24 — Validate and Iterate on a Generated Report**
As a user who received a generated report from Augie, I want to refine it conversationally ("Actually, exclude loads with status 'test'") and see the updated report in real time, so I can get exactly what I need without understanding the underlying data model.

**US-25 — Save a Report to a Dashboard**
As a user who has created or refined a report via conversation, I want to save it to a named dashboard so it persists for me and my team, accessible without re-querying each time.

**US-26 — Create and Manage Custom Dashboards**
As an operations manager, I want to create a new named dashboard, add reports to it (both Augment-standard and custom-generated), rearrange them, and add text context blocks, so I can build a daily operational view tailored to my team.

**US-27 — Edit Existing Reports**
As a user who owns a saved custom report, I want to edit it — changing filters, date ranges, or visualizations — with Augie's assistance, and save it (including as a new version), so I can keep reports current as my needs evolve.

**US-28 — Escalate an Unanswerable Question**
As a user whose question Augie could not answer correctly, I want to flag the issue and have a ticket automatically created for the Augment reporting team, so my feedback is captured and addressed without manual back-and-forth.

**US-29 — Data Consistency Across Surfaces**
As a CS rep reconciling a customer's portal numbers with their TMS data, I want the portal, Augie chat responses, and any exported reports to all reflect the same underlying mart table data, so I can confidently stand behind the numbers without fear of conflicting figures.

---

### 4D. Access Control & Permissions

**US-30 — Role-Based Access**
As a brokerage administrator, I want to control which users (managers vs. front-line operators) can access reporting and at what level of detail, so sensitive financial and operational data is appropriately scoped.

**US-31 — Multi-Level Organizational Reporting (Aggregator / Sub-broker)**
As a corporate administrator for a holding company like Armstrong that manages multiple sub-brokerages, I want to see aggregate reporting across all sub-brokerages as well as drill into individual agent-level data, so I can manage my entire book of business from a single view.

**US-32 — Custom Report Ownership & Sharing**
As a user who created a custom report, I want to define whether it is personal (only me), team-shared (all managers at my brokerage), or admin-shared (specific roles), so I can control who sees and edits my configurations.

**US-33 — Secure Shareable Report Links**
As a manager, I want to generate a secure link to a specific report view (with applied filters and date range) that I can share with a colleague or my Augment CSM, so they can see exactly what I'm looking at without additional login friction.

---

### 4E. Internal / CS Tooling

**US-34 — Internal Demo Environment**
As an Augment sales rep presenting to a prospect, I want access to an anonymized demo version of the reporting portal so I can walk a prospect through what their reporting experience will look like, without showing another customer's data.

**US-35 — Source Table Transparency**
As an Augment CS rep or internal data analyst, I want access to the underlying dbt mart table logic and SQL behind each standard report, so I can reconcile customer discrepancies, debug data issues, and train new team members confidently.

**US-36 — Report Usage Analytics (Internal)**
As a product manager or CS lead, I want to see how frequently each customer is accessing specific reports and which reports are most-viewed, so I can prioritize which standard reports to invest in and understand adoption patterns.

---

## 5. Product Areas & Requirements

### 5A. Standard Workflow Reporting (V1 → V2)

**Current state:** POD, T&T, Carrier Selection live as of May 1. Load Building in draft. Appointment Scheduling pending.

**V1.5 requirements (current cycle):**
- Load Building dashboard visible to active LB customers (Arrive, Hirschbach, CRST, T1, Werner, Zeal)
- Appointment Scheduling dashboard (standard views)
- Customer/shipper-level filter on Load Building views
- Load-level drill-down from summary stats
- Data source unification: portal, Augie chat, and all external-facing reports pull exclusively from Connor/Britain's dbt mart tables

**V2 requirements (Q2):**
- Timezone and week-definition configuration per brokerage
- Escalation reporting for T&T (volume, distribution, trend)
- Custom workflow reporting pipeline: new workflow → standard dashboard within a defined SLA
- Driver manager / rep-level filtering for large multi-shipper accounts
- Scheduled CSV exports (on-demand or recurring via email)
- Report + dashboard default filter persistence
- Shareable report links (secure, scoped to brokerage)

**Filter design principle:** Do not clone Metabase's "too many filters with confusing defaults." Build only filters that serve a specific documented user story. Every new filter requires a named use case before it is built.

---

### 5B. Value Creation Dashboard

**Architecture:** Three-tier metric hierarchy:
- **Tier 1 — Program Value:** Total dollar figure (Total Program Value = sum of per-workflow labor cost saved)
- **Tier 2 — Value Mechanism:** The math behind Tier 1 (volumes, hours, rates, counts)
- **Tier 3 — Business Outcomes:** Workflow-level operational results (coverage, throughput, booking rates)

**Delivery environment:** Portal-native (not Metabase embedded). This dashboard is a distinct, emotionally compelling surface — not a standard reporting tab.

**Key requirements:**
- Total Program Value is the first element visible on load; no click or scroll required
- Formula transparency: Tier 2 shows volumes × minutes × rate, with each variable labeled and each default value documented as helper text
- Configurable parameters: brokerage-level overrides for hourly rate, task duration assumptions; changes apply immediately and are logged
- Inactive workflow handling: visually distinct from "active with no data"; inactive rows shown as "future value unlock" not as $0
- Period-over-period trend: sparkline or bar trend visible on Tier 1 without drilling down
- Export: all tiers support CSV export reflecting the current date range, grain, and parameter values
- Access: managers and executives only (same as V1 UX PRD)
- Emotional design: this is a premium sales and renewal tool; the visual treatment must be purpose-built, not a BI grid

**Scope note:** Total Program Value headline = labor cost saved only. Secondary metrics (carrying cost savings, after-hours capacity value) are displayed as call-out cards, not in the headline calculation.

---

### 5C. Agentic / Conversational Reporting

**Strategic context:** Art has identified conversational custom report creation as the priority "killer feature" for reporting. At the May 4, 2026 meeting (with Art, Tom, and Vikram), Art directed that the goal is for users to converse with Augie inside the portal to create reports without writing SQL — and that this capability is what makes Augie the customer's **system of record** for their business. From Art's Feb 26, 2026 feedback (via #reporting-chat): *"A Reporting agent — This is longer-term and Text-to-SQL powered, conversational"* was identified as a core product component alongside the Value Creation Dashboard.

**The "wow factor" framing:** Per Art's direction, Augment should skip the intermediate step of Q&A on existing reports as a staged V1 gate and go directly to custom report generation. The wow factor — a user describes what they want and Augie builds it — is what creates the "system of record" experience that differentiates Augment from any BI tool a brokerage has access to today.

**Architecture:** Agentic reporting will rely on existing infrastructure, including the Converse Cell persistent agent interface that Dana has designed and Art has endorsed. Reporting is the second use case for this interface (after voice author). Agentic reporting coordination with the Converse Cell timeline should not block delivery — the two workstreams align but are not sequentially dependent. The implementation must share components with the global Augie chat interface; no parallel tech debt.

**Data layer:** The reporting agent must query exclusively from the mart tables (Snowflake, dbt). It must not compose SQL against raw tables. This is both a correctness requirement and a prerequisite for data consistency across surfaces (portal, chat, exports).

**V1 agentic requirements (custom report generation):**
- Chat interface available on all dashboard and report screens within the portal
- Augie can generate a new report from a natural-language description: user describes what they want → Augie produces SQL against the mart schema → report renders in the portal
- Multi-turn iteration: user can follow up, rephrase, or correct ("actually, exclude cancelled loads") and see the updated report immediately
- Generated reports can be saved, named, and added to any dashboard
- Augie can answer questions about the current view (chart context + mart schema) within the same conversation thread
- When Augie cannot answer correctly or a generated report is wrong, it offers to create a Linear ticket for the reporting team

**V2 agentic requirements:**
- Augie can edit existing saved reports on request and save as a new version
- User can inspect and validate the generated SQL before saving (power-user transparency mode)
- Augie can create and populate a new named dashboard from a conversation ("Set me up a weekly ops dashboard for Load Building")

**Internal POC / accuracy gate:** Mr. SQL (internal Slack agent) is the POC and feedback vehicle for the product agent. Current eval baseline: 0.746 with Verified Queries vs. 0.665 without. The accuracy threshold required before customer-facing rollout is an open question — see Section 9. Lessons from Mr. SQL query patterns, failure modes, and Verified Query expansions feed directly into the product agent's schema and guardrails.

---

### 5D. Access Control

**Principles:**
1. Align with the Knowledge team's RBAC model — do not build a parallel permissions layer
2. Two distinct access dimensions: (a) which data rows a user can see (security), (b) which dashboards/reports a user can access (product)
3. Custom reports have a scope: personal, brokerage-wide, or admin-group

**Requirements:**
- Managers and executives: full reporting access
- Dispatchers, carrier reps, load operators: no reporting access (access gate page with instructions to request access)
- Group / aggregator accounts (Armstrong model): admins can toggle between corporate view and per-agent views; agents see only their own data
- Parameter editing: available to all managers and executives in V1; admin-only restriction is a V2 option
- Custom report ownership: default scope is **customer-key (brokerage)** — reports are owned and shared at the brokerage level, not tied to an individual user. For agent-model accounts (e.g., ATG's agent model, Landstar's agent model), group-level scoping applies per UX direction. Personal vs. brokerage-wide visibility distinction is a V2 option pending Julia's RBAC model.

---

## 6. Data & Technical Requirements

**Single source of truth:** All reporting surfaces — portal dashboards, Augie chat responses, scheduled exports, and the Value Creation Dashboard — must query the same dbt mart tables that Connor and Britain maintain. Divergence between surfaces is a P1 bug, not a product variation.

**Data refresh:** Cadence to be defined with engineering per workflow. Every view must display a "last updated" timestamp. No view should imply real-time data unless the pipeline supports it.

**Schema exposure:** The mart table schema and semantic layer must be accessible to the reporting agent. New workflows added to mart models should become queryable by the agent without manual schema registration.

**Three-layer reporting model:** Reporting requirements span three layers of increasing abstraction:
1. **Operational metrics** — what Augie did (volumes, actions, coverage, throughput). Addressed by standard workflow dashboards.
2. **Compliance / outcome metrics** — SOP adherence and business outcomes (e.g., are loads being built correctly per the customer's SOP, are T&T communications being sent at the right intervals). This layer is addressed through the semantic layer (Cortex semantic views, Britain's SOP-as-JSON system) and surfaced primarily via the custom/agentic reporting path. Reports that prove universally useful across customers should be promoted to the standard report suite.
3. **ROI / value metrics** — what Augie is worth in dollar terms. Addressed by the Value Creation Dashboard.

**Metric registry:** Every metric displayed in the portal must have a corresponding entry in the metric reference document (currently: `docs/metric-definitions.md`). The registry is the authoritative source for metric names, formulas, inclusion/exclusion rules, and attribution logic.

---

## 7. Non-Goals (V1/V2)

| Item | Note |
|---|---|
| Real-time alerting / threshold notifications | Separate project |
| PDF export | V1 exports CSV only |
| Non-Augment data sources (customer TMS, external data) | Knowledge data sources are a future expansion |
| Dispatcher / carrier rep reporting access | Non-manager roles have no access in V1/V2 |
| White-label or embeddable reporting for customers to embed elsewhere | Out of scope |
| Augment internal operational dashboards | This PRD covers customer-facing reporting only |

---

## 8. Success Metrics

**Portal adoption:**
- % of active customers with at least one reporting tab viewed per week (target: 60% within 60 days of Metabase deprecation)
- Metabase report views trending to zero within 90 days of portal parity

**Value Creation Dashboard:**
- VCD opened in at least 1 renewal or QBR conversation per customer account per quarter
- Export action rate: > 40% of VCD sessions result in a CSV export

**Agentic reporting:**
- % of custom reporting requests resolved via chat without an engineering ticket
- Mean time from question to saved report
- Feedback ticket rate: < 20% of chat sessions result in an escalation

**CS operational:**
- Reduction in one-off Metabase build requests to the reporting team
- CS team self-sufficiency: % of customer data questions answered without engineering involvement

---

## 9. Open Questions

1. **Harish alignment:** What is Harish's current mental model for agentic reporting, and what would he find most compelling for sales? The "system of record" vision has no direct industry proxy — it needs to be explicitly pitched and validated with GTM leadership before committing the roadmap publicly.

2. **RBAC model:** What has Julia/platform decided on for portal RBAC? The Armstrong multi-level reporting use case (US-31), and the full design of group-level scoping for ATG/Landstar agent models, cannot be finalized until the permissions model is defined.

3. **Scheduled exports:** The Knowledge team is building extracted report functionality — can reporting borrow this pipeline, or does reporting need to build a separate scheduled export mechanism?

4. **Value dashboard emotional design:** Art's May 4 feedback confirmed the dashboard must be "visually compelling beyond rendering standard charts and tables" and that emotional storytelling is "incredibly important." What does this mean in concrete UX terms? This needs to be translated into design direction (layout, animation, data visualization choices) before design begins. Marsha's design exploration should take Art's framing as a primary input.

5. **Mr. SQL accuracy gate:** What is the minimum accuracy threshold (current baseline: 0.746 eval score with Verified Queries) that must be achieved before the agentic agent is rolled out to customers? A suite of workflow-specific evals is needed. The team must define acceptable accuracy targets and testing methodology before committing to a customer-facing GA date for agentic reporting. Mr. SQL's current failures in customer-facing Slack channels are a signal that accuracy is not yet production-ready.

6. **Operator-layer data latency:** Executive and manager-level reporting is scoped to non-real-time data (batch refresh cadence). As reporting expands to front-line operators (US-07, US-09), data recency requirements will change significantly — load-level drill-downs for a driver manager managing active loads may require near-real-time refresh. When does this become necessary, and what pipeline changes (streaming vs. faster batch) are required to support it?

7. **Custom week definition:** Metabase launch notes flagged that some customers define their reporting week as Mon–Sun rather than Sun–Sat. How many customers is this, and does it block post-Metabase parity for those accounts?

---

## 10. Stakeholder & Dependency Map

| Stakeholder | Role | Dependency |
|---|---|---|
| Art Rivilis | Exec sponsor; strategic direction | Sign-off on agentic reporting vision; VCD emotional storytelling guidance |
| Harish Abbott | GTM / CS leadership | Validation of product story before roadmap commitment |
| Vikram Sraon | PM; reporting product owner | PRD, roadmap, Metabase deprecation |
| Tom Blaser | Engineering; Mr. SQL, portal reporting | Agentic POC, front-end reporting layer |
| Connor Gullstad | Data engineering | dbt mart tables, metric schema, LB/AS reporting |
| Britain Martin | Data engineering | Mart table design, data infrastructure |
| Marsha Chan | UX | Dashboard and reporting UI design iterations |
| Clarence Ng | Engineering | Portal reporting implementation |
| Julia (platform) | RBAC | Access control model for reporting |
| Cheng Cheng | CS lead | VCD methodology sign-off; customer data reconciliation |
| Knowledge team (Agustin Sacco) | Data infrastructure | Snowflake semantic views, future Knowledge data sources |
| Dana (author team) | Converse Cell agent | Shared chat interface for agentic reporting |

---

## Appendix: Customer Feedback Summary (as of May 11, 2026)

### CRST
- Executive + operational reporting levels required for Load Building
- Customer/shipper-level filtering (300+ driver managers, each managing a subset)
- Load-level drill-down from status summaries
- Dashboard numbers must reconcile with TMS internal data
- Lakshmi (ops lead): "The portal is completely unusable today" — blocking expansion without filtering and reliable dashboards

### Trident Transport
- T&T actions summary with per-rep breakdowns
- POD attribution to Augie specifically (not just total PODs collected)

### King / eShipping
- Currently actively using Metabase reports — need portal parity before migration
- Some custom metric definitions specific to their tracking process

### Werner
- Load building dashboard aligned on operational detail level
- Standard exec-level and ops-level views confirmed

### Armstrong
- Multi-level access: corporate view + per-agent rollup
- One-to-one reporting per individual agent required

### General CS Feedback
- Source table / query logic transparency needed for CS team to self-serve data questions
- Escalation reporting (T&T) is highly requested; not in V1 but must be planned
- Scheduled / emailed exports requested by multiple accounts (particularly ATG team using Metabase scheduled reports)
- Demo / anonymized environment needed for sales (GEODIS and others asking about reporting capabilities)
