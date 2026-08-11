/**
 * Freedom Academy Sales Dashboard v2 - BigQuery Data Pipeline
 * Reads from current_data and current_data_kpi BigQuery tables
 * Prepares v2 data for the dashboard (Executive Summary v2)
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
const SPREADSHEET_ID_V2 = '1LKIwjIpzn1jNSaIzzLAWLkkiODJUuKReKkw3QUT9c8A';
const GITHUB_OWNER_V2 = 'jayr-ai';
const GITHUB_REPO_V2 = 'au-fa-dashboard';
const GITHUB_FILE_PATH_V2 = 'sales-dashboard/data-v2.json';
const GITHUB_BRANCH_V2 = 'main';

// ============================================================================
// MAIN ORCHESTRATION
// ============================================================================

/**
 * Main v2 sync function - Run this to fetch v2 data from BigQuery
 * Can be triggered daily or run manually
 */
function syncV2DataNow() {
  try {
    Logger.log('🔄 Starting v2 data sync from BigQuery...');
    const startTime = new Date();

    // Step 1: Fetch from current_data table
    Logger.log('📊 Fetching current_data (sales funnel)...');
    const funnelData = fetchCurrentDataTable();
    Logger.log(`   ✓ Fetched ${funnelData.length} records from current_data`);

    // Step 2: Fetch from current_data_kpi table
    Logger.log('📊 Fetching current_data_kpi (dialer/setter)...');
    const kpiData = fetchCurrentDataKPITable();
    Logger.log(`   ✓ Fetched ${kpiData.length} records from current_data_kpi`);

    // Step 3: Transform data into dashboard format
    Logger.log('🔧 Transforming data for v2 dashboard...');
    const v2DataObject = transformV2Data(funnelData, kpiData);
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
// STEP 1: FETCH FROM BIGQUERY
// ============================================================================

/**
 * Fetch data from v2_funnel table (pre-aggregated sales funnel data)
 */
function fetchCurrentDataTable() {
  const sql = `
    SELECT
      n, t, d, pen, ns, mis, can, lost, won, cash, rev, product
    FROM \`${BQ_PROJECT_ID_V2}.${BQ_DATASET_V2}.${BQ_TABLE_DATA}\`
    WHERE d >= FORMAT_DATE('%Y-%m-%d', DATE_SUB(CURRENT_DATE('Australia/Sydney'), INTERVAL 12 MONTH))
    ORDER BY d DESC
  `;

  return executeAndReturnRows(sql);
}

/**
 * Fetch data from v2_kpi table (pre-aggregated dialer/setter data)
 */
function fetchCurrentDataKPITable() {
  const sql = `
    SELECT
      n, t, d, hrs, di, se, ap, ns, su, cf, sa, cash, rev
    FROM \`${BQ_PROJECT_ID_V2}.${BQ_DATASET_V2}.${BQ_TABLE_KPI}\`
    WHERE d >= FORMAT_DATE('%Y-%m-%d', DATE_SUB(CURRENT_DATE('Australia/Sydney'), INTERVAL 12 MONTH))
    ORDER BY d DESC
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
 * Data from v2_funnel and v2_kpi is already pre-aggregated, so just map columns
 */
function transformV2Data(funnelData, kpiData) {
  const v2Data = {
    synced_at: new Date().toISOString(),
    agents: [],
    funnel: [],
    kpi: [],
    programs: [],
    targets: [],
    cash_breakdown: []
  };

  // Build unique agents list from funnel and KPI data
  const agentsMap = new Map();

  funnelData.forEach(row => {
    if (row.n && row.t) {
      const key = row.n;
      if (!agentsMap.has(key)) {
        agentsMap.set(key, {
          n: row.n,
          f: row.n,  // Use name as fallback for full name
          t: formatTier(row.t),
          s: 'ACTIVE'
        });
      }
    }
  });

  kpiData.forEach(row => {
    if (row.n && row.t) {
      const key = row.n;
      if (!agentsMap.has(key)) {
        agentsMap.set(key, {
          n: row.n,
          f: row.n,  // Use name as fallback for full name
          t: formatTier(row.t),
          s: 'ACTIVE'
        });
      }
    }
  });

  v2Data.agents = Array.from(agentsMap.values());

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
    pp: 0,  // Price presented not in v2_funnel
    ts: 0,  // Terms signed not in v2_funnel
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
    sa: parseInt(row.sa) || 0,
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
