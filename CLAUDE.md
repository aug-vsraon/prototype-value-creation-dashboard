# Project notes for Claude

## Metabase access

- Instance: https://augment.metabaseapp.com (distribution collection: `/collection/7228-distribution`)
- Vikram's Metabase API key is stored locally on their Mac in `/Users/vs/.zshenv`.
  Never write the key value into this repo or any file — reference the env var only.
- **Local sessions:** the key is already in the shell env via `.zshenv`; use it as
  `METABASE_API_KEY` for `curl -H "x-api-key: $METABASE_API_KEY" https://augment.metabaseapp.com/api/...`.
- **Remote/cloud sessions:** `/Users/vs/.zshenv` is not accessible. To use the API,
  `METABASE_API_KEY` must be added to the Claude Code environment's variables, and
  `augment.metabaseapp.com` must be allowed in the environment's network policy
  (it currently 403s at the proxy).

## Snowflake access

- `lib/snowflake.ts` reads the `ReportingInvestigationAgentSnowflake-prod` secret from
  AWS Secrets Manager (us-east-1). Remote sandbox AWS creds cannot read this secret,
  so live Snowflake queries only work where valid AWS creds are present (e.g. prod Vercel).

## Ferguson PO reporting (metabase/)

- `metabase/00-inspect-po-schema.sql` must be run first to confirm JSON field paths;
  paths tagged `ASSUMED` in `metabase/ferguson-po-reports.sql` are unverified guesses.
- "PO not found" vs "Cancelled" both collapse into `status='EXCEPTION'` until the
  classifier `exceptionReason` field ships.
