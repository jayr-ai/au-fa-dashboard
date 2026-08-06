/**
 * Freedom Academy Revenue Dashboard - Simple Pipeline
 * Reads from Google Sheets → Generates JSON → Exports to GitHub
 * NO BigQuery API calls needed - pure JavaScript aggregation
 */

const SPREADSHEET_ID = '1LKIwjIpzn1jNSaIzzLAWLkkiODJUuKReKkw3QUT9c8A';
const SHEET_NAME = 'CONSOLIDATED';

// Main sync function - Run daily via trigger
function syncRevenueData() {
  try {
    Logger.log('🔄 Starting revenue sync...');

    // Step 1: Read transactions from Sheet
    Logger.log('📄 Reading CONSOLIDATED sheet...');
    const transactions = readConsolidatedTab();
    Logger.log(`   ✓ Read ${transactions.length} transactions`);

    // Step 2: Generate JSON with aggregations
    Logger.log('🔧 Generating JSON...');
    const jsonData = generateCompleteJSON(transactions);
    Logger.log('   ✓ JSON generated');

    // Step 3: Export to GitHub
    Logger.log('🚀 Exporting to GitHub...');
    exportToGitHub(jsonData);
    Logger.log('   ✓ Exported');

    Logger.log('✅ Revenue sync completed successfully!');

  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    throw error;
  }
}

/**
 * Read transactions from CONSOLIDATED sheet
 */
function readConsolidatedTab() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found`);
  }

  const range = sheet.getDataRange();
  const values = range.getValues();

  if (values.length < 2) {
    Logger.log('Warning: Sheet is empty or has only headers');
    return [];
  }

  // Build header map
  const headers = values[0];
  const headerMap = {};
  headers.forEach((header, index) => {
    headerMap[header.toString().trim()] = index;
  });

  Logger.log('Headers: ' + Object.keys(headerMap).join(', '));

  // Parse transactions
  const transactions = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    // Skip empty rows
    if (!row[headerMap['Date']] || !row[headerMap['Amount']]) continue;

    const date = new Date(row[headerMap['Date']]);
    const amount = parseFloat(row[headerMap['Amount']] || 0);

    if (isNaN(amount) || amount === 0) continue;

    const source = determineSource(row, headerMap);

    transactions.push({
      date: Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd'),
      month: Utilities.formatDate(date, 'UTC', 'MMM yyyy'),
      year: date.getFullYear(),
      amount: amount,
      source: source,
      product: (row[headerMap['Product']] || '').toString(),
      name: (row[headerMap['Name']] || '').toString()
    });
  }

  Logger.log(`Parsed ${transactions.length} valid transactions`);
  return transactions;
}

/**
 * Determine payment source (Stripe, Finance, EFT)
 */
function determineSource(row, headerMap) {
  // Check Mode column
  if (headerMap['Mode']) {
    const mode = (row[headerMap['Mode']] || '').toString().trim();
    if (['Stripe', 'Finance', 'EFT'].includes(mode)) {
      return mode;
    }
  }

  // Check Source column
  if (headerMap['Source']) {
    const source = (row[headerMap['Source']] || '').toString().trim();
    if (['Stripe', 'Finance', 'EFT'].includes(source)) {
      return source;
    }
  }

  // Default to Stripe
  return 'Stripe';
}

/**
 * Generate complete JSON for dashboard
 */
function generateCompleteJSON(transactions) {
  // Build summary
  const summary = {
    totalRevenue: 0,
    stripeRevenue: 0,
    financeRevenue: 0,
    eftRevenue: 0
  };

  // Build monthly data
  const monthlyMap = {};
  const productMap = {};

  transactions.forEach(tx => {
    // Summary totals
    summary.totalRevenue += tx.amount;
    if (tx.source === 'Stripe') summary.stripeRevenue += tx.amount;
    if (tx.source === 'Finance') summary.financeRevenue += tx.amount;
    if (tx.source === 'EFT') summary.eftRevenue += tx.amount;

    // Monthly breakdown
    if (!monthlyMap[tx.month]) {
      monthlyMap[tx.month] = {
        month: tx.month,
        year: tx.year,
        total: 0,
        stripe: 0,
        finance: 0,
        eft: 0
      };
    }
    monthlyMap[tx.month].total += tx.amount;
    if (tx.source === 'Stripe') monthlyMap[tx.month].stripe += tx.amount;
    if (tx.source === 'Finance') monthlyMap[tx.month].finance += tx.amount;
    if (tx.source === 'EFT') monthlyMap[tx.month].eft += tx.amount;

    // Product breakdown
    if (tx.product) {
      if (!productMap[tx.product]) {
        productMap[tx.product] = {
          product: tx.product,
          2025: 0,
          2026: 0,
          total: 0
        };
      }
      productMap[tx.product][tx.year] = (productMap[tx.product][tx.year] || 0) + tx.amount;
      productMap[tx.product].total += tx.amount;
    }
  });

  // Sort monthly data by date (newest first)
  const monthlyData = Object.values(monthlyMap)
    .sort((a, b) => new Date(b.month) - new Date(a.month));

  // Sort product data by total revenue
  const productData = Object.values(productMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10); // Top 10 products

  // Build year comparison
  const yearComparison = [
    {
      mode: 'Online',
      2025: calculateYearTotal(transactions, 2025),
      2026: calculateYearTotal(transactions, 2026),
      2027: 0,
      total: calculateYearTotal(transactions, 2025) + calculateYearTotal(transactions, 2026)
    }
  ];

  return {
    lastUpdated: new Date().toISOString(),
    summary: summary,
    yearComparison: yearComparison,
    monthlyData: monthlyData,
    productData: productData,
    transactionData: transactions  // Include all transactions for sales breakdown
  };
}

/**
 * Calculate total revenue for a year
 */
function calculateYearTotal(transactions, year) {
  return transactions
    .filter(tx => tx.year === year)
    .reduce((sum, tx) => sum + tx.amount, 0);
}

/**
 * Export JSON to GitHub
 */
function exportToGitHub(jsonData) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');

  if (!token) {
    Logger.log('⚠️  GITHUB_TOKEN not set. Skipping GitHub export.');
    Logger.log('   To set it: setupGitHubToken("your_token_here")');
    return;
  }

  const repoOwner = 'jayr-ai';
  const repoName = 'au-fa-dashboard';
  const filePath = 'revenue-dashboard/data/revenue-data.json';
  const branch = 'main';

  try {
    const currentSha = getFileSha(repoOwner, repoName, filePath, token);
    const commitMessage = `chore: update revenue data ${new Date().toISOString().split('T')[0]}`;
    const encodedContent = Utilities.base64Encode(JSON.stringify(jsonData, null, 2));

    const payload = {
      message: commitMessage,
      content: encodedContent,
      branch: branch
    };

    if (currentSha) {
      payload.sha = currentSha;
    }

    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;
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
      return JSON.parse(response.getContentText()).sha;
    }
    return null;
  } catch (error) {
    Logger.log('Error getting file SHA: ' + error.toString());
    return null;
  }
}

/**
 * Setup GitHub token in Script Properties
 */
function setupGitHubToken(token) {
  PropertiesService.getScriptProperties().setProperty('GITHUB_TOKEN', token);
  Logger.log('✅ GitHub token saved');
}

/**
 * Test the sync
 */
function testSync() {
  Logger.log('🧪 Running test sync...');
  syncRevenueData();
}
