/**
 * Freedom Academy Sales Dashboard v2 - BigQuery Data Pipeline
 * Syncs data from Google Sheet (DATA, DATA_KPI tabs) to BigQuery (v2_funnel, v2_kpi)
 * Then exports to GitHub for the dashboard
 *
 * Setup:
 * 1. Copy this code into the same Google Sheet's Apps Script project
 * 2. Run syncV2DataNow() once to test
 * 3. Set up a daily trigger if desired
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const BQ_PROJECT_ID_V2 = 'jv-data-warehouse';
const BQ_DATASET_V2 = 'freedom_academy_au';
const BQ_TABLE_DATA = 'v2_funnel';
const BQ_TABLE_KPI = 'v2_kpi';
const SPREADSHEET_ID_V2 = '1QHdtGqmQnLwk-V_d6dlqL2nVLpuiMSUoCdflO2QXgxk';
const GITHUB_OWNER_V2 = 'jayr-ai';
const GITHUB_REPO_V2 = 'au-fa-dashboard';
const GITHUB_FILE_PATH_V2 = 'sales-dashboard/data-v2.json';
const GITHUB_BRANCH_V2 = 'main';

// ============================================================================
// MAIN ORCHESTRATION
// ============================================================================

/**
 * Main v2 sync function - Run this to sync v2 data from Google Sheet to BigQuery and GitHub
 * Can be triggered daily or run manually
 */
function syncV2DataNow() {
  try {
    Logger.log('🔄 Starting v2 data sync...');
    const startTime = new Date();

    // Step 0: Sync Google Sheet DATA & DATA_KPI to BigQuery (TRUNCATE to remove duplicates)
    Logger.log('📝 Step 1: Syncing Google Sheet to BigQuery (clearing duplicates)...');
    syncGoogleSheetToBI();
    Logger.log('   ✓ Google Sheet synced to BigQuery');

    // Step 1: Fetch from v2_funnel table
    Logger.log('📊 Step 2: Fetching v2_funnel (sales funnel)...');
    const funnelData = fetchCurrentDataTable();
    Logger.log(`   ✓ Fetched ${funnelData.length} records from v2_funnel`);

    // Step 2: Fetch from v2_kpi table
    Logger.log('📊 Step 3: Fetching v2_kpi (dialer/setter)...');
    const kpiData = fetchCurrentDataKPITable();
    Logger.log(`   ✓ Fetched ${kpiData.length} records from v2_kpi`);

    // Step 3: Fetch agent list
    Logger.log('👥 Step 4: Fetching agent list...');
    const agents = fetchAgentList();
    Logger.log(`   ✓ Fetched ${agents.length} agents`);

    // Step 4: Transform data into dashboard format
    Logger.log('🔧 Transforming data for v2 dashboard...');
    const v2DataObject = transformV2Data(funnelData, kpiData, agents);
    Logger.log('   ✓ Data transformed');

    // Step 4: Export to GitHub
    Logger.log('🚀 Exporting v2 data to GitHub...');
    exportV2DataToGitHub(v2DataObject);
    Logger.log('   ✓ Exported to GitHub');

    const duration = Math.round((new Date() - startTime) / 1000);
    Logger.log(`✅ v2 data sync completed (${duration}s)`);

  } catch (error) {
    Logger.log('❌ Error in v2 sync: ' + error.toString());
    Logger.log('   Stack: ' + error.stack);
    throw error;
  }
}

// ============================================================================
// STEP 0: SYNC GOOGLE SHEET TO BIGQUERY (removes duplicates with TRUNCATE)
// ============================================================================

/**
 * Read DATA and DATA_KPI tabs from Google Sheet, sync to BigQuery
 * Uses WRITE_TRUNCATE to clear old data and prevent duplicates
 */
function syncGoogleSheetToBI() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID_V2);

    // Read DATA tab and sync to v2_funnel
    Logger.log('  Reading DATA tab from Google Sheet...');
    const dataSheet = ss.getSheetByName('DATA');
    if (!dataSheet) throw new Error('DATA sheet not found');
    const dataRows = readSheetData(dataSheet);
    Logger.log(`  Found ${dataRows.length} rows in DATA tab`);

    if (dataRows.length > 0) {
      syncToBI(dataRows, BQ_TABLE_DATA);
      Logger.log(`  ✓ Synced ${dataRows.length} rows to ${BQ_TABLE_DATA} (duplicates cleared)`);
    }

    // Read DATA_KPI tab and sync to v2_kpi
    Logger.log('  Reading DATA_KPI tab from Google Sheet...');
    const kpiSheet = ss.getSheetByName('DATA_KPI');
    if (!kpiSheet) throw new Error('DATA_KPI sheet not found');
    const kpiRows = readSheetData(kpiSheet);
    Logger.log(`  Found ${kpiRows.length} rows in DATA_KPI tab`);

    if (kpiRows.length > 0) {
      syncToBI(kpiRows, BQ_TABLE_KPI);
      Logger.log(`  ✓ Synced ${kpiRows.length} rows to ${BQ_TABLE_KPI} (duplicates cleared)`);
    }

  } catch (error) {
    Logger.log('ERROR syncing to BigQuery: ' + error.toString());
    throw error;
  }
}

/**
 * Column name mapping from Google Sheet to BigQuery abbreviated names
 */
const COLUMN_MAPPING = {
  // DATA sheet mapping
  'agent_name': 'n',
  'staff_name': 'n',
  'tier': 't',
  'date': 'd',
  'pending': 'pen',
  'no_show': 'ns',
  'missed': 'mis',
  'cancelled': 'can',
  'lost': 'lost',
  'sales': 'won',
  'won': 'won',
  'cash_collected': 'cash',
  'cash': 'cash',
  'revenue': 'rev',
  'product': 'product',
  'price_presented': 'pp',
  'pric_prs': 'pp',
  'price presented': 'pp',
  'terms_signed': 'ts',
  'terms': 'ts',
  'terms signed': 'ts',
  // DATA_KPI sheet mapping
  'hours_on_dialer': 'hrs',
  'hours_on_dialler': 'hrs',
  'hours': 'hrs',
  'dials': 'di',
  'sets': 'se',
  'appointments': 'ap',
  'appointments_this_week': 'ap',
  'no_shows': 'ns',
  'show_ups': 'su',
  'appointments_confirmed': 'cf',
  'confirmed_appointments': 'cf',
  'cash_collected': 'cash',
  'revenue': 'rev'
};

/**
 * Read all data from a sheet (header + data rows)
 * Maps Google Sheet column names to abbreviated BigQuery names
 */
function readSheetData(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const sanitizedHeaders = headers.map(h => sanitizeColumnName(h));
  const mappedHeaders = sanitizedHeaders.map(h => COLUMN_MAPPING[h] || h);
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const obj = {};
    let hasData = false;

    for (let j = 0; j < headers.length; j++) {
      let value = data[i][j];
      // Convert dates to YYYY-MM-DD format to avoid timezone shifts
      if (value instanceof Date) {
        value = Utilities.formatDate(value, 'Australia/Sydney', 'yyyy-MM-dd');
      }
      obj[mappedHeaders[j]] = value;
      if (value !== null && value !== '') hasData = true;
    }

    if (hasData) rows.push(obj);
  }

  return rows;
}

/**
 * Sanitize column name for BigQuery
 * Converts invalid characters to underscores
 */
function sanitizeColumnName(name) {
  if (!name) return 'column_' + Math.random().toString(36).substr(2, 9);
  return String(name)
    .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace invalid chars with underscore
    .replace(/_+/g, '_')               // Collapse multiple underscores
    .replace(/^_|_$/g, '')             // Remove leading/trailing underscores
    .toLowerCase();
}

/**
 * Sync rows to BigQuery table using WRITE_TRUNCATE (clears duplicates)
 */
function syncToBI(rows, tableName) {
  if (!rows || rows.length === 0) return;

  // Convert rows to NDJSON
  const ndjson = rows.map(r => JSON.stringify(r)).join('\n') + '\n';
  const blob = Utilities.newBlob(ndjson, 'application/octet-stream');

  const job = {
    configuration: {
      load: {
        destinationTable: {
          projectId: BQ_PROJECT_ID_V2,
          datasetId: BQ_DATASET_V2,
          tableId: tableName
        },
        sourceFormat: 'NEWLINE_DELIMITED_JSON',
        writeDisposition: 'WRITE_TRUNCATE',  // <-- CRITICAL: clears duplicates
        createDisposition: 'CREATE_IF_NEEDED',
        autodetect: true
      }
    }
  };

  let job_ = BigQuery.Jobs.insert(job, BQ_PROJECT_ID_V2, blob);
  const jobId = job_.jobReference.jobId;

  // Wait for completion
  const deadline = Date.now() + 5 * 60 * 1000;
  while (job_.status.state !== 'DONE') {
    if (Date.now() > deadline) {
      throw new Error('BigQuery load timed out for ' + tableName);
    }
    Utilities.sleep(2000);
    job_ = BigQuery.Jobs.get(BQ_PROJECT_ID_V2, jobId);
  }

  if (job_.status.errorResult) {
    throw new Error('BigQuery load failed for ' + tableName + ': ' + job_.status.errorResult.message);
  }
}

// ============================================================================
// STEP 1: FETCH FROM BIGQUERY
// ============================================================================

/**
 * Fetch data from v2_funnel table (cleaned data from Google Sheet)
 */
function fetchCurrentDataTable() {
  const sql = `
    SELECT
      n, t, CAST(d AS STRING) as d, pen, ns, mis, can, lost, won, pp, ts, cash, rev, product
    FROM \`${BQ_PROJECT_ID_V2}.${BQ_DATASET_V2}.${BQ_TABLE_DATA}\`
    WHERE CAST(d AS DATE) >= DATE_SUB(CURRENT_DATE('Australia/Sydney'), INTERVAL 12 MONTH)
    ORDER BY d DESC
  `;

  return executeAndReturnRows(sql);
}

/**
 * Fetch data from v2_kpi table (cleaned data from Google Sheet)
 */
function fetchCurrentDataKPITable() {
  const sql = `
    SELECT
      n, t, CAST(d AS STRING) as d, hrs, di, se, ap, ns, su, cf, cash, rev
    FROM \`${BQ_PROJECT_ID_V2}.${BQ_DATASET_V2}.${BQ_TABLE_KPI}\`
    WHERE CAST(d AS DATE) >= DATE_SUB(CURRENT_DATE('Australia/Sydney'), INTERVAL 12 MONTH)
    ORDER BY d DESC
  `;

  return executeAndReturnRows(sql);
}

/**
 * Fetch agent list from BigQuery agent_list table
 * Uses full_name to match agent names in v2_funnel and v2_kpi tables
 */
function fetchAgentList() {
  const sql = `
    SELECT full_name AS n, full_name AS f, tier AS t, status AS s
    FROM \`${BQ_PROJECT_ID_V2}.${BQ_DATASET_V2}.agent_list\`
    ORDER BY full_name
  `;

  return executeAndReturnRows(sql);
}

/**
 * Execute BigQuery query and return rows as array of objects
 */
function executeAndReturnRows(sql) {
  try {
    const request = {
      query: sql,
      useLegacySql: false,
      location: 'US'
    };

    const queryResults = BigQuery.Jobs.query(request, BQ_PROJECT_ID_V2);
    const jobReference = queryResults.jobReference;
    let rows = queryResults.rows || [];

    // Get remaining results if paginated
    let pageToken = queryResults.pageToken;
    while (pageToken) {
      const pageResults = BigQuery.Jobs.getQueryResults(
        BQ_PROJECT_ID_V2,
        jobReference.jobId,
        {pageToken: pageToken}
      );
      rows = rows.concat(pageResults.rows || []);
      pageToken = pageResults.pageToken;
    }

    // Convert BigQuery format to object array
    return convertBigQueryRows(rows, queryResults.schema);

  } catch (error) {
    Logger.log('Error querying BigQuery: ' + error.toString());
    throw error;
  }
}

/**
 * Convert BigQuery row format to object array
 */
function convertBigQueryRows(rows, schema) {
  if (!rows) return [];

  return rows.map(row => {
    const obj = {};
    row.f.forEach((cell, index) => {
      const fieldName = schema.fields[index].name;
      obj[fieldName] = cell.v;
    });
    return obj;
  });
}

// ============================================================================
// STEP 2: TRANSFORM DATA
// ============================================================================

/**
 * Transform v2 BigQuery data into dashboard-compatible format
 * Uses agents from agent_list table for consistency with v1
 */
function transformV2Data(funnelData, kpiData, agentList) {
  const v2Data = {
    synced_at: new Date().toISOString(),
    agents: [],
    funnel: [],
    kpi: [],
    programs: [],
    targets: [],
    cash_breakdown: []
  };

  // Use agent_list table directly, filter by ACTIVE status only
  v2Data.agents = agentList.filter(a => a.s === 'ACTIVE').map(a => ({
    n: a.n,
    f: a.f,
    t: a.t,
    s: a.s
  }));

  // Transform funnel data - data is already aggregated, just format it
  v2Data.funnel = funnelData.map(row => ({
    n: row.n || '',
    d: row.d || '',
    won: parseInt(row.won) || 0,
    pen: parseInt(row.pen) || 0,
    lost: parseInt(row.lost) || 0,
    ns: parseInt(row.ns) || 0,
    mis: parseInt(row.mis) || 0,
    can: parseInt(row.can) || 0,
    pp: parseInt(row.pp) || 0,  // Price presented (now included from Google Sheet)
    ts: parseInt(row.ts) || 0,  // Terms signed (now included from Google Sheet)
    rev: parseFloat(row.rev) || 0,
    cash: parseFloat(row.cash) || 0
  }));

  // Transform KPI data - data is already aggregated, just format it
  v2Data.kpi = kpiData.map(row => ({
    n: row.n || '',
    d: row.d || '',
    hrs: parseFloat(row.hrs) || 0,
    di: parseInt(row.di) || 0,
    se: parseInt(row.se) || 0,
    ap: parseInt(row.ap) || 0,
    ns: parseInt(row.ns) || 0,
    su: parseInt(row.su) || 0,
    cf: parseInt(row.cf) || 0,
    cash: parseFloat(row.cash) || 0,
    rev: parseFloat(row.rev) || 0
  }));

  return v2Data;
}

/**
 * Format tier number to tier string
 */
function formatTier(tierNum) {
  const tier = parseInt(tierNum);
  if (tier === 1) return 'TIER 1';
  if (tier === 2) return 'TIER 2';
  if (tier === 3) return 'TIER 3';
  return 'UNKNOWN';
}

// ============================================================================
// STEP 3: EXPORT TO GITHUB
// ============================================================================

/**
 * Export v2 data to GitHub
 */
function exportV2DataToGitHub(jsonData) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');

  if (!token) {
    Logger.log('⚠️  GITHUB_TOKEN not set. Use setGitHubToken("your_token") first.');
    return;
  }

  try {
    const currentSha = getFileShaBigQuery(
      GITHUB_OWNER_V2,
      GITHUB_REPO_V2,
      GITHUB_FILE_PATH_V2,
      token
    );

    const commitMessage = `chore: sync v2 sales data ${new Date().toISOString().split('T')[0]}`;
    const encodedContent = Utilities.base64Encode(JSON.stringify(jsonData, null, 2));

    const payload = {
      message: commitMessage,
      content: encodedContent,
      branch: GITHUB_BRANCH_V2
    };

    if (currentSha) {
      payload.sha = currentSha;
    }

    const url = `https://api.github.com/repos/${GITHUB_OWNER_V2}/${GITHUB_REPO_V2}/contents/${GITHUB_FILE_PATH_V2}`;
    const options = {
      method: 'put',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();

    if (code === 200 || code === 201) {
      Logger.log('✅ GitHub export successful');
    } else {
      Logger.log(`❌ GitHub export failed (${code}): ${response.getContentText()}`);
    }
  } catch (error) {
    Logger.log('❌ GitHub error: ' + error.toString());
  }
}

/**
 * Get file SHA from GitHub
 */
function getFileShaBigQuery(owner, repo, path, token) {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const options = {
      method: 'get',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      return JSON.parse(response.getContentText()).sha;
    }
    return null;
  } catch (error) {
    Logger.log('Error getting file SHA: ' + error.toString());
    return null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Set GitHub token in Script Properties
 * Run once: setGitHubToken("your_github_token_here")
 */
function setGitHubToken(token) {
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', token);
  Logger.log('✅ GitHub token saved');
}

/**
 * Test v2 data sync
 */
function testV2Sync() {
  Logger.log('🧪 Running v2 data sync test...');
  syncV2DataNow();
}
