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

    // Add global variable to store filtered logs
    let filteredLogs = [];
    let lastRenderedUrl = null;
    let lastLogs = [];

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
        // Show only the latest 5 URLs by default, but allow scrolling for more
        websiteListDiv.innerHTML = '<p class="subtitle">This is a list of history of your monitored websites. Select a website to see the details.</p>';
        const wrapper = document.createElement('div');
        wrapper.className = 'website-list-scroll';
        urls.forEach(url => {
            const div = document.createElement('div');
            div.className = 'website-list-item' + (url === selectedUrl ? ' selected' : '');
            div.textContent = url;
            div.onclick = () => {
                renderDetails(url);
            };
            wrapper.appendChild(div);
        });
        websiteListDiv.appendChild(wrapper);
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
            chartContainer.style.display = 'none';
        } catch (error) {
            console.error('Failed to fetch history:', error);
            detailsCard.innerHTML = '<p>Could not load history data.</p>';
        }
    }

    // Helper to get reason for response code
    function getReason(responseCode, status, errorMessage) {
        // Check if it's maintenance status
        if (status === 'maintenance' && errorMessage) {
            return `Maintenance: ${errorMessage}`;
        }

        const reasons = {
            200: '[OK] The request was successful.',
            201: '[Created] The request has been fulfilled and resulted in a new resource being created.',
            202: '[Accepted] The request has been accepted for processing, but the processing has not been completed.',
            204: '[No Content] The server successfully processed the request, but is not returning any content.',
            301: '[Moved Permanently] The requested page has moved to a new URL.',
            302: '[Found] The requested page has moved temporarily to a new URL.',
            304: '[Not Modified] The requested page has not been modified since the last request.',
            400: '[Bad Request] The request was invalid or cannot be served.',
            401: '[Unauthorized] Authentication is required to access this resource.',
            403: '[Forbidden] The request was forbidden due to insufficient permissions.',
            404: '[Not Found] The requested resource was not found.',
            408: '[Request Timeout] The server timed out waiting for the request.',
            429: '[Too Many Requests] The client has sent too many requests in a given amount of time.',
            500: '[Internal Server Error] The server encountered an unexpected condition that prevented it from fulfilling the request.',
            502: '[Bad Gateway] The server received an invalid response from an upstream server while trying to fulfill the request.',
            503: '[Service Unavailable] The server is currently unavailable due to maintenance or overloading.',
            504: '[Gateway Timeout] The server was acting as a gateway or proxy and did not receive a timely response from the upstream server.',
        };
        if (!responseCode) return '-';
        return reasons[responseCode] || 'Unknown';
    }

    // Helper to filter logs by search
    function filterLogs(logs, search) {
        if (!search) return logs;
        const s = search.toLowerCase();
        return logs.filter(log =>
            (log.status && log.status.toLowerCase().includes(s)) ||
            (getReason(log.response_code).toLowerCase().includes(s)) ||
            (log.latency !== null && String(log.latency).includes(s)) ||
            (log.response_code !== null && String(log.response_code).includes(s)) ||
            (log.ip_address && log.ip_address.toLowerCase().includes(s)) ||
            (log.timestamp && formatDate(log.timestamp).toLowerCase().includes(s))
        );
    }

    // Attach search bar event
    function setupLogSearchBar(logs) {
        const searchBarContainer = document.getElementById('logSearchBarContainer');
        const searchBar = document.getElementById('logSearchBar');
        if (!searchBarContainer || !searchBar) return;
        searchBarContainer.style.display = logs.length > 0 ? '' : 'none';
        searchBar.value = '';
        searchBar.oninput = () => {
            filteredLogs = filterLogs(logs, searchBar.value);
            renderLogTable(filteredLogs);
        };
    }

    // Update the renderLogTable function
    function renderLogTable(logs) {
        const tableBody = document.querySelector('.log-table-scroll tbody');
        if (!tableBody) return;

        tableBody.innerHTML = logs.map(log => {
            let statusColor, statusText;

            if (log.status === 'maintenance') {
                statusColor = 'orange';
                statusText = 'MAINTENANCE';
            } else if (['up', 'online', 'ONLINE'].includes(log.status)) {
                statusColor = 'green';
                statusText = 'ONLINE';
            } else {
                statusColor = 'red';
                statusText = 'OFFLINE';
            }

            const reason = log.status === 'maintenance'
                ? log.error_message || 'Planned maintenance'
                : getReason(log.response_code);

            return `
            <tr>
                <td style="color:${statusColor};font-weight:bold;">
                    ${statusText}
                </td>
                <td>${reason}</td>
                <td>${log.latency ?? '-'}</td>
                <td>${log.response_code ?? '-'}</td>
                <td>${log.ip_address ?? '-'}</td>
                <td>${formatDate(log.timestamp)}</td>
            </tr>
        `;
        }).join('');
    }

    function renderDetails(url) {
        currentUrl = url;
        renderWebsiteList(uniqueUrls, url);

        console.log('Total allLogs:', allLogs.length);
        console.log('Selected URL:', url);

        // Include logs with status 'online', 'offline', or 'maintenance'
        const logs = allLogs.filter(log => log.url === currentUrl &&
            (log.status === 'online' || log.status === 'offline' || log.status === 'maintenance'));
        
        console.log('Filtered logs for', url, ':', logs.length);
        
        lastRenderedUrl = url;
        lastLogs = logs;
        filteredLogs = logs;

        if (logs.length === 0) {
            detailsCard.innerHTML = '<p>No history found for this website.</p>';
            chartContainer.style.display = 'none';
            return;
        }

        const isOnline = (status) => ['up', 'online', 'ONLINE'].includes(status);
        const isMaintenance = (status) => status === 'maintenance';
        const offlineCount = logs.filter(log => !isOnline(log.status) && !isMaintenance(log.status)).length;
        const maintenanceCount = logs.filter(log => isMaintenance(log.status)).length;
        const highestLatency = Math.max(0, ...logs.map(log => log.latency));

        const tableRows = logs.map(log => {
            let statusText, statusColor;
            if (log.status === 'maintenance') {
                statusText = 'MAINTENANCE';
                statusColor = 'orange';
            } else if (isOnline(log.status)) {
                statusText = 'ONLINE';
                statusColor = 'green';
            } else {
                statusText = 'OFFLINE';
                statusColor = 'red';
            }
            
            const reason = log.status === 'maintenance' 
                ? log.error_message || 'Planned maintenance'
                : getReason(log.response_code);
            
            return `
                <tr>
                    <td style="color:${statusColor};font-weight:bold;">
                        ${statusText}
                    </td>
                    <td>${reason}</td>
                    <td>${log.latency ?? '-'}</td>
                    <td>${log.response_code ?? '-'}</td>
                    <td>${log.ip_address ?? '-'}</td>
                    <td>${formatDate(log.timestamp)}</td>
                </tr>
            `;
        }).join('');

        detailsCard.innerHTML = `
            <div class="details-card">
                <div class="details-title">URL: ${currentUrl}</div>
                <div class="details-summary" style="display: flex; gap: 20px; margin-bottom: 10px;">
                    <div class="details-section" style="flex: 1; padding: 10px; background: #f9f9f9; border-radius: 6px; text-align: center;">
                        <b>Total Checks</b><br>${logs.length}
                    </div>
                    <div class="details-section" style="flex: 1; padding: 10px; background: #f9f9f9; border-radius: 6px; text-align: center;">
                        <b>Offline Count</b><br>${offlineCount}
                    </div>
                    <div class="details-section" style="flex: 1; padding: 10px; background: #f9f9f9; border-radius: 6px; text-align: center;">
                        <b>Maintenance</b><br>${maintenanceCount}
                    </div>
                    <div class="details-section" style="flex: 1; padding: 10px; background: #f9f9f9; border-radius: 6px; text-align: center;">
                        <b>Highest Latency</b><br>${highestLatency} ms
                    </div>
                </div>
                <div class="details-section" style="text-align: left;"><b>Recent Checks:</b>
                    <br>
                    <div id="logSearchBarContainer" style="margin-bottom: 10px; margin-top: 10px">
                        <input type="text" id="logSearchBar" placeholder="Search logs..." style="width: 1000px; padding: 10px; border-radius: 6px; border: 1px solid #ccc; font-size: 16px;">
                    </div>
                    <div class="log-table-scroll">
                        <table class="log-table">
                            <thead>
                                <tr>
                                    <th>Status</th><th>Reason</th><th>Latency (ms)</th><th>Response Code</th><th>IP</th><th>Checked At</th>
                                </tr>
                            </thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>`;

        setupLogSearchBar(logs);

        if (logs.length > 1) {
            chartContainer.style.display = 'block';
            renderLatencyChart();
        } else {
            chartContainer.style.display = 'none';
        }
    }


    function renderLatencyChart() {
        if (!currentUrl) return;

            // Only use logs with status 'online', 'offline', or 'maintenance'
    const logs = allLogs.filter(log => log.url === currentUrl && (log.status === 'online' || log.status === 'offline' || log.status === 'maintenance'));
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