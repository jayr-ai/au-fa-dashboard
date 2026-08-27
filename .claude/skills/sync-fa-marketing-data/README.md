# Sync Freedom Academy Marketing Data

One-command sync of Meta Ads and GHL pipeline data to BigQuery, then to dashboard.

## Quick Start

```bash
/sync-fa-marketing-data
```

That's it. Claude will:
1. Pull latest Meta ad spend (auto-fills missing dates)
2. Pull latest GHL pipeline stage counts
3. Update BigQuery tables
4. Export to marketing-performance.json
5. Push to GitHub
6. Show you what was synced

## Parameters

### Date Range Control

```bash
# Sync specific date range
--meta-since 2026-08-13        # Fill from Aug 13 to today

# Or last N days
--meta-days 7                   # Last 7 days

# Or auto-detect (default)
# Claude will detect gaps in BigQuery and fill them
```

### Selective Sync

```bash
# Sync only Meta data (skip GHL)
--meta-only

# Sync only GHL pipeline stages (skip Meta)
--ghl-only

# Refresh only GHL (latest stage counts)
--ghl-refresh
```

### Deployment Control

```bash
# Update BigQuery and JSON, but don't push to GitHub
--no-push

# Show what would be synced without actually syncing
--dry-run
```

## Examples

### Scenario 1: Delayed Ad Data (7 days behind)
```bash
/sync-fa-marketing-data --meta-since 2026-08-13
```
Fills missing Meta spend from Aug 13 through today.

### Scenario 2: Daily Refresh
```bash
/sync-fa-marketing-data
```
Auto-detects missing dates and syncs both Meta and GHL.

### Scenario 3: Just Update GHL Stages
```bash
/sync-fa-marketing-data --ghl-refresh --no-push
```
Refreshes pipeline stage counts, updates BigQuery, no GitHub push.

## What Gets Synced

### Meta Ads (Account: Shane Da Costa AU)
- **Source**: Meta Ads API via MCP
- **Data**: Daily spend, impressions, link clicks, leads
- **Table**: `jv-data-warehouse.freedom_academy_au.marketing_ad_spend_daily`
- **Logic**: Upsert by date (no duplicates)

### GHL Pipeline (Masterclass Funnel)
- **Source**: GoHighLevel API via MCP
- **Data**: Stage names and opportunity counts
- **Table**: `jv-data-warehouse.freedom_academy_au.marketing_funnel_stages`
- **Logic**: Replace daily with latest stage counts

### Export
- **File**: `au-fa-dashboard/marketing-dashboard/data/marketing-performance.json`
- **Format**: JSON with metadata and daily array
- **Deploy**: Committed and pushed to GitHub
- **Refresh**: Dashboard auto-loads on next page view

## Workflow Detail

### 1. Meta Ads Sync
```
Query Meta API → Check BigQuery for missing dates → 
Fill gaps (e.g., 7 days back) → Insert new records → 
No duplicates (upsert by date)
```

### 2. GHL Pipeline Sync
```
Query GHL Pipeline (djiSwm3hJsW7Rv9tyqSl) → 
Get stage counts → Store as run_date=TODAY → 
Update marketing_funnel_stages
```

### 3. Export & Deploy
```
Query BigQuery marketing_ad_spend_daily → 
Generate marketing-performance.json → 
Commit with detailed message → Push to GitHub
```

## Output Example

```
╔═══════════════════════════════════════════════════════════════╗
║        SYNC COMPLETE: Freedom Academy Marketing Data         ║
╚═══════════════════════════════════════════════════════════════╝

✅ META ADS SYNCED
   Dates: Aug 13 - Aug 20 (8 days)
   New records: 2 (Aug 19-20)
   Total spend: A$12,456.78
   Records in BigQuery: 205

✅ GHL PIPELINE UPDATED
   Pipeline: djiSwm3hJsW7Rv9tyqSl
   Stages synced: 12
   Latest snapshot: 2026-08-20

✅ EXPORTED TO JSON
   File: marketing-dashboard/data/marketing-performance.json
   Records: 205 days
   Date range: 2026-01-13 to 2026-08-20

✅ DEPLOYED
   Commit: c2f4cf2
   Message: "Sync Meta Ads and GHL data through Aug 20, 2026"
   Status: Pushed to jayr-ai/au-fa-dashboard main

Dashboard will refresh on next page load.
```

## Troubleshooting

### "Data already in BigQuery"
If a date already exists, the upsert logic will skip it (no duplicates).

### "Meta API returned no data"
Check if the date range has data available (Meta often lags 3-7 days).

### "GHL pipeline not found"
Verify pipeline ID: `djiSwm3hJsW7Rv9tyqSl` (Masterclass Funnel)

### "Sync complete but dashboard not updated"
- Check GitHub commit was pushed
- Dashboard fetches live on page load or F5 refresh
- May take 1-2 seconds for JSON to fetch

## When to Sync

- **Daily**: After 6 PM AEST (Meta usually has that day's data)
- **Weekly**: Full week review (catch up on 7-day backfill)
- **On demand**: Before sharing dashboard with stakeholders
- **Before analysis**: Always sync before checking performance

## Notes

- Safe to run multiple times (idempotent)
- Auto-detects missing dates from MAX(date) to TODAY (forward-filling)
  - **Fixed 2026-08-27**: Previously only backfilled 7 days, missing recent data. Now extends to current date.
  - **What this means**: After Aug 24 was last synced, Aug 25-27 weren't attempted. Now they are automatically included.
- No manual date entry needed
- Upsert prevents duplicates
- Git push requires GitHub access (already set up)
