document.addEventListener('DOMContentLoaded', () => {
    const websiteListDiv = document.getElementById('websiteList');
    const backHomeBtn = document.getElementById('backHomeBtn');
    const timePeriodSelect = document.getElementById('timePeriod');
    const chartContainer = document.querySelector('.chart-container');
    const latencyChartCanvas = document.getElementById('latencyChart');
    const detailsCard = document.getElementById('detailsCard');

    let allLogs = [];
    let uniqueUrls = [];
    let currentUrl = null;
    let socket;

    function isAuthenticated() {
        return !!localStorage.getItem('token');
    }

    function connectWebSocket() {
        // Only connect if user is authenticated
        if (!localStorage.getItem('token')) {
            console.log('User not authenticated, skipping WebSocket connection');
            return;
        }

        // Close existing connection if any
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log('Closing existing WebSocket connection');
            socket.close();
        }

        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.host;
        socket = new WebSocket(`${protocol}://${host}`);

        socket.onopen = () => {
            console.log('History WebSocket connection established from history.html');
            const token = localStorage.getItem('token');
            if (token) {
                socket.send(JSON.stringify({ type: 'getMonitors', token }));
            }
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'statusUpdate') {
                // Optionally handle real-time updates for history page
                console.log('Received status update:', data.monitor);
            }
        };

        socket.onclose = () => {
            console.log('History WebSocket connection closed. Reconnecting...');
            // Only reconnect if still authenticated
            setTimeout(() => {
                if (localStorage.getItem('token')) {
                    connectWebSocket();
                }
            }, 1000); // Reconnect after 1 second
        };

        socket.onerror = (error) => {
            console.error('History WebSocket error:', error);
            socket.close();
        };
    }

    function formatDate(dateStr) {
        return new Date(dateStr).toLocaleString();
    }

    function renderWebsiteList(urls, selectedUrl) {
        websiteListDiv.innerHTML = '<p class="subtitle">This is a list of history of your monitored websites. Select a website to see the details.</p>';
        urls.forEach(url => {
            const div = document.createElement('div');
            div.className = 'website-list-item' + (url === selectedUrl ? ' selected' : '');
            div.textContent = url;
            div.onclick = () => {
                renderDetails(url);
            };
            websiteListDiv.appendChild(div);
        });
    }

    async function fetchHistory() {
        if (!isAuthenticated()) {
            window.location.href = 'index.html';
            return;
        }
        try {
            const res = await fetch('/api/history', {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
            });
            allLogs = await res.json();
            uniqueUrls = [...new Set(allLogs.map(log => log.url))];
            renderWebsiteList(uniqueUrls, null);
            //detailsCard.innerHTML = '<p>Select a website to see its history.</p>';
            chartContainer.style.display = 'none';
        } catch (error) {
            console.error('Failed to fetch history:', error);
            detailsCard.innerHTML = '<p>Could not load history data.</p>';
        }
    }

    function renderDetails(url) {
        currentUrl = url;
        renderWebsiteList(uniqueUrls, url);

        const logs = allLogs.filter(log => log.url === currentUrl);
        if (logs.length === 0) {
            detailsCard.innerHTML = '<p>No history found for this website.</p>';
            chartContainer.style.display = 'none';
            return;
        }

        const isOnline = (status) => ['up', 'online', 'ONLINE'].includes(status);
        const offlineCount = logs.filter(log => !isOnline(log.status)).length;
        const highestLatency = Math.max(0, ...logs.map(log => log.latency));

        const tableRows = logs.slice(0, 20).map(log => `
            <tr>
                <td style="color:${isOnline(log.status) ? 'green' : 'red'};font-weight:bold;">
                    ${isOnline(log.status) ? 'ONLINE' : 'OFFLINE'}
                </td>
                <td>${log.latency ?? '-'}</td>
                <td>${log.response_code ?? '-'}</td>
                <td>${log.ip_address ?? '-'}</td>
                <td>${formatDate(log.timestamp)}</td>
            </tr>
        `).join('');

        detailsCard.innerHTML = `
            <div class="details-card">
                <div class="details-title">${currentUrl}</div>
                <div class="details-section"><b>Total Checks:</b> ${logs.length}</div>
                <div class="details-section"><b>Offline Count:</b> ${offlineCount}</div>
                <div class="details-section"><b>Highest Latency:</b> ${highestLatency} ms</div>
                <div class="details-section"><b>Recent Checks:</b>
                    <table class="log-table">
                        <thead>
                            <tr>
                                <th>Status</th><th>Latency (ms)</th><th>Response Code</th><th>IP</th><th>Checked At</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </div>`;

        if (logs.length > 1) {
            chartContainer.style.display = 'block';
            renderLatencyChart();
        } else {
            chartContainer.style.display = 'none';
        }
    }

    function renderLatencyChart() {
        if (!currentUrl) return;

        const logs = allLogs.filter(log => log.url === currentUrl);
        const view = timePeriodSelect.value;

        let labels = [];
        let data = [];

        if (view === 'recent') {
            const chartLogs = logs.slice(0, 50).reverse();
            labels = chartLogs.map(log => new Date(log.timestamp).toLocaleTimeString());
            data = chartLogs.map(log => log.latency ?? null);
        } else { // Aggregate by day or month
            const aggregated = {};
            logs.forEach(log => {
                const date = new Date(log.timestamp);
                let key;
                if (view === 'hour') {
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
                } else if (view === 'day') {
                    key = date.toISOString().split('T')[0];
                } else {
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                }
                if (!aggregated[key]) {
                    aggregated[key] = { total: 0, count: 0 };
                }
                if (log.latency !== null) {
                    aggregated[key].total += log.latency;
                    aggregated[key].count++;
                }
            });

            const sortedKeys = Object.keys(aggregated).sort();
            labels = sortedKeys;
            data = sortedKeys.map(key => {
                const item = aggregated[key];
                return item.count > 0 ? Math.round(item.total / item.count) : 0;
            });
        }

        if (window.latencyChartInstance) {
            window.latencyChartInstance.destroy();
        }

        window.latencyChartInstance = new Chart(latencyChartCanvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Average Latency (ms)',
                    data: data,
                    borderColor: '#0a0',
                    backgroundColor: 'rgba(10,160,10,0.1)',
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { title: { display: true, text: 'Latency (ms)' }, beginAtZero: true }
                }
            }
        });
    }

    if (backHomeBtn) {
        backHomeBtn.addEventListener('click', () => {
            // Close WebSocket connection before navigating
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
            window.location.href = 'dashboard.html';
        });
    }

    timePeriodSelect.addEventListener('change', renderLatencyChart);

    // Handle browser/tab closing
    window.addEventListener('beforeunload', () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.close();
        }
    });

    if (!isAuthenticated()) {
        window.location.href = 'index.html';
    } else {
        connectWebSocket();
        fetchHistory();
    }
}); 