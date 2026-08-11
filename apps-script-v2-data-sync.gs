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
const BQ_TABLE_DATA = 'current_data';
const BQ_TABLE_KPI = 'current_data_kpi';
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
 * Fetch data from current_data table (sales funnel data)
 */
function fetchCurrentDataTable() {
  const sql = `
    SELECT
      staff_name,
      tier,
      \`group\`,
      field,
      date,
      COUNT(*) as count,
      SUM(CAST(tcp AS FLOAT64)) as tcp,
      SUM(CAST(upfront_cash AS FLOAT64)) as upfront_cash,
      SUM(CAST(revenue AS FLOAT64)) as revenue,
      SUM(CAST(cash AS FLOAT64)) as cash,
      MAX(agent_full_name) as agent_full_name,
      MAX(synced_at) as synced_at
    FROM \`${BQ_PROJECT_ID_V2}.${BQ_DATASET_V2}.${BQ_TABLE_DATA}\`
    WHERE date >= DATE_SUB(CURRENT_DATE('Australia/Sydney'), INTERVAL 12 MONTH)
    GROUP BY staff_name, tier, \`group\`, field, date
    ORDER BY date DESC
  `;

  return executeAndReturnRows(sql);
}

/**
 * Fetch data from current_data_kpi table (dialer/setter data)
 */
function fetchCurrentDataKPITable() {
  const sql = `
    SELECT
      agent_name,
      tier,
      date,
      CAST(hours_on_dialer AS FLOAT64) as hours,
      dials,
      sets,
      appointments,
      no_shows,
      show_ups,
      appointments_confirmed as confirmed,
      sales,
      CAST(cash_collected AS FLOAT64) as cash,
      CAST(revenue AS FLOAT64) as revenue,
      agent_full_name,
      synced_at
    FROM \`${BQ_PROJECT_ID_V2}.${BQ_DATASET_V2}.${BQ_TABLE_KPI}\`
    WHERE date >= DATE_SUB(CURRENT_DATE('Australia/Sydney'), INTERVAL 12 MONTH)
    ORDER BY date DESC
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
 * Creates funnel, kpi, agents, programs, and other required arrays
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

  // Build unique agents list
  const agentsMap = new Map();

  funnelData.forEach(row => {
    if (row.staff_name && row.agent_full_name) {
      const key = row.staff_name;
      if (!agentsMap.has(key)) {
        agentsMap.set(key, {
          n: row.staff_name,           // short name
          f: row.agent_full_name,      // full name
          t: formatTier(row.tier),     // tier
          s: 'ACTIVE'                  // status
        });
      }
    }
  });

  kpiData.forEach(row => {
    if (row.agent_name && row.agent_full_name) {
      const key = row.agent_name;
      if (!agentsMap.has(key)) {
        agentsMap.set(key, {
          n: row.agent_name,           // short name
          f: row.agent_full_name,      // full name
          t: formatTier(row.tier),     // tier
          s: 'ACTIVE'                  // status
        });
      }
    }
  });

  v2Data.agents = Array.from(agentsMap.values());

  // Transform funnel data
  // Group by staff_name and date, aggregate funnel stages correctly
  const funnelMap = new Map();
  const paymentPlanFields = ['🦄🇦🇺 1PAY', '🦄🇦🇺 2PAY', '🦄🇦🇺 3PAY', '💰🇦🇺 6PAY',
                               '💥🇦🇺 Finance', '🐌🇦🇺 Exetnded - 11PAY'];

  funnelData.forEach(row => {
    if (!row.staff_name || !row.date) return;

    const key = `${row.staff_name}|${row.date}`;
    if (!funnelMap.has(key)) {
      funnelMap.set(key, {
        n: row.staff_name,
        d: row.date,
        won: 0,           // Payment plans (closed deals)
        pending: 0,       // Pending
        lost: 0,          // Lost
        noShow: 0,        // No Show
        missed: 0,        // Missed
        cancelled: 0,     // Cancelled
        pricePresented: 0,// Price Presented
        termsSigned: 0,   // Terms Signed
        rev: 0,
        cash: 0
      });
    }

    const record = funnelMap.get(key);
    const fieldCount = parseInt(row.count) || 0;
    const revenue = parseFloat(row.revenue) || 0;
    const cash = parseFloat(row.cash) || 0;

    // Map field values to metric counts
    // Won = payment plan records (any field that is a payment plan)
    if (paymentPlanFields.includes(row.field)) {
      record.won += fieldCount;
    } else if (row.field === 'Pending') {
      record.pending += fieldCount;
    } else if (row.field === 'Lost') {
      record.lost += fieldCount;
    } else if (row.field === 'No Show') {
      record.noShow += fieldCount;
    } else if (row.field === 'Missed') {
      record.missed += fieldCount;
    } else if (row.field === 'Cancelled') {
      record.cancelled += fieldCount;
    } else if (row.field === 'Price Presented') {
      record.pricePresented += fieldCount;
    } else if (row.field === 'Terms Signed') {
      record.termsSigned += fieldCount;
    }

    record.rev += revenue;
    record.cash += cash;
  });

  // Convert to final format with calculated Booked and Held
  v2Data.funnel = Array.from(funnelMap.values()).map(r => ({
    n: r.n,
    d: r.d,
    booked: r.won + r.pending + r.lost + r.noShow + r.missed + r.cancelled,  // All funnel stages
    held: r.won + r.pending + r.lost,  // Won + pending + lost
    won: r.won,     // Won = closed deals (payment plans)
    pending: r.pending,
    lost: r.lost,
    noShow: r.noShow,
    missed: r.missed,
    cancelled: r.cancelled,
    pricePresented: r.pricePresented,
    termsSigned: r.termsSigned,
    rev: r.rev,
    cash: r.cash
  }));

  // Transform KPI data (for Tier 3 - Setters)
  kpiData.forEach(row => {
    if (!row.agent_name || !row.date) return;

    v2Data.kpi.push({
      n: row.agent_name,
      d: row.date,
      hrs: parseFloat(row.hours) || 0,
      di: parseInt(row.dials) || 0,
      se: parseInt(row.sets) || 0,
      ap: parseInt(row.appointments) || 0,
      ns: parseInt(row.no_shows) || 0,
      su: parseInt(row.show_ups) || 0,
      cf: parseInt(row.confirmed) || 0,
      sa: parseInt(row.sales) || 0,      // Won = sales count from KPI
      cash: parseFloat(row.cash) || 0,
      rev: parseFloat(row.revenue) || 0
    });
  });

  // Note: programs, targets, and cash_breakdown would need additional logic
  // For now, they're empty arrays that the dashboard can handle gracefully

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
