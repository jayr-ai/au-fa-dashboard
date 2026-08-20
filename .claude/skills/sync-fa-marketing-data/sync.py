#!/usr/bin/env python3
"""
Sync Freedom Academy marketing data from Meta Ads and GHL to BigQuery and JSON export.
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

# This script is a guide for manual execution via Claude Code
# It documents the sync workflow that Claude will execute using MCP tools

WORKFLOW = """
╔═══════════════════════════════════════════════════════════════════════════════╗
║          FREEDOM ACADEMY MARKETING DATA SYNC WORKFLOW                         ║
╚═══════════════════════════════════════════════════════════════════════════════╝

CONFIGURATION
─────────────
• Meta Ads Account: act_1185223312884959 (Shane Da Costa AU)
• GHL Pipeline: djiSwm3hJsW7Rv9tyqSl (Masterclass Funnel)
• BigQuery Dataset: jv-data-warehouse.freedom_academy_au
• Export File: marketing-dashboard/data/marketing-performance.json
• Repo: jayr-ai/au-fa-dashboard

STEP 1: QUERY META MCP FOR AD SPEND DATA
────────────────────────────────────────
Input: Date range (or auto-detect missing dates)
Fields: amount_spent, impressions, actions:link_click, lead
Output: List of daily records with spend, impressions, clicks, leads

STEP 2: UPDATE BigQuery marketing_ad_spend_daily TABLE
───────────────────────────────────────────────────────
Logic:
  - Check existing dates in BigQuery
  - For new dates: INSERT new records
  - For existing dates: SKIP (no duplicates)
  - Upsert by date to ensure no duplicates

STEP 3: QUERY GHL MCP FOR PIPELINE STAGES
──────────────────────────────────────────
Input: Pipeline ID djiSwm3hJsW7Rv9tyqSl
Fields: stage name, opportunity count
Output: Current stage counts for masterclass pipeline

STEP 4: UPDATE BigQuery marketing_funnel_stages TABLE
──────────────────────────────────────────────────────
Logic:
  - For each stage in the pipeline
  - Set run_date to TODAY
  - Insert/update stage count
  - Delete old records (keep only latest)

STEP 5: EXPORT TO marketing-performance.json
─────────────────────────────────────────────
Query:
  SELECT date, spend, impressions, link_clicks, leads
  FROM marketing_ad_spend_daily
  ORDER BY date ASC

Format as JSON with metadata:
  {
    "meta": {
      "generatedAt": "ISO timestamp",
      "source": "BigQuery marketing_ad_spend_daily (Meta Ads verified)",
      "dataWindow": "Jan 2026 - Aug 2026",
      "cacheStatus": "Live sync from BigQuery with Meta Ads daily leads verification"
    },
    "daily": [...]
  }

STEP 6: COMMIT AND PUSH TO GITHUB
──────────────────────────────────
Files modified:
  - marketing-dashboard/data/marketing-performance.json

Commit message:
  "Sync Meta Ads and GHL data through [DATE]

   Meta: [COUNT] records (from [START_DATE] to [END_DATE])
   GHL: [PIPELINE_STAGES] stages updated

   Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"

STEP 7: REPORT SYNC SUMMARY
────────────────────────────
Show:
  ✅ Meta dates synced: X to Y (Z records)
  ✅ New Meta records inserted: N
  ✅ GHL stages updated: [list of stages]
  ✅ Total ad spend: $X.XX
  ✅ Exported to marketing-performance.json
  ✅ Pushed to GitHub
"""

if __name__ == "__main__":
    print(WORKFLOW)
    print("\nTo execute this sync, run: /sync-fa-marketing-data")
    print("\nClaude will execute all steps using MCP tools and BigQuery access.")
