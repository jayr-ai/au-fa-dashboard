/**
 * Masterclass Attendance Sync - GHL Integration
 * Queries GHL for contacts with attendance tags → Aggregates by date → GitHub JSON
 * Runs daily to sync actual attendance counts from GHL tags
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const GHL_API_KEY = PropertiesService.getScriptProperties().getProperty('GHL_API_KEY');
const GHL_LOCATION_ID = 'location-id-here'; // Will be configured in Script Properties

// GitHub configuration
const GH_OWNER = 'jayr-ai';
const GH_REPO = 'au-fa-dashboard';
const GH_FILE = 'marketing-dashboard/data/masterclass-attendance.json';
const GH_BRANCH = 'main';

// All known webinar dates from the registrations sync
const WEBINAR_DATES = [
  '2026-08-25', '2026-08-18', '2026-08-11', '2026-08-05', '2026-08-04',
  '2026-07-28', '2026-07-22', '2026-07-16',
  '2026-06-24', '2026-06-17', '2026-06-11', '2026-06-09', '2026-06-04', '2026-06-02',
  '2026-05-28', '2026-05-26', '2026-05-21', '2026-05-19', '2026-05-14', '2026-05-12', '2026-05-07', '2026-05-05',
  '2026-04-30', '2026-04-28', '2026-04-23', '2026-04-21', '2026-04-15', '2026-04-08'
];

// ============================================================================
// MAIN ORCHESTRATION
// ============================================================================

function syncMasterclassAttendance() {
  try {
    Logger.log('🔄 Starting masterclass attendance sync...');
    const startTime = new Date();

    // Step 1: Query GHL for attendance tags
    Logger.log('📊 Step 1: Querying GHL for attendance tags...');
    const attendanceCounts = queryGHLAttendanceTags();
    Logger.log(`   ✓ Found ${Object.keys(attendanceCounts).length} dates with attendance data`);

    // Step 2: Generate JSON for dashboard
    Logger.log('🔧 Step 2: Generating dashboard JSON...');
    const jsonData = generateAttendanceJSON(attendanceCounts);
    Logger.log('   ✓ JSON generated');

    // Step 3: Export to GitHub
    Logger.log('🚀 Step 3: Exporting to GitHub...');
    exportToGitHub(jsonData);
    Logger.log('   ✓ Exported to GitHub');

    const duration = Math.round((new Date() - startTime) / 1000);
    Logger.log(`✅ Attendance sync completed in ${duration}s`);

  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    Logger.log('   Stack: ' + error.stack);
    throw error;
  }
}

// ============================================================================
// STEP 1: QUERY GHL FOR ATTENDANCE TAGS
// ============================================================================

function queryGHLAttendanceTags() {
  if (!GHL_API_KEY) {
    throw new Error('GHL_API_KEY not set in Script Properties');
  }

  const attendanceCounts = {};

  // For each known webinar date, query for the attendance tag
  WEBINAR_DATES.forEach(dateStr => {
    const tagName = getAttendanceTagName(dateStr);
    const count = queryGHLTagCount(tagName);
    attendanceCounts[dateStr] = count;
    Logger.log(`   ${tagName}: ${count} attendees`);
  });

  return attendanceCounts;
}

function getAttendanceTagName(isoDateStr) {
  // Convert 2026-08-25 → "masterclass - attended 25/8"
  const [year, month, day] = isoDateStr.split('-');
  const dayNum = parseInt(day);
  const monthNum = parseInt(month);
  return `masterclass - attended ${dayNum}/${monthNum}`;
}

function queryGHLTagCount(tagName) {
  try {
    // GHL API: search contacts by tag
    const url = 'https://rest.gohighlevel.com/v1/contacts/search';

    const payload = {
      limit: 1,
      query: {
        tags: [tagName]
      }
    };

    const options = {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${GHL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    // Return the total count from the search results
    return result.meta?.total || 0;
  } catch (error) {
    Logger.log(`   Error querying tag ${tagName}: ${error.toString()}`);
    return 0;
  }
}

// ============================================================================
// STEP 2: GENERATE ATTENDANCE JSON
// ============================================================================

function generateAttendanceJSON(attendanceCounts) {
  const now = new Date().toISOString();

  return {
    meta: {
      generatedAt: now,
      source: 'GHL (Attendance tags: masterclass - attended D/M)',
      dataWindow: 'Apr 2026 - Present',
      cacheStatus: 'Live sync from GHL (updated daily)',
      totalAttendees: Object.values(attendanceCounts).reduce((sum, count) => sum + count, 0)
    },
    masterclassAttendance: WEBINAR_DATES.map(dateStr => ({
      date: dateStr,
      attended: attendanceCounts[dateStr] || 0
    }))
  };
}

// ============================================================================
// STEP 3: EXPORT TO GITHUB
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
    message: 'Update: Masterclass attendance from GHL sync',
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

function testQueryGHLTag() {
  const tagName = 'masterclass - attended 25/8';
  const count = queryGHLTagCount(tagName);
  Logger.log(`Tag "${tagName}" has ${count} contacts`);
}

function testAttendanceSync() {
  const counts = queryGHLAttendanceTags();
  Logger.log('Attendance counts:');
  Logger.log(JSON.stringify(counts, null, 2));
}

function testGenerateJSON() {
  const counts = queryGHLAttendanceTags();
  const json = generateAttendanceJSON(counts);
  Logger.log('Generated JSON:');
  Logger.log(JSON.stringify(json, null, 2));
}
