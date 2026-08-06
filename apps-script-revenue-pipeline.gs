/**
 * Freedom Academy Revenue Dashboard - Complete Apps Script Pipeline
 * Reads from Google Sheets CONSOLIDATED tab → BigQuery → JSON Export → GitHub Pages
 *
 * Setup:
 * 1. Save this script to your Google Sheet
 * 2. Set up GitHub token in Script Properties: GITHUB_TOKEN
 * 3. Create BigQuery trigger for daily execution at ~2 AM UTC
 */

// Configuration
const SPREADSHEET_ID = '1LKIwjIpzn1jNSaIzzLAWLkkiODJUuKReKkw3QUT9c8A';
const BQ_PROJECT_ID = 'jv-data-warehouse';
const BQ_DATASET = 'freedom_academy_au';
const SHEET_NAME = 'CONSOLIDATED';

// GitHub configuration
const GITHUB_OWNER = 'jayr-ai';
const GITHUB_REPO = 'au-fa-dashboard';
const GITHUB_FILE_PATH = 'revenue-dashboard/data/revenue-data.json';
const GITHUB_BRANCH = 'main';

// ============================================================================
// MAIN ORCHESTRATION FUNCTION
// ============================================================================

/**
 * Main orchestration function - Run this daily via trigger
 * Creates triggers: Projects > Triggers (Clock icon) > New trigger
 *   - syncRevenueData
 *   - Time-driven
 *   - Day timer
 *   - 2 AM
 */
function syncRevenueData() {
  try {
    Logger.log('🔄 Starting revenue data sync...');
    const startTime = new Date();

    // Step 1: Read data from Sheets
    Logger.log('📄 Step 1: Reading CONSOLIDATED sheet...');
    const transactions = readConsolidatedTab();
    Logger.log(`   ✓ Read ${transactions.length} transactions`);

    // Step 2: Clear and push to BigQuery
    Logger.log('☁️  Step 2: Syncing to BigQuery...');
    truncateTable('revenue_transactions');
    Utilities.sleep(2000); // Allow streaming buffer to flush
    pushToBigQuery(transactions);
    Logger.log('   ✓ Data synced to BigQuery');

    // Step 3: Generate summary in BigQuery
    Logger.log('📊 Step 3: Generating summary...');
    generateSummary();
    Logger.log('   ✓ Summary generated');

    // Step 4: Query aggregated data from BigQuery
    Logger.log('📈 Step 4: Querying aggregated data...');
    const aggregatedData = queryAggregatedData();
    Logger.log('   ✓ Data aggregated from BigQuery');

    // Step 5: Generate complete JSON
    Logger.log('🔧 Step 5: Generating dashboard JSON...');
    const jsonData = generateCompleteJSON(transactions, aggregatedData);
    Logger.log('   ✓ JSON generated');

    // Step 6: Export to GitHub
    Logger.log('🚀 Step 6: Exporting to GitHub...');
    exportToGitHub(jsonData);
    Logger.log('   ✓ Exported to GitHub');

    // Step 7: Log sync success
    logSync('SUCCESS', transactions.length, null);

    const duration = Math.round((new Date() - startTime) / 1000);
    Logger.log(`✅ Revenue sync completed successfully (${duration}s)`);

  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    Logger.log('   Stack: ' + error.stack);
    logSync('ERROR', 0, error.toString());
    throw error;
  }
}

// ============================================================================
// STEP 1: READ FROM GOOGLE SHEETS
// ============================================================================

/**
 * Read data from CONSOLIDATED tab
 */
function readConsolidatedTab() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found`);
  }

  const range = sheet.getDataRange();
  const values = range.getValues();

  if (values.length < 1) {
    Logger.log('Warning: CONSOLIDATED sheet is empty');
    return [];
  }

  // Build header map
  const headers = values[0];
  const headerMap = {};
  headers.forEach((header, index) => {
    headerMap[header.toString().trim()] = index;
  });

  Logger.log('Headers found: ' + Object.keys(headerMap).join(', '));

  // Parse transaction rows
  const transactions = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    // Skip empty rows
    if (!row[headerMap['Date']] || !row[headerMap['Amount']]) continue;

    const date = new Date(row[headerMap['Date']]);
    const amount = parseFloat(row[headerMap['Amount']] || 0);
    if (isNaN(amount) || amount === 0) continue;

    // Determine source (payment method)
    const source = determineSource(row, headerMap);

    const transaction = {
      transaction_id: generateTransactionId(row, headerMap),
      date: Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd'),
      name: (row[headerMap['Name']] || '').toString(),
      email: (row[headerMap['Email']] || '').toString(),
      product: (row[headerMap['Product']] || '').toString(),
      amount: amount,
      closer: (row[headerMap['Closer']] || '').toString(),
      cash_category: (row[headerMap['Cash Category']] || '').toString(),
      source: source,
      note: (row[headerMap['NOTE']] || '').toString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    transactions.push(transaction);
  }

  Logger.log(`Parsed ${transactions.length} valid transactions`);
  return transactions;
}

/**
 * Determine source (Stripe, Finance, EFT) from row data
 * Priority: Mode column → infer from data
 */
function determineSource(row, headerMap) {
  // Check Mode/Source column
  if (headerMap['Mode']) {
    const mode = (row[headerMap['Mode']] || '').toString().trim();
    if (mode && ['Stripe', 'Finance', 'EFT'].includes(mode)) {
      return mode;
    }
  }

  // Check Source column
  if (headerMap['Source']) {
    const source = (row[headerMap['Source']] || '').toString().trim();
    if (source && ['Stripe', 'Finance', 'EFT'].includes(source)) {
      return source;
    }
  }

  // Infer from cash_category if it contains payment method
  if (headerMap['Cash Category']) {
    const category = (row[headerMap['Cash Category']] || '').toString().toLowerCase();
    if (category.includes('stripe')) return 'Stripe';
    if (category.includes('finance') || category.includes('payment plan')) return 'Finance';
    if (category.includes('eft')) return 'EFT';
  }

  // Default to Stripe if no source specified
  Logger.log('⚠️  Warning: Could not determine source for row, defaulting to Stripe');
  return 'Stripe';
}

/**
 * Generate unique transaction ID
 */
function generateTransactionId(row, headerMap) {
  const date = Utilities.formatDate(new Date(row[headerMap['Date']]), 'UTC', 'yyyyMMdd');
  const name = (row[headerMap['Name']] || 'unknown').toString().replace(/\s+/g, '_');
  const amount = Math.round(parseFloat(row[headerMap['Amount']] || 0) * 100);
  return `FA_${date}_${name}_${amount}`.toLowerCase().substring(0, 64);
}

// ============================================================================
// STEP 2: PUSH TO BIGQUERY
// ============================================================================

/**
 * Truncate revenue_transactions table
 */
function truncateTable(tableName) {
  const query = `DELETE FROM \`${BQ_PROJECT_ID}.${BQ_DATASET}.${tableName}\` WHERE TRUE`;
  executeQuery(query);
  Logger.log(`Truncated ${tableName}`);
}

/**
 * Push transactions to BigQuery
 */
function pushToBigQuery(transactions) {
  if (transactions.length === 0) {
    Logger.log('No transactions to push to BigQuery');
    return;
  }

  // Insert in batches of 500
  const batchSize = 500;
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    const rows = batch.map(tx => ({
      insertId: tx.transaction_id,
      json: tx
    }));

    insertRowsToBigQuery('revenue_transactions', rows);
    Logger.log(`Inserted batch ${Math.floor(i / batchSize) + 1}`);
  }

  Logger.log(`✓ All ${transactions.length} transactions inserted into BigQuery`);
}

/**
 * Insert rows into BigQuery table via API
 */
function insertRowsToBigQuery(tableName, rows) {
  if (!rows || rows.length === 0) return;

  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT_ID}/datasets/${BQ_DATASET}/tables/${tableName}/insertAll`;

  const payload = {
    rows: rows,
    skipInvalidRows: false
  };

  const options = {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);

  if (response.getResponseCode() !== 200) {
    throw new Error(`BigQuery insert failed: ${response.getContentText()}`);
  }
}

/**
 * Execute query in BigQuery
 */
function executeQuery(query) {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT_ID}/queries`;

  const payload = {
    query: query,
    useLegacySql: false,
    timeoutMs: 30000
  };

  const options = {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);

  if (response.getResponseCode() !== 200) {
    throw new Error(`BigQuery query failed: ${response.getContentText()}`);
  }

  return JSON.parse(response.getContentText());
}

// ============================================================================
// STEP 3: GENERATE SUMMARY
// ============================================================================

/**
 * Generate revenue summary in BigQuery
 */
function generateSummary() {
  // Delete old summary for today
  const deleteQuery = `DELETE FROM \`${BQ_PROJECT_ID}.${BQ_DATASET}.revenue_summary\`
    WHERE summary_date = CURRENT_DATE()`;
  executeQuery(deleteQuery);

  // Insert new summary
  const insertQuery = `
    INSERT INTO \`${BQ_PROJECT_ID}.${BQ_DATASET}.revenue_summary\`
    SELECT
      CURRENT_DATE() as summary_date,
      CAST(SUM(amount) AS NUMERIC) as total_revenue,
      CAST(SUM(CASE WHEN source = 'Stripe' THEN amount ELSE 0 END) AS NUMERIC) as stripe_revenue,
      CAST(SUM(CASE WHEN source = 'Finance' THEN amount ELSE 0 END) AS NUMERIC) as finance_revenue,
      CAST(SUM(CASE WHEN source = 'EFT' THEN amount ELSE 0 END) AS NUMERIC) as eft_revenue,
      COUNT(*) as transaction_count,
      CURRENT_TIMESTAMP() as updated_at
    FROM \`${BQ_PROJECT_ID}.${BQ_DATASET}.revenue_transactions\`
  `;

  executeQuery(insertQuery);
}

// ============================================================================
// STEP 4: QUERY AGGREGATED DATA
// ============================================================================

/**
 * Query all aggregated data needed for dashboard
 */
function queryAggregatedData() {
  // Get monthly breakdown
  const monthlyQuery = `
    WITH monthly_revenue AS (
      SELECT
        FORMAT_DATE('%b %Y', DATE_TRUNC(date, MONTH)) as month,
        EXTRACT(YEAR FROM date) as year,
        source,
        SUM(amount) as amount
      FROM \`${BQ_PROJECT_ID}.${BQ_DATASET}.revenue_transactions\`
      GROUP BY month, year, source
    )
    SELECT
      month,
      year,
      CAST(SUM(CASE WHEN source = 'Stripe' THEN amount ELSE 0 END) AS NUMERIC) as stripe,
      CAST(SUM(CASE WHEN source = 'Finance' THEN amount ELSE 0 END) AS NUMERIC) as finance,
      CAST(SUM(CASE WHEN source = 'EFT' THEN amount ELSE 0 END) AS NUMERIC) as eft,
      CAST(SUM(amount) AS NUMERIC) as total
    FROM monthly_revenue
    GROUP BY month, year
    ORDER BY year DESC,
      CASE month
        WHEN 'Jan' THEN 1 WHEN 'Feb' THEN 2 WHEN 'Mar' THEN 3 WHEN 'Apr' THEN 4
        WHEN 'May' THEN 5 WHEN 'Jun' THEN 6 WHEN 'Jul' THEN 7 WHEN 'Aug' THEN 8
        WHEN 'Sep' THEN 9 WHEN 'Oct' THEN 10 WHEN 'Nov' THEN 11 WHEN 'Dec' THEN 12
      END DESC
  `;

  const monthlyResult = executeQuery(monthlyQuery);
  const monthlyData = [];

  if (monthlyResult.rows) {
    monthlyData.push(...monthlyResult.rows.map(row => ({
      month: row.f[0].v,
      year: parseInt(row.f[1].v),
      stripe: parseFloat(row.f[2].v || 0),
      finance: parseFloat(row.f[3].v || 0),
      eft: parseFloat(row.f[4].v || 0),
      total: parseFloat(row.f[5].v || 0)
    })));
  }

  // Get product breakdown
  const productQuery = `
    SELECT
      product,
      EXTRACT(YEAR FROM date) as year,
      CAST(SUM(amount) AS NUMERIC) as total
    FROM \`${BQ_PROJECT_ID}.${BQ_DATASET}.revenue_transactions\`
    WHERE product != ''
    GROUP BY product, year
    ORDER BY year DESC, total DESC
  `;

  const productResult = executeQuery(productQuery);
  const productData = [];

  if (productResult.rows) {
    productData.push(...productResult.rows.map(row => ({
      product: row.f[0].v,
      year: parseInt(row.f[1].v),
      total: parseFloat(row.f[2].v || 0)
    })));
  }

  return {
    monthlyData: monthlyData,
    productData: productData
  };
}

// ============================================================================
// STEP 5: GENERATE COMPLETE JSON
// ============================================================================

/**
 * Generate complete JSON for dashboard
 */
function generateCompleteJSON(transactions, aggregatedData) {
  // Get latest summary
  const summaryQuery = `
    SELECT
      total_revenue,
      stripe_revenue,
      finance_revenue,
      eft_revenue,
      transaction_count
    FROM \`${BQ_PROJECT_ID}.${BQ_DATASET}.revenue_summary\`
    ORDER BY summary_date DESC
    LIMIT 1
  `;

  const summaryResult = executeQuery(summaryQuery);
  const summary = {
    totalRevenue: 0,
    stripeRevenue: 0,
    financeRevenue: 0,
    eftRevenue: 0
  };

  if (summaryResult.rows && summaryResult.rows.length > 0) {
    const row = summaryResult.rows[0].f;
    summary.totalRevenue = parseFloat(row[0].v || 0);
    summary.stripeRevenue = parseFloat(row[1].v || 0);
    summary.financeRevenue = parseFloat(row[2].v || 0);
    summary.eftRevenue = parseFloat(row[3].v || 0);
  }

  // Build year comparison from monthly data
  const yearComparison = buildYearComparison(aggregatedData.monthlyData);

  // Build product data with year columns
  const productData = buildProductData(aggregatedData.productData);

  // Build the complete JSON
  const jsonData = {
    lastUpdated: new Date().toISOString(),
    summary: summary,
    yearComparison: yearComparison,
    monthlyData: aggregatedData.monthlyData,
    productData: productData,
    transactionData: transactions
  };

  Logger.log('JSON structure created with ' + aggregatedData.monthlyData.length + ' monthly records and ' + transactions.length + ' transactions');
  return jsonData;
}

/**
 * Build year comparison data for table
 */
function buildYearComparison(monthlyData) {
  const yearComparison = [];

  // Group by year and sum
  const byYear = {};
  monthlyData.forEach(month => {
    if (!byYear[month.year]) {
      byYear[month.year] = { 2025: 0, 2026: 0, 2027: 0, total: 0 };
    }
    byYear[month.year][month.year] = (byYear[month.year][month.year] || 0) + month.total;
    byYear[month.year].total += month.total;
  });

  // Create rows for each mode/category
  const modes = ['Online', 'Offline', 'Combined'];
  modes.forEach(mode => {
    yearComparison.push({
      mode: mode,
      2025: byYear[2025]?.[2025] || 0,
      2026: byYear[2026]?.[2026] || 0,
      2027: byYear[2027]?.[2027] || 0,
      total: (byYear[2025]?.[2025] || 0) + (byYear[2026]?.[2026] || 0) + (byYear[2027]?.[2027] || 0)
    });
  });

  return yearComparison;
}

/**
 * Build product data with year columns
 */
function buildProductData(productData) {
  const productMap = {};

  productData.forEach(item => {
    if (!productMap[item.product]) {
      productMap[item.product] = { product: item.product, 2025: 0, 2026: 0, total: 0 };
    }
    productMap[item.product][item.year] = item.total;
    productMap[item.product].total += item.total;
  });

  return Object.values(productMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10); // Top 10 products
}

// ============================================================================
// STEP 6: EXPORT TO GITHUB
// ============================================================================

/**
 * Export JSON data to GitHub repository
 */
function exportToGitHub(jsonData) {
  try {
    const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!token) {
      Logger.log('⚠️  Warning: GITHUB_TOKEN not configured in Script Properties');
      Logger.log('   To set it up:');
      Logger.log('   1. Generate token at https://github.com/settings/tokens');
      Logger.log('   2. Go to Project Settings (gear icon)');
      Logger.log('   3. Add GITHUB_TOKEN property with your token');
      return;
    }

    const currentSha = getFileSha(GITHUB_OWNER, GITHUB_REPO, GITHUB_FILE_PATH, token);
    const commitMessage = `chore: update revenue data ${new Date().toISOString().split('T')[0]}`;
    const encodedContent = Utilities.base64Encode(JSON.stringify(jsonData, null, 2));

    const payload = {
      message: commitMessage,
      content: encodedContent,
      branch: GITHUB_BRANCH
    };

    if (currentSha) {
      payload.sha = currentSha;
    }

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;

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
    const responseCode = response.getResponseCode();

    if (responseCode === 200 || responseCode === 201) {
      Logger.log('✅ JSON exported to GitHub successfully');
    } else {
      Logger.log('❌ GitHub export failed (code ' + responseCode + '): ' + response.getContentText());
    }
  } catch (error) {
    Logger.log('❌ Error exporting to GitHub: ' + error.toString());
  }
}

/**
 * Get file SHA from GitHub for update
 */
function getFileSha(owner, repo, path, token) {
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
      const result = JSON.parse(response.getContentText());
      return result.sha;
    }
    return null;
  } catch (error) {
    Logger.log('Error getting file SHA: ' + error.toString());
    return null;
  }
}

// ============================================================================
// STEP 7: LOGGING
// ============================================================================

/**
 * Log sync status to BigQuery
 */
function logSync(status, transactionCount, errorMessage) {
  try {
    const row = {
      insertId: 'sync_' + Utilities.getUuid(),
      json: {
        sync_date: new Date().toISOString(),
        transactions_synced: transactionCount,
        status: status,
        error_message: errorMessage || ''
      }
    };

    insertRowsToBigQuery('revenue_sync_log', [row]);
  } catch (error) {
    Logger.log('Error logging sync: ' + error.toString());
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Test function - Run this to test the sync without scheduling
 */
function testSync() {
  Logger.log('🧪 Running test sync...');
  syncRevenueData();
}

/**
 * Set up GitHub token in Script Properties
 * Run this once with your GitHub token
 */
function setupGitHubToken(token) {
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', token);
  Logger.log('✅ GitHub token saved to Script Properties');
}

/**
 * View recent sync logs
 */
function viewSyncLogs() {
  const query = `
    SELECT
      sync_date,
      transactions_synced,
      status,
      error_message
    FROM \`${BQ_PROJECT_ID}.${BQ_DATASET}.revenue_sync_log\`
    ORDER BY sync_date DESC
    LIMIT 10
  `;

  const result = executeQuery(query);
  Logger.log('Recent sync logs:');
  if (result.rows) {
    result.rows.forEach(row => {
      Logger.log(`  ${row.f[0].v} | ${row.f[2].v} | ${row.f[1].v} tx | ${row.f[3].v || 'OK'}`);
    });
  }
}
