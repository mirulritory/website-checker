console.log('monitor.js loaded');

const monitorList = document.getElementById('monitorList');
const backHomeBtn = document.getElementById('backHomeBtn');
const noMonitorsMessage = document.getElementById('noMonitorsMessage'); // Get the no monitors message element

function isAuthenticated() {
    return !!localStorage.getItem('token');
}

async function fetchMonitors() {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }
    console.log('Fetching monitors...');
    const res = await fetch('/api/monitors', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    const monitors = await res.json();
    console.log('Fetched monitors:', monitors);

    monitorList.innerHTML = ''; // Clear the existing list

    if (monitors.length === 0) {
        // Show "No monitors found" message if the list is empty
        noMonitorsMessage.style.display = 'block'; // Display the "No monitors found" message
    } else {
        // Hide the "No monitors found" message and populate the monitor list
        noMonitorsMessage.style.display = 'none';
        monitors.forEach(monitor => {
            const li = document.createElement('li');
            li.className = 'monitor-item';

            const urlDiv = document.createElement('div');
            urlDiv.className = 'monitor-url';
            urlDiv.textContent = `${monitor.url}`;

            const stopBtn = document.createElement('button');
            stopBtn.className = 'stop-btn';
            stopBtn.textContent = 'Stop Monitor';
            stopBtn.onclick = async () => {
                await fetch('/api/monitor', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + localStorage.getItem('token')
                    },
                    body: JSON.stringify({ url: monitor.url })
                });
                fetchMonitors(); // Re-fetch monitors after stopping
            };

            li.appendChild(urlDiv);
            li.appendChild(stopBtn);
            monitorList.appendChild(li);
        });
    }
}

if (backHomeBtn) {
    backHomeBtn.onclick = () => {
        window.location.href = 'dashboard.html';
    };
}

if (!isAuthenticated()) {
    window.location.href = 'index.html';
} else {
    fetchMonitors();
}
