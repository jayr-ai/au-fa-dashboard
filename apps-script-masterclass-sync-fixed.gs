/**
 * Freedom Academy Masterclass Registrations Sync
 * Reads from Google Sheet (X-Auto tab) → BigQuery → Dashboard JSON
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const SHEET_ID = '1g4h0IHwz0_BZ90nslU7NNKwIsENJw9hzgbk3A52dcQo';
const SHEET_TAB = 'X - AUTO';
const BQ_PROJECT = 'jv-data-warehouse';
const BQ_DATASET = 'freedom_academy_au';
const BQ_TABLE = 'marketing_masterclass_registrations';

// GitHub configuration
const GH_OWNER = 'jayr-ai';
const GH_REPO = 'au-fa-dashboard';
const GH_FILE = 'marketing-dashboard/data/masterclass-registrations.json';
const GH_BRANCH = 'main';

// ============================================================================
// MAIN ORCHESTRATION
// ============================================================================

function syncMasterclassData() {
  try {
    Logger.log('🔄 Starting masterclass registration sync...');
    const startTime = new Date();

    // Step 1: Read from sheet
    Logger.log('📄 Step 1: Reading X-Auto sheet...');
    const registrations = readMasterclassSheet();
    Logger.log(`   ✓ Read ${registrations.length} registrations`);

    // Step 2: Sync to BigQuery
    Logger.log('☁️  Step 2: Syncing to BigQuery...');
    syncToBigQuery(registrations);
    Logger.log('   ✓ Synced to BigQuery');

    // Step 3: Generate summary
    Logger.log('📊 Step 3: Generating summary...');
    Utilities.sleep(2000); // Wait for streaming buffer
    const summary = generateMasterclassSummary();
    Logger.log(`   ✓ Generated summary for ${summary.length} webinars`);

    // Step 4: Generate JSON for dashboard
    Logger.log('🔧 Step 4: Generating dashboard JSON...');
    const jsonData = generateDashboardJSON(summary);
    Logger.log('   ✓ JSON generated');

    // Step 5: Export to GitHub
    Logger.log('🚀 Step 5: Exporting to GitHub...');
    exportToGitHub(jsonData);
    Logger.log('   ✓ Exported to GitHub');

    const duration = Math.round((new Date() - startTime) / 1000);
    Logger.log(`✅ Sync completed in ${duration}s`);

  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    Logger.log('   Stack: ' + error.stack);
    throw error;
  }
}

// ============================================================================
// STEP 1: READ FROM GOOGLE SHEET
// ============================================================================

function readMasterclassSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_TAB);

  if (!sheet) {
    throw new Error(`Sheet "${SHEET_TAB}" not found`);
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const emailCol = headers.indexOf('Email Address');
  const nameCol = headers.indexOf('Client Name');
  const phoneCol = headers.indexOf('Phone');
  const optInCol = headers.indexOf('Opt-In Date');
  const sourceCol = headers.indexOf('Source');
  const webinarDateCol = headers.indexOf('Webinar Date');

  if (emailCol === -1 || webinarDateCol === -1) {
    throw new Error('Required columns not found: Email Address, Webinar Date');
  }

  const registrations = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = row[emailCol]?.toString().trim();
    const webinarDateRaw = row[webinarDateCol];

    if (!email || !webinarDateRaw) continue;

    let webinarDate;
    if (webinarDateRaw instanceof Date) {
      webinarDate = formatDate(webinarDateRaw);
    } else {
      webinarDate = parseWebinarDate(webinarDateRaw.toString());
    }

    if (!webinarDate) continue;

    registrations.push({
      sync_id: Utilities.getUuid(),
      email: email,
      name: row[nameCol]?.toString().trim() || '',
      phone: row[phoneCol]?.toString().trim() || '',
      opt_in_date: row[optInCol] instanceof Date ? formatDate(row[optInCol]) : null,
      webinar_date: webinarDate,
      source: row[sourceCol]?.toString().trim() || 'Masterclass Optin',
      synced_at: new Date().toISOString()
    });
  }

  Logger.log(`   Parsed ${registrations.length} valid registrations from sheet`);
  return registrations;
}

function parseWebinarDate(dateStr) {
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return formatDate(date);
    }
  } catch (e) {}

  if (dateStr.match(/\d{4}-\d{2}-\d{2}/)) {
    return dateStr;
  }

  return null;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================================
// STEP 2: SYNC TO BIGQUERY (using REST API)
// ============================================================================

function syncToBigQuery(registrations) {
  const accessToken = ScriptApp.getOAuthToken();

  const rows = registrations.map(reg => ({
    insertId: reg.sync_id,
    json: {
      sync_id: reg.sync_id,
      email: reg.email,
      name: reg.name,
      phone: reg.phone,
      opt_in_date: reg.opt_in_date,
      webinar_date: reg.webinar_date,
      source: reg.source,
      synced_at: reg.synced_at
    }
  }));

  const url = `https://www.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/datasets/${BQ_DATASET}/tables/${BQ_TABLE}/insertAll`;

  const payload = {
    rows: rows,
    skipInvalidRows: false,
    ignoreUnknownValues: true
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (response.getResponseCode() !== 200) {
      throw new Error(`BigQuery error: ${result.error?.message || response.getContentText()}`);
    }

    if (result.errors) {
      Logger.log('   ⚠️  Insertion errors:');
      result.errors.forEach(err => {
        Logger.log(`      Row ${err.index}: ${err.errors.map(e => e.message).join(', ')}`);
      });
    }

    Logger.log(`   ✓ Inserted ${rows.length} rows to BigQuery`);
  } catch (error) {
    throw new Error(`BigQuery insert failed: ${error.toString()}`);
  }
}

// ============================================================================
// STEP 3: GENERATE SUMMARY (using REST API)
// ============================================================================

function generateMasterclassSummary() {
  const accessToken = ScriptApp.getOAuthToken();

  const query = `
    SELECT
      webinar_date,
      CASE
        WHEN webinar_date = '2026-04-30' THEN '30 Apr 2026'
        WHEN webinar_date = '2026-05-28' THEN '28 May 2026'
        WHEN webinar_date = '2026-06-24' THEN '24 Jun 2026'
        WHEN webinar_date = '2026-07-16' THEN '16 Jul 2026'
        WHEN webinar_date = '2026-07-22' THEN '22 Jul 2026'
        WHEN webinar_date = '2026-07-28' THEN '28 Jul 2026'
        WHEN webinar_date = '2026-08-04' THEN '04 Aug 2026'
        WHEN webinar_date = '2026-08-11' THEN '11 Aug 2026'
        WHEN webinar_date = '2026-08-18' THEN '18 Aug 2026'
        WHEN webinar_date = '2026-08-25' THEN '25 Aug 2026'
        ELSE FORMAT_DATE('%d %b %Y', webinar_date)
      END as webinar_label,
      COUNT(DISTINCT email) as registered
    FROM \`${BQ_PROJECT}.${BQ_DATASET}.${BQ_TABLE}\`
    WHERE webinar_date IS NOT NULL
    GROUP BY webinar_date, webinar_label
    ORDER BY webinar_date DESC
  `;

  const url = `https://www.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`;

  const payload = {
    query: query,
    useLegacySql: false,
    maxResults: 1000
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (response.getResponseCode() !== 200) {
      throw new Error(`BigQuery query error: ${result.error?.message || response.getContentText()}`);
    }

    const rows = result.rows || [];

    return rows.map(row => ({
      webinar_date: row.f[0].v,
      webinar_label: row.f[1].v,
      registered: parseInt(row.f[2].v)
    }));
  } catch (error) {
    throw new Error(`Summary query failed: ${error.toString()}`);
  }
}

// ============================================================================
// STEP 4: GENERATE DASHBOARD JSON
// ============================================================================

function generateDashboardJSON(summary) {
  const now = new Date().toISOString();

  return {
    meta: {
      generatedAt: now,
      source: 'Google Sheet (FA | Webinar Lead Tracker, X-Auto tab) synced to BigQuery',
      dataWindow: 'Jan 2026 - Present',
      cacheStatus: 'Live sync from Google Sheet (updated daily)'
    },
    masterclassRegistrations: summary.map(run => ({
      date: run.webinar_date,
      label: run.webinar_label,
      registered: run.registered,
      attended: 0,
      showUpRatePct: 0,
      vipUpgrade: 0,
      cashFromVip: 0,
      application: 0,
      attendToAppPct: 0,
      allTimeRevenue: 0,
      dealsClosed: 0,
      cashFromAds: 0,
      cashFromOrganic: 0,
      deals: [],
      executiveSummary: {
        bullets: [
          `${run.registered} registrations for ${run.webinar_label}`
        ]
      }
    }))
  };
}

// ============================================================================
// STEP 5: EXPORT TO GITHUB
// ============================================================================

function exportToGitHub(jsonData) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error('GITHUB_TOKEN not set in Script Properties');
  }

  const content = JSON.stringify(jsonData, null, 2);
  const contentBase64 = Utilities.base64Encode(content);

  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}`;

  // Get current file SHA
  const getOptions = {
    method: 'get',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    },
    muteHttpExceptions: true
  };

  const getResponse = UrlFetchApp.fetch(url, getOptions);
  const getResult = JSON.parse(getResponse.getContentText());
  const sha = getResult.sha;

  // Push update
  const payload = {
    message: 'Update: Masterclass registrations sync from Google Sheet',
    content: contentBase64,
    branch: GH_BRANCH,
    sha: sha
  };

  const postOptions = {
    method: 'put',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const postResponse = UrlFetchApp.fetch(url, postOptions);
  const postResult = JSON.parse(postResponse.getContentText());

  if (postResponse.getResponseCode() !== 200) {
    throw new Error(`GitHub push failed: ${postResult.message}`);
  }

  Logger.log(`   ✓ Pushed to GitHub: ${postResult.commit.message}`);
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

function testReadSheet() {
  const data = readMasterclassSheet();
  Logger.log('Sample data:');
  Logger.log(JSON.stringify(data.slice(0, 3), null, 2));
}

function testGenerateSummary() {
  const summary = generateMasterclassSummary();
  Logger.log('Summary:');
  Logger.log(JSON.stringify(summary, null, 2));
}
