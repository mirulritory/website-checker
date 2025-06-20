console.log('monitor.js loaded');

document.addEventListener('DOMContentLoaded', () => {
    const monitorList = document.getElementById('monitorList');
    const noMonitorsMessage = document.getElementById('noMonitorsMessage');
    const backHomeBtn = document.getElementById('backHomeBtn');
    let socket;

    if (backHomeBtn) {
        backHomeBtn.addEventListener('click', () => {
            window.location.href = 'dashboard.html';
        });
    }

    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.host;
        socket = new WebSocket(`${protocol}://${host}`);

        socket.onopen = () => {
            console.log('WebSocket connection established.');
            // Request monitor list once connected
            const token = localStorage.getItem('token');
            if (token) {
                socket.send(JSON.stringify({ type: 'getMonitors', token }));
            }
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'initialMonitors') {
                updateMonitorList(data.monitors);
            } else if (data.type === 'statusUpdate') {
                updateMonitorStatus(data.monitor);
            }
        };

        socket.onclose = () => {
            console.log('WebSocket connection closed. Reconnecting...');
            setTimeout(connectWebSocket, 1000); // Reconnect after 1 second
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            socket.close();
        };
    }

    function updateMonitorList(monitors) {
        monitorList.innerHTML = '';
        if (monitors.length === 0) {
            noMonitorsMessage.style.display = 'block';
            document.getElementById('monitorListContainer').style.display = 'none';
        } else {
            noMonitorsMessage.style.display = 'none';
            document.getElementById('monitorListContainer').style.display = 'block';
            monitors.forEach(monitor => {
                const listItem = createMonitorListItem(monitor);
                monitorList.appendChild(listItem);
            });
        }
    }

    function createMonitorListItem(monitor) {
        const listItem = document.createElement('li');
        listItem.className = 'monitor-item';
        listItem.dataset.url = monitor.url;

        listItem.innerHTML = `
            <div class="monitor-url">${monitor.url}</div>
            <div class="monitor-status" id="status-${btoa(monitor.url)}">Connecting...</div>
            <div class="monitor-latency" id="latency-${btoa(monitor.url)}">N/A</div>
            <div class="monitor-action">
                <button class="stop-btn">Stop Monitoring</button>
            </div>
        `;

        const stopBtn = listItem.querySelector('.stop-btn');
        stopBtn.addEventListener('click', () => stopMonitoring(monitor.url));
        return listItem;
    }

    function updateMonitorStatus(monitor) {
        const statusEl = document.getElementById(`status-${btoa(monitor.url)}`);
        const latencyEl = document.getElementById(`latency-${btoa(monitor.url)}`);

        if (statusEl && latencyEl) {
            statusEl.textContent = monitor.status === 'online' ? 'Online' : 'Offline';
            statusEl.style.color = monitor.status === 'online' ? '#00b518' : '#ff3333';
            latencyEl.textContent = monitor.status === 'online' ? `${monitor.latency} ms` : 'N/A';
        }
    }

    async function stopMonitoring(url) {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('Authentication error. Please sign in again.');
            return;
        }

        try {
            const response = await fetch('/api/monitors/remove', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ url })
            });

            if (response.ok) {
                const listItem = monitorList.querySelector(`[data-url="${url}"]`);
                if (listItem) {
                    listItem.remove();
                }

                if (monitorList.children.length === 0) {
                    noMonitorsMessage.style.display = 'block';
                    document.getElementById('monitorListContainer').style.display = 'none';
                }
            } else {
                const result = await response.json();
                alert(`Error: ${result.error || 'Failed to stop monitoring.'}`);
            }
        } catch (error) {
            console.error('Failed to stop monitoring:', error);
            alert('An error occurred while trying to stop monitoring.');
        }
    }

    if (!localStorage.getItem('token')) {
        window.location.replace('index.html');
    } else {
        connectWebSocket();
    }
});
