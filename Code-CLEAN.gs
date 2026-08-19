/**
 * Masterclass Registrations Sync - Simple Version
 * Reads from Google Sheet (X-Auto tab) → Aggregates by Webinar Date → GitHub JSON
 * No BigQuery needed - just Sheet → JSON → Dashboard
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const SHEET_ID = '1g4h0IHwz0_BZ90nslU7NNKwIsENJw9hzgbk3A52dcQo';
const SHEET_TAB = 'X - AUTO';

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

    // Step 2: Aggregate by webinar date
    Logger.log('📊 Step 2: Aggregating by webinar date...');
    const summary = aggregateByWebinarDate(registrations);
    Logger.log(`   ✓ Generated summary for ${summary.length} webinars`);

    // Step 3: Generate JSON for dashboard
    Logger.log('🔧 Step 3: Generating dashboard JSON...');
    const jsonData = generateDashboardJSON(summary);
    Logger.log('   ✓ JSON generated');

    // Step 4: Export to GitHub
    Logger.log('🚀 Step 4: Exporting to GitHub...');
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

  // Find column indices
  const emailCol = headers.indexOf('Email Address');
  const webinarDateCol = headers.indexOf('Webinar Date');

  if (emailCol === -1 || webinarDateCol === -1) {
    throw new Error('Required columns not found: Email Address, Webinar Date');
  }

  const registrations = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = row[emailCol]?.toString().trim();
    const webinarDateRaw = row[webinarDateCol];

    // Skip empty rows
    if (!email || !webinarDateRaw) continue;

    // Parse webinar date
    let webinarDate;
    if (webinarDateRaw instanceof Date) {
      webinarDate = formatDate(webinarDateRaw);
    } else {
      webinarDate = parseWebinarDate(webinarDateRaw.toString());
    }

    if (!webinarDate) continue;

    registrations.push({
      email: email,
      webinar_date: webinarDate
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
// STEP 2: AGGREGATE BY WEBINAR DATE
// ============================================================================

function aggregateByWebinarDate(registrations) {
  // Group registrations by webinar date and count unique emails
  const dateMap = {};

  registrations.forEach(reg => {
    if (!dateMap[reg.webinar_date]) {
      dateMap[reg.webinar_date] = new Set();
    }
    dateMap[reg.webinar_date].add(reg.email);
  });

  // Map labels for known dates
  const dateLabels = {
    '2026-04-30': '30 Apr 2026',
    '2026-05-28': '28 May 2026',
    '2026-06-24': '24 Jun 2026',
    '2026-07-16': '16 Jul 2026',
    '2026-07-22': '22 Jul 2026',
    '2026-07-28': '28 Jul 2026',
    '2026-08-04': '04 Aug 2026',
    '2026-08-11': '11 Aug 2026',
    '2026-08-18': '18 Aug 2026',
    '2026-08-25': '25 Aug 2026'
  };

  // Convert to array and sort by date descending
  const summary = Object.keys(dateMap)
    .sort()
    .reverse()
    .map(date => ({
      webinar_date: date,
      webinar_label: dateLabels[date] || formatDateLabel(date),
      registered: dateMap[date].size
    }));

  return summary;
}

function formatDateLabel(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  const options = { day: '2-digit', month: 'short', year: 'numeric' };
  return date.toLocaleDateString('en-AU', options).replace(/\s/g, ' ');
}

// ============================================================================
// STEP 3: GENERATE DASHBOARD JSON
// ============================================================================

function generateDashboardJSON(summary) {
  const now = new Date().toISOString();

  return {
    meta: {
      generatedAt: now,
      source: 'Google Sheet (FA | Webinar Lead Tracker, X-Auto tab)',
      dataWindow: 'Jan 2026 - Present',
      cacheStatus: 'Live sync from Google Sheet (updated daily)',
      totalRegistrations: summary.reduce((sum, run) => sum + run.registered, 0)
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
// STEP 4: EXPORT TO GITHUB
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
    message: 'Update: Masterclass registrations from Google Sheet sync',
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
  Logger.log(JSON.stringify(data.slice(0, 5), null, 2));
}

function testAggregation() {
  const registrations = readMasterclassSheet();
  const summary = aggregateByWebinarDate(registrations);
  Logger.log('Aggregation summary:');
  Logger.log(JSON.stringify(summary, null, 2));
}
