// Global chart instances
let revenueTrendChart = null;
let sourceBreakdownChart = null;
let monthlyCashChart = null;
let paymentChannelChart = null;

// Global data
let originalData = null;
let filteredData = null;

// Brand color scheme
const colors = {
    stripe: '#ff9d56',
    finance: '#5b8def',
    eft: '#9b59b6',
    accent: '#B9DACD',
    ink: '#EDEDEE',
    muted: '#8A9887',
    surface: '#172114',
    raised: '#1C2A24'
};

// Load and render dashboard
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Update timestamp to Sydney time
        updateSyncTimestamp();

        originalData = await loadData();
        filteredData = JSON.parse(JSON.stringify(originalData));
        renderDashboard(filteredData);
        setupDateFilters();
        setupCollapsibleSection();
        renderSalesBreakdown(originalData.transactionData || []);
    } catch (error) {
        console.error('Error loading dashboard:', error);
        document.getElementById('loadingMessage').textContent = 'Error loading dashboard data. Please try again.';
    }
});

// Convert UTC timestamp to Sydney time
function updateSyncTimestamp() {
    const lastSyncEl = document.getElementById('lastSync');
    const now = new Date();
    const sydneyTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));

    const year = sydneyTime.getFullYear();
    const month = String(sydneyTime.getMonth() + 1).padStart(2, '0');
    const day = String(sydneyTime.getDate()).padStart(2, '0');
    const hours = String(sydneyTime.getHours()).padStart(2, '0');
    const minutes = String(sydneyTime.getMinutes()).padStart(2, '0');
    const seconds = String(sydneyTime.getSeconds()).padStart(2, '0');

    lastSyncEl.textContent = `synced from the source sheet at ${year}-${month}-${day} ${hours}:${minutes}:${seconds} AEST`;
}

// Setup date filter event listeners
function setupDateFilters() {
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    const allTimeBtn = document.getElementById('allTimeBtn');
    const ytdBtn = document.getElementById('ytdBtn');
    const customBtn = document.getElementById('customBtn');
    const dateRangeSelector = document.getElementById('dateRangeSelector');

    // Set default dates: Jan 1 of current year to today
    const today = new Date();
    const currentYear = today.getFullYear();
    const janFirst = new Date(currentYear, 0, 1);

    dateFrom.value = formatDateForInput(janFirst);
    dateTo.value = formatDateForInput(today);

    // Period button handlers
    allTimeBtn.addEventListener('click', function() {
        dateRangeSelector.style.display = 'none';
        setActiveButton(allTimeBtn);
        filterByAllTime();
    });

    ytdBtn.addEventListener('click', function() {
        dateRangeSelector.style.display = 'none';
        setActiveButton(ytdBtn);
        filterByYTD();
    });

    customBtn.addEventListener('click', function() {
        dateRangeSelector.style.display = 'flex';
        setActiveButton(customBtn);
        applyFilters();
    });

    // Date input listeners (both 'change' and 'input' for better compatibility)
    dateFrom.addEventListener('change', applyFilters);
    dateTo.addEventListener('change', applyFilters);
    dateFrom.addEventListener('input', applyFilters);
    dateTo.addEventListener('input', applyFilters);

    // Apply filters on initial load
    applyFilters();
}

// Set active period button
function setActiveButton(btn) {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// Filter all time data
function filterByAllTime() {
    filteredData = JSON.parse(JSON.stringify(originalData));
    renderDashboard(filteredData);
}

// Filter YTD (Year To Date)
function filterByYTD() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const janFirst = new Date(currentYear, 0, 1);

    filteredData = JSON.parse(JSON.stringify(originalData));
    filterByDateRange(janFirst, today);
    renderDashboard(filteredData);
}

// Format date for HTML date input (YYYY-MM-DD)
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Parse date input (YYYY-MM-DD) to local date
function parseDateInput(dateString) {
    const [year, month, day] = dateString.split('-');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

// Apply date filters
function applyFilters() {
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');

    filteredData = JSON.parse(JSON.stringify(originalData));
    let filteredTransactions = [...(originalData.transactionData || [])];

    if (dateFrom.value && dateTo.value) {
        const fromDate = parseDateInput(dateFrom.value);
        const toDate = parseDateInput(dateTo.value);
        // Extend toDate to include entire end date
        toDate.setHours(23, 59, 59, 999);
        filterByDateRange(fromDate, toDate);

        // Also filter transactions by date range
        filteredTransactions = filteredTransactions.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate >= fromDate && txDate <= toDate;
        });
    }

    renderDashboard(filteredData);
    renderSalesBreakdown(filteredTransactions);
}

// Filter data by date range
function filterByDateRange(fromDate, toDate) {
    filteredData.monthlyData = filteredData.monthlyData.filter(item => {
        // Parse "MMM YYYY" format (e.g., "Jul 2026")
        const [monthStr, yearStr] = item.month.split(' ');
        const months = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
        const itemMonth = months[monthStr];
        const itemYear = parseInt(yearStr);

        // Create date range for the entire month
        const monthStart = new Date(itemYear, itemMonth, 1);
        const monthEnd = new Date(itemYear, itemMonth + 1, 0, 23, 59, 59, 999);

        // Check if month overlaps with selected date range
        return monthStart <= toDate && monthEnd >= fromDate;
    });

    // Recalculate summary from filtered monthly data
    filteredData.summary = calculateSummary(filteredData.monthlyData);
}

// Filter data by year and month
function filterByYearMonth(year, month) {
    filteredData.monthlyData = filteredData.monthlyData.filter(item => {
        const [monthStr, yearStr] = item.month.split(' ');
        const itemYear = parseInt(yearStr);
        const itemMonth = getMonthNumber(monthStr);

        if (year !== 'all' && itemYear !== year) return false;
        if (month !== 'all' && itemMonth !== month) return false;
        return true;
    });

    // Recalculate summary based on filtered data
    const summary = calculateSummary(filteredData.monthlyData);
    filteredData.summary = summary;
}

// Get month number from month name
function getMonthNumber(monthStr) {
    const months = { 'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
                    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12 };
    return months[monthStr] || 0;
}


// Calculate summary from monthly data
function calculateSummary(monthlyData) {
    const totals = {
        totalRevenue: 0,
        stripeRevenue: 0,
        financeRevenue: 0,
        eftRevenue: 0
    };

    monthlyData.forEach(month => {
        totals.totalRevenue += month.total || 0;
        totals.stripeRevenue += month.stripe || 0;
        totals.financeRevenue += month.finance || 0;
        totals.eftRevenue += month.eft || 0;
    });

    return totals;
}

// Load JSON data with aggressive cache busting
async function loadData() {
    const response = await fetch('data/revenue-data.json?t=' + new Date().getTime(), {
        method: 'GET',
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    });
    if (!response.ok) throw new Error('Failed to load data');
    const data = await response.json();

    // SORT monthly data in ascending order (oldest first) RIGHT WHEN LOADING
    if (data.monthlyData && Array.isArray(data.monthlyData)) {
        data.monthlyData = data.monthlyData.reverse();
    }

    return data;
}

// Main render function
function renderDashboard(data) {
    document.getElementById('loadingMessage').style.display = 'none';

    // Generate missing data from monthlyData if needed
    if (!data.yearComparison || data.yearComparison.length === 0) {
        data.yearComparison = generateYearComparison(data.monthlyData);
    }
    if (!data.productData || data.productData.length === 0) {
        data.productData = generateProductData(data.monthlyData);
    }

    renderInsights(data);
    renderKPIs(data.summary);
    renderYearComparison(data.yearComparison);
    renderRevenueTrend(data.monthlyData);
    renderSourceBreakdown(data.summary);
    renderMonthlyCash(data.monthlyData);
    renderPaymentChannel(data.monthlyData);
    renderProductData(data.productData);
}

// Generate year comparison from monthly data
function generateYearComparison(monthlyData) {
    const yearTotals = {};

    monthlyData.forEach(month => {
        const year = month.year;
        if (!yearTotals[year]) {
            yearTotals[year] = 0;
        }
        yearTotals[year] += month.total || 0;
    });

    // Create comparison row
    const years = Object.keys(yearTotals).sort();
    const comparison = {
        mode: 'Total Revenue',
        2025: yearTotals[2025] || 0,
        2026: yearTotals[2026] || 0,
        2027: yearTotals[2027] || 0,
        total: Object.values(yearTotals).reduce((a, b) => a + b, 0)
    };

    return [comparison];
}

// Generate product data from monthly data (placeholder)
function generateProductData(monthlyData) {
    // Return empty for now - can be enhanced with BigQuery data later
    return [];
}

// Generate and render executive insights
function renderInsights(data) {
    const insights = generateInsights(data);
    const insightsHtml = insights.map(insight => `
        <div class="insight-item">
            <span class="insight-icon">${insight.icon}</span>
            <span class="insight-text">${insight.text}</span>
        </div>
    `).join('');

    document.getElementById('insightsContent').innerHTML = insightsHtml;
}

// Generate executive insights from data
function generateInsights(data) {
    const insights = [];
    const summary = data.summary;
    const monthlyData = data.monthlyData;

    // Insight 1: Total Revenue
    insights.push({
        icon: '💰',
        text: `<strong>Total Revenue: ${formatCurrency(summary.totalRevenue)}</strong> from ${monthlyData.length} month(s) of data`
    });

    // Insight 2: Top performing channel
    const channels = [
        { name: 'Finance', value: summary.financeRevenue, icon: '🏦' },
        { name: 'Stripe', value: summary.stripeRevenue, icon: '💳' },
        { name: 'EFT', value: summary.eftRevenue, icon: '📤' }
    ];
    const topChannel = channels.reduce((a, b) => a.value > b.value ? a : b);
    const percentage = ((topChannel.value / summary.totalRevenue) * 100).toFixed(1);
    insights.push({
        icon: topChannel.icon,
        text: `<strong>${topChannel.name}</strong> leads with ${formatCurrency(topChannel.value)} (${percentage}% of total revenue)`
    });

    // Insight 3: Month-over-month growth
    if (monthlyData.length > 1) {
        const lastMonth = monthlyData[monthlyData.length - 1];
        const prevMonth = monthlyData[monthlyData.length - 2];
        const growth = ((lastMonth.total - prevMonth.total) / prevMonth.total * 100).toFixed(1);
        const trend = growth > 0 ? '📈' : '📉';
        insights.push({
            icon: trend,
            text: `<strong>Latest period</strong> shows ${Math.abs(growth)}% ${growth > 0 ? 'growth' : 'decline'} vs. previous month`
        });
    }

    // Insight 4: Average monthly revenue
    if (monthlyData.length > 0) {
        const avgMonthly = (summary.totalRevenue / monthlyData.length).toFixed(0);
        insights.push({
            icon: '📊',
            text: `<strong>Average monthly revenue:</strong> ${formatCurrency(avgMonthly)}`
        });
    } else {
        insights.push({
            icon: '📊',
            text: `<strong>Data status:</strong> Awaiting monthly revenue data from BigQuery`
        });
    }

    return insights;
}

// Render KPI Cards
function renderKPIs(summary) {
    document.getElementById('totalRevenue').textContent = formatCurrency(summary.totalRevenue);
    document.getElementById('stripeRevenue').textContent = formatCurrency(summary.stripeRevenue);
    document.getElementById('financeRevenue').textContent = formatCurrency(summary.financeRevenue);
    document.getElementById('eftRevenue').textContent = formatCurrency(summary.eftRevenue);
}

// Render Year Comparison Table
function renderYearComparison(data) {
    const tbody = document.getElementById('yearComparisonBody');
    tbody.innerHTML = '';

    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${row.mode}</strong></td>
            <td>${formatCurrency(row['2025'])}</td>
            <td>${formatCurrency(row['2026'])}</td>
            <td>${formatCurrency(row['2027'])}</td>
            <td><strong>${formatCurrency(row.total)}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

// Sort monthly data chronologically (oldest to newest)
function sortMonthlyData(data) {
    const months = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };

    return [...data].sort((a, b) => {
        const [monthA, yearA] = a.month.split(' ');
        const [monthB, yearB] = b.month.split(' ');

        const yearDiff = parseInt(yearA) - parseInt(yearB);
        if (yearDiff !== 0) return yearDiff;

        return months[monthA] - months[monthB];
    });
}

// Render Revenue Trend (Line Chart)
function renderRevenueTrend(data) {
    const ctx = document.getElementById('revenueTrendChart');

    if (revenueTrendChart) {
        revenueTrendChart.destroy();
    }

    // Sort data chronologically before rendering
    const sortedData = sortMonthlyData(data);

    revenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedData.map(d => d.month),
            datasets: [{
                label: 'Total Revenue',
                data: sortedData.map(d => d.total),
                borderColor: colors.accent,
                backgroundColor: 'rgba(185, 218, 205, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: colors.accent,
                pointBorderColor: colors.surface,
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: colors.ink,
                        font: { size: 12, weight: '600' }
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        color: colors.muted,
                        callback: function(value) {
                            return '$' + (value / 1000).toFixed(0) + 'k';
                        }
                    },
                    grid: {
                        color: 'rgba(185, 218, 205, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: colors.muted
                    },
                    grid: {
                        color: 'rgba(185, 218, 205, 0.05)'
                    }
                }
            }
        }
    });
}

// Render Source Breakdown (Pie Chart)
function renderSourceBreakdown(summary) {
    const ctx = document.getElementById('sourceBreakdownChart');

    if (sourceBreakdownChart) {
        sourceBreakdownChart.destroy();
    }

    const total = summary.totalRevenue;
    const stripePercent = (summary.stripeRevenue / total * 100).toFixed(1);
    const financePercent = (summary.financeRevenue / total * 100).toFixed(1);
    const eftPercent = (summary.eftRevenue / total * 100).toFixed(1);

    sourceBreakdownChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [`Stripe (${stripePercent}%)`, `Finance (${financePercent}%)`, `EFT (${eftPercent}%)`],
            datasets: [{
                data: [summary.stripeRevenue, summary.financeRevenue, summary.eftRevenue],
                backgroundColor: [colors.stripe, colors.finance, colors.eft],
                borderColor: colors.surface,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: colors.ink,
                        font: { size: 12, weight: '600' },
                        padding: 15
                    }
                }
            }
        }
    });
}

// Render Monthly Cash Chart
function renderMonthlyCash(data) {
    const ctx = document.getElementById('monthlyCashChart');

    if (monthlyCashChart) {
        monthlyCashChart.destroy();
    }

    // Sort data chronologically before rendering
    const sortedData = sortMonthlyData(data);

    monthlyCashChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedData.map(d => d.month),
            datasets: [
                {
                    label: 'Stripe',
                    data: sortedData.map(d => d.stripe),
                    backgroundColor: colors.stripe,
                    borderRadius: 6
                },
                {
                    label: 'Finance',
                    data: sortedData.map(d => d.finance),
                    backgroundColor: colors.finance,
                    borderRadius: 6
                },
                {
                    label: 'EFT',
                    data: sortedData.map(d => d.eft),
                    backgroundColor: colors.eft,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: colors.ink,
                        font: { size: 12, weight: '600' }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        color: colors.muted
                    },
                    grid: {
                        color: 'rgba(185, 218, 205, 0.05)'
                    }
                },
                y: {
                    stacked: true,
                    ticks: {
                        color: colors.muted,
                        callback: function(value) {
                            return '$' + (value / 1000).toFixed(0) + 'k';
                        }
                    },
                    grid: {
                        color: 'rgba(185, 218, 205, 0.1)'
                    }
                }
            }
        }
    });
}

// Render Payment Channel Chart
function renderPaymentChannel(data) {
    const ctx = document.getElementById('paymentChannelChart');

    if (paymentChannelChart) {
        paymentChannelChart.destroy();
    }

    // Sort data chronologically before rendering
    const sortedData = sortMonthlyData(data);

    paymentChannelChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedData.map(d => d.month),
            datasets: [
                {
                    label: 'Finance',
                    data: sortedData.map(d => d.finance),
                    borderColor: colors.finance,
                    backgroundColor: 'rgba(91, 141, 239, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Stripe',
                    data: sortedData.map(d => d.stripe),
                    borderColor: colors.stripe,
                    backgroundColor: 'rgba(255, 157, 86, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'EFT',
                    data: sortedData.map(d => d.eft),
                    borderColor: colors.eft,
                    backgroundColor: 'rgba(155, 89, 182, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: colors.ink,
                        font: { size: 12, weight: '600' }
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        color: colors.muted,
                        callback: function(value) {
                            return '$' + (value / 1000).toFixed(0) + 'k';
                        }
                    },
                    grid: {
                        color: 'rgba(185, 218, 205, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: colors.muted
                    },
                    grid: {
                        color: 'rgba(185, 218, 205, 0.05)'
                    }
                }
            }
        }
    });
}

// Render Product Data Table
function renderProductData(data) {
    const tbody = document.getElementById('productTableBody');
    tbody.innerHTML = '';

    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${row.product}</strong></td>
            <td>${formatCurrency(row['2025'])}</td>
            <td>${formatCurrency(row['2026'])}</td>
            <td><strong>${formatCurrency(row.total)}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

// Setup collapsible section
function setupCollapsibleSection() {
    const toggle = document.getElementById('breakdownToggle');
    const content = document.getElementById('breakdownContent');

    if (toggle && content) {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('open');
            if (content.style.display === 'none') {
                content.style.display = 'block';
            } else {
                content.style.display = 'none';
            }
        });
    }
}

// Render sales breakdown table
function renderSalesBreakdown(transactions) {
    const tbody = document.getElementById('breakdownTableBody');

    if (!tbody) return;

    tbody.innerHTML = '';

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--muted);">Transaction data not available yet</td></tr>';
        return;
    }

    // Sort by date (newest first)
    const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(tx => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(tx.date)}</td>
            <td>${tx.name || '-'}</td>
            <td style="font-size: 11px;">${tx.email || '-'}</td>
            <td>${tx.product || '-'}</td>
            <td>${tx.closer || '-'}</td>
            <td><span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${getModeColor(tx.source)}">${tx.source}</span></td>
            <td style="text-align: right; font-weight: 600;">${formatCurrency(tx.amount)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Get color for payment mode
function getModeColor(mode) {
    switch(mode) {
        case 'Stripe': return 'rgba(255, 157, 86, 0.2)';
        case 'Finance': return 'rgba(91, 141, 239, 0.2)';
        case 'EFT': return 'rgba(155, 89, 182, 0.2)';
        default: return 'rgba(185, 218, 205, 0.1)';
    }
}

// Utility Functions
function formatCurrency(value) {
    if (value === 0 || value === null || value === undefined) return '$0';
    return '$' + value.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
