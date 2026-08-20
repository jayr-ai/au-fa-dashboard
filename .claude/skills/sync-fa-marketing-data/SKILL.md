---
description: Sync latest Meta Ads and GHL pipeline data to BigQuery, then export to marketing-performance.json
name: sync-fa-marketing-data
---

# Sync Freedom Academy Marketing Data

Pulls the latest ad spend data from **Meta Ads MCP** and masterclass funnel stages from **GHL MCP**, updates BigQuery tables, and exports to the marketing dashboard JSON file.

## Usage

```bash
/sync-fa-marketing-data
```

Or with options:

```bash
/sync-fa-marketing-data --meta-since 2026-08-13      # Sync Meta data from Aug 13 onward
/sync-fa-marketing-data --meta-days 7                 # Sync last 7 days of Meta data
/sync-fa-marketing-data --ghl-refresh                 # Refresh only GHL pipeline stage counts
/sync-fa-marketing-data --no-push                     # Update BigQuery/JSON but don't push to GitHub
```

## What It Does

1. **Meta Ads Sync** (Account: Shane Da Costa AU `act_1185223312884959`)
   - Pulls daily spend, impressions, link clicks, leads
   - Detects missing date ranges (e.g., 7-day backfill if data is delayed)
   - Updates `marketing_ad_spend_daily` table (upsert, no duplicates)

2. **GHL Pipeline Sync** (Pipeline: `djiSwm3hJsW7Rv9tyqSl`)
   - Queries all stages in the masterclass pipeline
   - Counts opportunities in each stage
   - Updates `marketing_funnel_stages` table

3. **Export & Deploy**
   - Generates `marketing-performance.json` from BigQuery
   - Commits and pushes to GitHub
   - Dashboard auto-refreshes on next load

## Output

Shows a detailed sync report:
- Dates synced from Meta
- New records inserted/updated in BigQuery
- GHL stage counts
- Files committed to GitHub

## Notes

- Default behavior: auto-detects missing dates (fills gaps)
- Uses Meta MCP and GHL MCP tools (requires authentication)
- Upsert logic prevents duplicate dates in BigQuery
- Safe to run multiple times (idempotent)
