# Implementation Guide for Sync Skill

This file documents the step-by-step workflow that Claude executes when `/sync-fa-marketing-data` is invoked.

## Execution Flow

### Phase 1: Analyze & Plan
1. Parse user input (date range, flags)
2. Query BigQuery to find missing date ranges in `marketing_ad_spend_daily`
3. Determine what to sync (Meta, GHL, or both)
4. Report plan to user

### Phase 2: Meta Ads Data Sync

#### Step 1: Detect Missing Dates
```sql
SELECT MAX(date) as last_date, COUNT(*) as total_records
FROM `jv-data-warehouse.freedom_academy_au.marketing_ad_spend_daily`
```
- If `--meta-since` flag: use provided date
- If `--meta-days` flag: use last N days
- Default: Fill 7-day gap before last known date

#### Step 2: Query Meta MCP
For each date in the range, call Meta Ads tool:
- **ad_account_id**: `1185223312884959`
- **level**: `ad_account`
- **fields**: `amount_spent`, `impressions`, `actions:link_click`, `lead`
- **time_range**: `{"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}`
- **time_increment**: `1` (daily)
- **client_conversation_id**: Generate 20-char ID

Parse response:
```json
{
  "date_start": "2026-08-19",
  "amount_spent": "A$1,741.81 AUD",
  "impressions": "55041",
  "actions:link_click": "484",
  "lead": "27"
}
```

Extract numeric values:
- `spend`: Parse "A$1,741.81" → 1741.81
- `impressions`: 55041
- `link_clicks`: 484
- `leads`: 27

#### Step 3: Upsert to BigQuery
For each date pulled:

```sql
-- Check if date exists
SELECT COUNT(*) FROM marketing_ad_spend_daily WHERE date = '2026-08-19'

-- If exists: SKIP (no duplicates)
-- If not exists: INSERT
INSERT INTO `jv-data-warehouse.freedom_academy_au.marketing_ad_spend_daily`
  (date, spend, impressions, link_clicks, leads, synced_at)
VALUES
  ('2026-08-19', 1741.81, 55041, 484, 27, CURRENT_TIMESTAMP())
```

Report after each insert:
- Date added
- Spend amount
- Records inserted/skipped

### Phase 3: GHL Pipeline Sync (if not `--meta-only`)

#### Step 1: Query GHL MCP
Call GHL MCP to get pipeline stages for `djiSwm3hJsW7Rv9tyqSl`:

Expected response format:
```json
{
  "stages": [
    { "id": "stage_id_1", "name": "Registered", "count": 4424 },
    { "id": "stage_id_2", "name": "VIP Upgrade", "count": 17 },
    { "id": "stage_id_3", "name": "Attended", "count": 2850 },
    ...
  ]
}
```

#### Step 2: Insert to BigQuery
For each stage, insert today's count:

```sql
INSERT INTO `jv-data-warehouse.freedom_academy_au.marketing_funnel_stages`
  (run_date, stage, count, synced_at)
VALUES
  (CURRENT_DATE(), 'Registered', 4424, CURRENT_TIMESTAMP()),
  (CURRENT_DATE(), 'VIP Upgrade', 17, CURRENT_TIMESTAMP()),
  (CURRENT_DATE(), 'Attended', 2850, CURRENT_TIMESTAMP()),
  ...
```

Note: Delete previous entries for today if they exist (keep only latest snapshot)

### Phase 4: Export to JSON

#### Step 1: Query BigQuery
```sql
SELECT 
  date,
  CAST(spend AS STRING) as spend,
  impressions,
  link_clicks,
  leads
FROM `jv-data-warehouse.freedom_academy_au.marketing_ad_spend_daily`
ORDER BY date ASC
```

#### Step 2: Generate JSON
```python
{
  "meta": {
    "generatedAt": "2026-08-20T10:45:30.123456Z",
    "source": "BigQuery marketing_ad_spend_daily (Meta Ads verified)",
    "dataWindow": "Jan 2026 - Aug 2026",
    "cacheStatus": "Live sync from BigQuery with Meta Ads daily leads verification",
    "note": "June, July, and August 2026 leads verified from Meta Ads API"
  },
  "daily": [
    { "date": "2026-01-13", "spend": 1089.76, "impressions": 14320, "linkClicks": 259, "leads": 13 },
    { "date": "2026-01-14", "spend": 1054.89, "impressions": 10399, "linkClicks": 211, "leads": 13 },
    ...
  ]
}
```

#### Step 3: Write to File
Path: `au-fa-dashboard/marketing-dashboard/data/marketing-performance.json`

Verify file was written and has correct format.

### Phase 5: Git Commit & Push

#### Step 1: Git Status
```bash
cd /Users/jayvee/Documents/ds-work/au-fa-dashboard
git status
```

Should show:
- `marketing-dashboard/data/marketing-performance.json` modified

#### Step 2: Git Add
```bash
git add marketing-dashboard/data/marketing-performance.json
```

#### Step 3: Git Commit
```bash
git commit -m "Sync Meta Ads and GHL data through [DATE]

Meta synced: [START_DATE] to [END_DATE] ([COUNT] records)
GHL stages: [STAGE_COUNT] stages updated
Total ad spend: A$[TOTAL].XX

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

#### Step 4: Git Push
```bash
git push origin main
```

Verify push succeeded (check commit hash).

### Phase 6: Report Summary

Display to user:
```
╔═══════════════════════════════════════════════════════════════╗
║        SYNC COMPLETE: Freedom Academy Marketing Data         ║
╚═══════════════════════════════════════════════════════════════╝

✅ META ADS SYNCED
   Date range: [START] to [END]
   Records synced: [N] new, [M] skipped (duplicates)
   Total spend: A$[TOTAL].XX
   Impressions: [TOTAL_IMPR]
   Link clicks: [TOTAL_CLICKS]
   Leads: [TOTAL_LEADS]

✅ GHL PIPELINE (if synced)
   Pipeline: djiSwm3hJsW7Rv9tyqSl
   Stages: [COUNT]
   Snapshot date: [DATE]

✅ EXPORTED
   File: marketing-performance.json
   Total records: [COUNT]
   Date range: [MIN] to [MAX]

✅ DEPLOYED
   Commit: [HASH]
   Pushed to: jayr-ai/au-fa-dashboard (main)

📊 Dashboard will auto-refresh on next page load
```

## Error Handling

### Meta MCP Errors
- If account not queryable: Stop, report error
- If no data for date range: Continue with available data
- If API rate limit: Retry with backoff

### BigQuery Errors
- If insert fails: Check for constraint violations
- If table doesn't exist: Report and stop
- If permission denied: Check credentials

### GitHub Errors
- If push fails: Check branch, pull, retry
- If auth fails: Report and stop

## Flags & Modifiers

| Flag | Effect | Example |
|------|--------|---------|
| `--meta-since DATE` | Sync from DATE to today | `--meta-since 2026-08-13` |
| `--meta-days N` | Sync last N days | `--meta-days 7` |
| `--ghl-only` | Skip Meta, sync only GHL | Standalone |
| `--meta-only` | Skip GHL, sync only Meta | Standalone |
| `--ghl-refresh` | Refresh only latest GHL counts | Standalone |
| `--no-push` | Update BigQuery/JSON, no GitHub | Standalone |
| `--dry-run` | Show what would sync, don't execute | Standalone |

## Testing

Run with `--dry-run` first to verify:
1. Date range detection works
2. Meta API returns data
3. GHL stages are accessible
4. BigQuery tables exist
5. JSON export format is correct

Then run without `--dry-run` to execute.

## Success Criteria

✅ All steps complete
✅ BigQuery tables updated
✅ marketing-performance.json exported
✅ GitHub commit pushed
✅ No errors in output
✅ User report shows all metrics
