# Freedom Academy Revenue Dashboard - Apps Script Setup Guide

## Overview
This Apps Script pipeline automates the complete data flow:
**Google Sheets (CONSOLIDATED) → BigQuery → JSON → GitHub Pages Dashboard**

## Files
- `apps-script-revenue-pipeline.gs` - Complete Apps Script code

## Setup Instructions

### Step 1: Attach Script to Google Sheet

1. Open the Google Sheet: https://docs.google.com/spreadsheets/d/1LKIwjIpzn1jNSaIzzLAWLkkiODJUuKReKkw3QUT9c8A/edit
2. Click **Extensions > Apps Script**
3. Delete default code and paste the content from `apps-script-revenue-pipeline.gs`
4. Save the project (Ctrl+S)
5. Rename project to: "Freedom Academy Revenue Sync"

### Step 2: Configure GitHub Token

1. Generate a GitHub Personal Access Token:
   - Go to: https://github.com/settings/tokens
   - Click **Generate new token (classic)**
   - Select scopes: `repo` (full control of private repositories)
   - Copy the token

2. In Apps Script, save the token:
   - Open Apps Script (Extensions > Apps Script in the Sheet)
   - Paste this into the console and run:
   ```javascript
   setupGitHubToken('YOUR_GITHUB_TOKEN_HERE')
   ```
   - Replace `YOUR_GITHUB_TOKEN_HERE` with your actual token

### Step 3: Set Up Daily Trigger

1. In Apps Script, click **Triggers** (clock icon on left sidebar)
2. Click **Create new trigger** (bottom right)
3. Configure:
   - **Function to run:** `syncRevenueData`
   - **Deployment:** Head
   - **Event source:** Time-driven
   - **Type of time interval:** Day timer
   - **Time of day:** 2:00 AM (runs after 2 AM UTC sync in Sheets)
   - Click **Save**

### Step 4: Verify Setup

Run a test sync:
1. In Apps Script, select function `testSync` from dropdown
2. Click **Run** (play button)
3. Watch the **Logs** panel:
   ```
   🔄 Starting revenue data sync...
   📄 Step 1: Reading CONSOLIDATED sheet...
      ✓ Read 796 transactions
   ☁️  Step 2: Syncing to BigQuery...
      ✓ Data synced to BigQuery
   📊 Step 3: Generating summary...
      ✓ Summary generated
   📈 Step 4: Querying aggregated data...
      ✓ Data aggregated from BigQuery
   🔧 Step 5: Generating dashboard JSON...
      ✓ JSON generated
   🚀 Step 6: Exporting to GitHub...
      ✓ Exported to GitHub
   ✅ Revenue sync completed successfully (15s)
   ```

### Step 5: Verify GitHub Export

Check that `revenue-data.json` was created:
- Go to: https://github.com/jayr-ai/au-fa-dashboard/blob/main/revenue-dashboard/data/revenue-data.json
- You should see updated data with current timestamp

### Step 6: Check Dashboard

Reload the Revenue Dashboard:
- https://freedomacademy.azdigitalph.com/revenue-dashboard/
- Charts should now populate with real monthly data
- Date filtering should work across actual months

## Data Flow

```
Google Sheet (CONSOLIDATED tab)
    ↓ readConsolidatedTab()
Transaction array (796 rows)
    ↓ pushToBigQuery()
BigQuery revenue_transactions table
    ↓ generateSummary()
BigQuery revenue_summary table
    ↓ queryAggregatedData()
Aggregated monthly & product data
    ↓ generateCompleteJSON()
Complete dashboard JSON object
    ↓ exportToGitHub()
GitHub: revenue-dashboard/data/revenue-data.json
    ↓ (Dashboard fetches via CORS)
Browser Dashboard
    ↓ renderDashboard()
Charts & Insights Display
```

## Key Functions

### Main Orchestration
- `syncRevenueData()` - Runs all 6 steps (called by trigger)
- `testSync()` - Run manually to test without scheduling

### Step 1: Google Sheets
- `readConsolidatedTab()` - Parse transactions from CONSOLIDATED sheet
- `determineSource()` - Map to Stripe/Finance/EFT based on sheet data
- `generateTransactionId()` - Create unique IDs for deduplication

### Step 2-3: BigQuery
- `pushToBigQuery()` - Insert transactions in batches of 500
- `truncateTable()` - Clear old data before sync
- `generateSummary()` - Aggregate daily totals
- `executeQuery()` - Run BigQuery SQL

### Step 4: Aggregation
- `queryAggregatedData()` - Get monthly breakdown + product breakdown
- Queries group by month, year, and source

### Step 5: JSON Generation
- `generateCompleteJSON()` - Build dashboard-ready JSON
- `buildYearComparison()` - Year-over-year table data
- `buildProductData()` - Top products by revenue

### Step 6: GitHub Export
- `exportToGitHub()` - Push JSON to GitHub via API
- `getFileSha()` - Get current file SHA for updates

### Debugging
- `viewSyncLogs()` - See recent sync history from BigQuery

## Expected Monthly Data

Based on current transactions:

| Month | Total | Stripe | Finance | EFT |
|-------|-------|--------|---------|-----|
| Jul 2026 | $133,350 | $92,150 | $16,000 | $25,200 |
| Jun 2026 | $297,628 | $71,628 | $180,000 | $46,000 |
| May 2026 | $291,290 | $54,390 | $190,500 | $46,400 |
| Apr 2026 | $374,764 | $114,012 | $186,902 | $73,850 |
| Mar 2026 | $61,436 | $38,236 | $0 | $23,200 |
| Feb 2026 | $131,166 | $78,166 | $0 | $53,000 |
| Jan 2026 | $7,056 | $7,056 | $0 | $0 |

**Total: $1,336,084** (matches your sample data!)

## Troubleshooting

### "CONSOLIDATED sheet not found"
- Check the exact sheet name (case-sensitive)
- Update `SHEET_NAME` variable if different

### "Google Sheets API error"
- Apps Script needs to access BigQuery
- Grant permissions when prompted during first run

### "BigQuery insert failed"
- Verify SPREADSHEET_ID is correct
- Check that revenue_transactions table exists in BigQuery
- Check that Apps Script has BigQuery API enabled

### "GitHub export failed"
- Run `setupGitHubToken()` again with valid token
- Token needs `repo` scope permissions
- Check token hasn't expired

### "No data appearing on dashboard"
- Check browser developer console (F12) for CORS errors
- Verify revenue-data.json was created on GitHub
- Clear browser cache and reload dashboard
- Check date range selector (default: Jan 1 to today)

## Next Steps

1. ✅ Apps Script deployed and running
2. ✅ Daily trigger scheduled for 2 AM UTC
3. ✅ GitHub integration configured
4. ✅ Revenue data flowing to dashboard
5. 📋 Optional: Set up additional alerts/notifications

## Support

- **Logs:** Check Apps Script > Logs for detailed output
- **BigQuery:** Query tables directly via `viewSyncLogs()`
- **GitHub:** Check commit history for export status
- **Dashboard:** Use browser DevTools to inspect network/console
