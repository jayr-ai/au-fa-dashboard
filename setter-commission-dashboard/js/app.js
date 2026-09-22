// Global chart instances
let commissionChart = null;
let setterChart = null;

// Global data
let allTransactions = [];

// Color scheme
const colors = {
    primary: '#10b981',
    primaryDark: '#059669',
    accent: '#fbbf24',
    surface: '#1f2937',
    text: '#f3f4f6',
    textSecondary: '#9ca3af'
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    setupRefreshButton();
    await refreshData();
});

// Setup refresh button
function setupRefreshButton() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('loading');
            await refreshData();
            refreshBtn.classList.remove('loading');
        });
    }
}

// Refresh data function
async function refreshData() {
    try {
        const loadingMsg = document.getElementById('loadingMessage');
        if (loadingMsg) loadingMsg.style.display = 'block';

        // Fetch latest data with cache-busting
        const response = await fetch('data/setter-commission-data.json?t=' + new Date().getTime(), {
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
        allTransactions = data.transactions || [];

        // Update all sections
        updateKPIs();
        updateCharts();
        updateLeaderboard();

        if (loadingMsg) loadingMsg.style.display = 'none';
    } catch (error) {
        console.error('Error refreshing data:', error);
        const loadingMsg = document.getElementById('loadingMessage');
        if (loadingMsg) {
            loadingMsg.textContent = 'Error loading data. Please try again.';
            loadingMsg.style.display = 'block';
        }
    }
}

// Update KPI cards
function updateKPIs() {
    // Calculate metrics
    const teamCommission = allTransactions.reduce((sum, tx) => sum + (tx.commission || 0), 0);
    const qualifiedTx = allTransactions.filter(tx => tx.qualified !== false).length;
    const totalSales = allTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const activeSetters = new Set(allTransactions.map(tx => tx.setter)).size;

    // Update DOM
    const format = (num, isPercent = false) => {
        if (isPercent) return (num * 100).toFixed(1) + '%';
        return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    };

    document.getElementById('teamCommission').textContent = format(teamCommission);
    document.getElementById('qualifiedTx').textContent = qualifiedTx.toString();
    document.getElementById('totalSales').textContent = format(totalSales);
    document.getElementById('activeSetters').textContent = activeSetters.toString();
}

// Update charts
function updateCharts() {
    updateCommissionOverTimeChart();
    updateCommissionBySetterChart();
}

// Commission Over Time Chart
function updateCommissionOverTimeChart() {
    const ctx = document.getElementById('commissionChart');
    if (!ctx) return;

    // Group by date
    const dateMap = {};
    allTransactions.forEach(tx => {
        const date = tx.date || new Date().toISOString().split('T')[0];
        if (!dateMap[date]) dateMap[date] = 0;
        dateMap[date] += tx.commission || 0;
    });

    const dates = Object.keys(dateMap).sort();
    const commissions = dates.map(d => dateMap[d]);

    // Destroy existing chart
    if (commissionChart) commissionChart.destroy();

    commissionChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Commission',
                data: commissions,
                borderColor: colors.primary,
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: colors.primary,
                pointBorderColor: colors.primary,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: colors.textSecondary,
                        callback: (value) => '$' + value.toLocaleString()
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                x: {
                    ticks: { color: colors.textSecondary },
                    grid: { display: false }
                }
            }
        }
    });
}

// Commission by Setter Chart
function updateCommissionBySetterChart() {
    const ctx = document.getElementById('setterChart');
    if (!ctx) return;

    // Group by setter
    const setterMap = {};
    allTransactions.forEach(tx => {
        const setter = tx.setter || 'Unknown';
        if (!setterMap[setter]) setterMap[setter] = 0;
        setterMap[setter] += tx.commission || 0;
    });

    const setters = Object.keys(setterMap).sort((a, b) => setterMap[b] - setterMap[a]).slice(0, 10);
    const commissions = setters.map(s => setterMap[s]);

    // Generate colors for bars
    const barColors = setters.map((_, i) => {
        const hue = (i * 360 / setters.length) % 360;
        return `hsl(${hue}, 70%, 50%)`;
    });

    // Destroy existing chart
    if (setterChart) setterChart.destroy();

    setterChart = new Chart(ctx, {
        type: 'barH',
        data: {
            labels: setters,
            datasets: [{
                label: 'Commission',
                data: commissions,
                backgroundColor: barColors,
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        color: colors.textSecondary,
                        callback: (value) => '$' + value.toLocaleString()
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    ticks: { color: colors.textSecondary },
                    grid: { display: false }
                }
            }
        }
    });
}

// Update leaderboard
function updateLeaderboard() {
    const setterMap = {};
    allTransactions.forEach(tx => {
        const setter = tx.setter || 'Unknown';
        if (!setterMap[setter]) {
            setterMap[setter] = { name: setter, commission: 0, deals: 0 };
        }
        setterMap[setter].commission += tx.commission || 0;
        setterMap[setter].deals += 1;
    });

    // Sort by commission descending
    const sorted = Object.values(setterMap)
        .sort((a, b) => b.commission - a.commission)
        .slice(0, 10);

    const container = document.getElementById('leaderboardTable');
    if (!container) return;

    container.innerHTML = sorted.map((setter, index) => `
        <div class="leaderboard-row rank-${index + 1}">
            <div class="leaderboard-badge">${index + 1}</div>
            <div class="leaderboard-name">
                <div class="name">${setter.name}</div>
                <div class="deals">${setter.deals} deal${setter.deals !== 1 ? 's' : ''}</div>
            </div>
            <div class="leaderboard-amount">
                <div class="commission">$${setter.commission.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                <div class="currency">commission</div>
            </div>
        </div>
    `).join('');
}
