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
        originalData = await loadData();
        filteredData = JSON.parse(JSON.stringify(originalData));
        renderDashboard(filteredData);
        setupDateFilters();
    } catch (error) {
        console.error('Error loading dashboard:', error);
        document.getElementById('loadingMessage').textContent = 'Error loading dashboard data. Please try again.';
    }
});

// Setup date filter event listeners
function setupDateFilters() {
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');
    const customToggle = document.getElementById('customToggle');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    const customDatesGroup = document.getElementById('customDatesGroup');

    yearSelect.addEventListener('change', applyFilters);
    monthSelect.addEventListener('change', applyFilters);

    customToggle.addEventListener('change', (e) => {
        customDatesGroup.style.display = e.target.checked ? 'flex' : 'none';
        if (e.target.checked) {
            yearSelect.disabled = true;
            monthSelect.disabled = true;
        } else {
            yearSelect.disabled = false;
            monthSelect.disabled = false;
        }
        applyFilters();
    });

    dateFrom.addEventListener('change', applyFilters);
    dateTo.addEventListener('change', applyFilters);
}

// Apply date filters
function applyFilters() {
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');
    const customToggle = document.getElementById('customToggle');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');

    filteredData = JSON.parse(JSON.stringify(originalData));

    if (customToggle.checked && dateFrom.value && dateTo.value) {
        const fromDate = new Date(dateFrom.value);
        const toDate = new Date(dateTo.value);
        filterByDateRange(fromDate, toDate);
    } else if (yearSelect.value !== 'all' || monthSelect.value !== 'all') {
        filterByYearMonth(parseInt(yearSelect.value), parseInt(monthSelect.value));
    }

    renderDashboard(filteredData);
}

// Filter data by date range
function filterByDateRange(fromDate, toDate) {
    filteredData.monthlyData = filteredData.monthlyData.filter(item => {
        const itemDate = new Date(item.month);
        return itemDate >= fromDate && itemDate <= toDate;
    });
}

// Filter data by year and month
function filterByYearMonth(year, month) {
    filteredData.monthlyData = filteredData.monthlyData.filter(item => {
        const [monthStr, yearStr] = item.month.split(' ');
        const itemYear = parseInt(yearStr);
        const itemMonth = getMonthNumber(monthStr);

        if (!isNaN(year) && year !== 'all' && itemYear !== year) return false;
        if (!isNaN(month) && month !== 'all' && itemMonth !== month) return false;
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

// Load JSON data
async function loadData() {
    const response = await fetch('data/revenue-data.json');
    if (!response.ok) throw new Error('Failed to load data');
    return await response.json();
}

// Main render function
function renderDashboard(data) {
    document.getElementById('loadingMessage').style.display = 'none';

    renderInsights(data);
    renderKPIs(data.summary);
    renderYearComparison(data.yearComparison);
    renderRevenueTrend(data.monthlyData);
    renderSourceBreakdown(data.summary);
    renderMonthlyCash(data.monthlyData);
    renderPaymentChannel(data.monthlyData);
    renderProductData(data.productData);
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

// Render Revenue Trend (Line Chart)
function renderRevenueTrend(data) {
    const ctx = document.getElementById('revenueTrendChart');

    if (revenueTrendChart) {
        revenueTrendChart.destroy();
    }

    revenueTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.month),
            datasets: [{
                label: 'Total Revenue',
                data: data.map(d => d.total),
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

    monthlyCashChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.month),
            datasets: [
                {
                    label: 'Stripe',
                    data: data.map(d => d.stripe),
                    backgroundColor: colors.stripe,
                    borderRadius: 6
                },
                {
                    label: 'Finance',
                    data: data.map(d => d.finance),
                    backgroundColor: colors.finance,
                    borderRadius: 6
                },
                {
                    label: 'EFT',
                    data: data.map(d => d.eft),
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

    paymentChannelChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.month),
            datasets: [
                {
                    label: 'Finance',
                    data: data.map(d => d.finance),
                    borderColor: colors.finance,
                    backgroundColor: 'rgba(91, 141, 239, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Stripe',
                    data: data.map(d => d.stripe),
                    borderColor: colors.stripe,
                    backgroundColor: 'rgba(255, 157, 86, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'EFT',
                    data: data.map(d => d.eft),
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
