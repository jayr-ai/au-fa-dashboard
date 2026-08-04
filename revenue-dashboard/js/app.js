// Global chart instances
let revenueTrendChart = null;
let sourceBreakdownChart = null;
let monthlyCashChart = null;
let paymentChannelChart = null;

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
        const data = await loadData();
        renderDashboard(data);
    } catch (error) {
        console.error('Error loading dashboard:', error);
        document.getElementById('loadingMessage').textContent = 'Error loading dashboard data. Please try again.';
    }
});

// Load JSON data
async function loadData() {
    const response = await fetch('data/revenue-data.json');
    if (!response.ok) throw new Error('Failed to load data');
    return await response.json();
}

// Main render function
function renderDashboard(data) {
    document.getElementById('loadingMessage').style.display = 'none';

    renderKPIs(data.summary);
    renderYearComparison(data.yearComparison);
    renderRevenueTrend(data.monthlyData);
    renderSourceBreakdown(data.summary);
    renderMonthlyCash(data.monthlyData);
    renderPaymentChannel(data.monthlyData);
    renderProductData(data.productData);
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
